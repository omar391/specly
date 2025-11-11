import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import crypto from "crypto";

import { InstanceManager, InstanceRole } from "@omar391/mcp-kit/server/local/node-instance";
import { SpeclyServer } from "../../index.js";
import { GlobalDatabaseService } from "../../database/global-queries.js";
import { BackgroundJobsService } from "../../services/background-jobs-service.js";
import { DrizzleDatabaseManager, DatabaseType } from "../../database/drizzle-connection.js";

function uniqueLockPath() {
    const id = crypto.randomBytes(6).toString("hex");
    return path.join(os.tmpdir(), `specly-unit-${id}.lock`);
}

async function startSimpleServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address !== "object") throw new Error("No server address");
    return { server, port: address.port as number };
}

async function closeServer(server?: http.Server) {
    if (server?.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

describe("InstanceManager and SpeclyServer Unit", () => {
    let lockPath: string;
    let manager: InstanceManager;
    let speclyServer: SpeclyServer;
    let server: http.Server | undefined;

    beforeEach(async () => {
        lockPath = uniqueLockPath();
        manager = new InstanceManager({ lockPath, port: 0, getVersion: () => "test" });
        speclyServer = new SpeclyServer();
        // Initialize with in-memory db for testing
        const gdb = new GlobalDatabaseService(new DrizzleDatabaseManager(":memory:", DatabaseType.GLOBAL));
        await gdb.initialize();
        (speclyServer as any).globalDbService = gdb;
        server = undefined;
    });

    afterEach(async () => {
        try { fs.unlinkSync(lockPath); } catch { }
        await closeServer(server);
        vi.restoreAllMocks();
        delete process.env.SPECLY_GC_ENABLED;
        delete process.env.SPECLY_GC_TRANSIENT_SESSION_HOURS;
        delete process.env.SPECLY_GC_SOFT_DELETE_DAYS;
    });

    it("readLock returns null and clears state when file missing", async () => {
        expect(fs.existsSync(lockPath)).toBe(false);
        const res = await manager.readLock();
        expect(res).toBeNull();
        // @ts-expect-no-error internal state becomes null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((manager as any).lock).toBeNull();
    });

    it("writeLock writes a valid lock and removeLock deletes it", async () => {
        await manager.writeLock();
        expect(fs.existsSync(lockPath)).toBe(true);
        const raw = fs.readFileSync(lockPath, "utf-8");
        const json = JSON.parse(raw);
        expect(typeof json.pid).toBe("number");
        expect(typeof json.timestamp).toBe("number");
        expect(json.version).toBe(manager.version);

        await manager.removeLock();
        expect(fs.existsSync(lockPath)).toBe(false);

        // removeLock should not throw if already removed
        await manager.removeLock();
    });

    it("isPidAlive returns true for current PID and false for invalid", () => {
        expect(InstanceManager.isPidAlive(process.pid)).toBe(true);
        expect(InstanceManager.isPidAlive(0)).toBe(false);
        expect(InstanceManager.isPidAlive(-123)).toBe(false);
    });

    it("fetchMainVersion returns version from server and handles malformed JSON and errors", async () => {
        // Happy path
        const version = "9.9.9";
        const started = await startSimpleServer((req, res) => {
            if (req.url === "/__version") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ version }));
            } else {
                res.writeHead(404); res.end();
            }
        });
        server = started.server;
        manager.port = started.port;
        await expect(manager.fetchMainVersion()).resolves.toBe(version);

        // Malformed JSON
        await closeServer(server);
        const malformed = await startSimpleServer((req, res) => {
            if (req.url === "/__version") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end("{not: json");
            } else { res.writeHead(404); res.end(); }
        });
        server = malformed.server;
        manager.port = malformed.port;
        await expect(manager.fetchMainVersion()).resolves.toBeNull();

        // Network error (no server)
        await closeServer(server);
        await expect(manager.fetchMainVersion()).resolves.toBeNull();
    });

    // Request/transition behavior covered in mcp-kit; keep minimal smoke here
    it("requestMainShutdown returns boolean and handles errors", async () => {
        // 200 OK
        const ok = await startSimpleServer((req, res) => {
            if (req.url === "/__shutdown" && req.method === "POST") {
                res.writeHead(200); res.end("ok");
            } else { res.writeHead(404); res.end(); }
        });
        server = ok.server; manager.port = ok.port;
        await expect(manager.requestMainShutdown()).resolves.toBe(true);

        // 404
        const notFound = await startSimpleServer((req, res) => {
            res.writeHead(404); res.end();
        });
        await closeServer(server); server = notFound.server; manager.port = notFound.port;
        await expect(manager.requestMainShutdown()).resolves.toBe(false);

        // Network error
        await closeServer(server);
        await expect(manager.requestMainShutdown()).resolves.toBe(false);
    });

    // Port availability semantics tested in mcp-kit
    it("waitForPort basic smoke on free", async () => {
        const freePortServer = await startSimpleServer((req, res) => { res.writeHead(200); res.end("ok"); });
        const candidatePort = freePortServer.port + 1;
        await closeServer(freePortServer.server);
        manager.port = candidatePort;
        await expect(manager.waitForPort(500)).resolves.toBeTypeOf('boolean');
    });

    // Error simulation covered in mcp-kit suite

    it("startProxy proxies HTTP to the main instance and returns 502 on target error", async () => {
        // Start a main server that responds
        const main = await startSimpleServer((req, res) => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("from-main");
        });
        const mainPort = main.port;
        manager.port = mainPort;

        // Start proxy
        const proxyServer = await manager.startProxy();
        const proxyAddr = proxyServer.address();
        expect(typeof proxyAddr).toBe("object");
        const proxyPort = (proxyAddr as any).port as number;

        // Request through proxy
        const body = await new Promise<string>((resolve, reject) => {
            http.get({ hostname: "127.0.0.1", port: proxyPort, path: "/" }, (res) => {
                let data = ""; res.on("data", (c) => data += c); res.on("end", () => resolve(data));
            }).on("error", reject);
        });
        expect(body).toBe("from-main");

        // Now stop main and ensure proxy returns 502
        await closeServer(main.server);
        const code = await new Promise<number>((resolve) => {
            const req = http.request({ hostname: "127.0.0.1", port: proxyPort, path: "/" }, (res) => {
                resolve(res.statusCode || 0);
            });
            req.on("error", () => resolve(0));
            req.end();
        });
        expect(code).toBe(502);

        await closeServer(proxyServer);
    });

    it("startBackgroundJobs respects env disabled, starts and stops when enabled", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });

        // Env disabled -> no start
        process.env.SPECLY_GC_ENABLED = "false";
        speclyServer.startBackgroundJobs();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"msg":"Background jobs disabled via SPECLY_GC_ENABLED=false"'));

        // Enabled, custom thresholds via env
        process.env.SPECLY_GC_ENABLED = "true";
        process.env.SPECLY_GC_TRANSIENT_SESSION_HOURS = "12";
        process.env.SPECLY_GC_SOFT_DELETE_DAYS = "45";
        speclyServer.startBackgroundJobs();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"msg":"Background jobs started"'));
        // stop
        speclyServer.stopBackgroundJobs();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"msg":"Background jobs stopped"'));

        // Simulate initial sweep failure by temporarily monkey-patching prototype before start
        const origRunAll = (BackgroundJobsService as any).prototype.runAll;
        (BackgroundJobsService as any).prototype.runAll = () => Promise.reject(new Error("boom"));
        speclyServer.startBackgroundJobs();
        await new Promise((r) => setTimeout(r, 0));
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('"msg":"Initial GC sweep failed"'));
        speclyServer.stopBackgroundJobs();
        // restore
        (BackgroundJobsService as any).prototype.runAll = origRunAll;

        logSpy.mockRestore();
        errSpy.mockRestore();
    });
});
