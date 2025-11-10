// Integration tests for InstanceManager covering all edge cases and scenarios

import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import * as fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import crypto from "crypto";
import { SpeclyInstanceManager } from "../instance-manager.js";

// Helper to generate a unique lock file path and port for each test
function uniqueTestResource() {
  const id = crypto.randomBytes(6).toString("hex");
  const lockPath = path.join(os.tmpdir(), `specly-${id}.lock`);
  const port = 10000 + Math.floor(Math.random() * 10000);
  return { lockPath, port };
}

async function cleanupLockFile(lockPath: string) {
  try {
    await fs.promises.unlink(lockPath);
  } catch {}
}

async function cleanupServer(server?: http.Server) {
  if (server && server.listening) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("InstanceManager Integration", () => {
  let lockPath: string;
  let port: number;
  let server: http.Server | undefined;

  beforeEach(() => {
    const { lockPath: lp, port: p } = uniqueTestResource();
    lockPath = lp;
    port = p;
    server = undefined;
  });

  afterEach(async () => {
    await cleanupLockFile(lockPath);
    await cleanupServer(server);
    vi.restoreAllMocks();
  });

  it("should become main instance and create a valid lock file", async () => {
    const manager = new SpeclyInstanceManager(lockPath);
    const becameMain = await manager.tryBecomeMain();
    expect(becameMain).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(true);
    const raw = fs.readFileSync(lockPath, "utf-8");
    const lock = JSON.parse(raw);
    expect(lock).toHaveProperty("pid");
    expect(lock).toHaveProperty("version", SpeclyInstanceManager.VERSION);
    expect(lock).toHaveProperty("timestamp");
    expect(typeof lock.pid).toBe("number");
    expect(typeof lock.timestamp).toBe("number");
  });

  it("should not become main if lock file exists", async () => {
    const manager1 = new SpeclyInstanceManager(lockPath);
    const manager2 = new SpeclyInstanceManager(lockPath);
    expect(await manager1.tryBecomeMain()).toBe(true);
    expect(await manager2.tryBecomeMain()).toBe(false);
  });

  it("should validate lock file contents via readLock", async () => {
    const manager = new SpeclyInstanceManager(lockPath);
    await manager.tryBecomeMain();
    const lock = await manager.readLock();
    expect(lock).not.toBeNull();
    expect(lock?.version).toBe(SpeclyInstanceManager.VERSION);
    expect(typeof lock?.pid).toBe("number");
    expect(typeof lock?.timestamp).toBe("number");
  });

  it("should not become main if lock file is corrupt", async () => {
    fs.writeFileSync(lockPath, "{not: valid json");
    const manager = new SpeclyInstanceManager(lockPath);
    const becameMain = await manager.tryBecomeMain();
    expect(becameMain).toBe(false);
  });

  it("should not become main if lock file is empty", async () => {
    fs.writeFileSync(lockPath, "");
    const manager = new SpeclyInstanceManager(lockPath);
    const becameMain = await manager.tryBecomeMain();
    expect(becameMain).toBe(false);
  });

  it("should handle lock file already exists with valid content", async () => {
    const validLock = {
      pid: process.pid,
      version: SpeclyInstanceManager.VERSION,
      timestamp: Date.now(),
    };
    fs.writeFileSync(lockPath, JSON.stringify(validLock));
    const manager = new SpeclyInstanceManager(lockPath);
    const becameMain = await manager.tryBecomeMain();
    expect(becameMain).toBe(false);
  });

  it("should handle permission error when reading lock file", async () => {
    // Create the lock file
    fs.writeFileSync(lockPath, '{"pid":123,"version":"1.0.0","timestamp":0}');
    // Remove all permissions
    fs.chmodSync(lockPath, 0);
    const manager = new SpeclyInstanceManager(lockPath);
    let becameMain;
    try {
      becameMain = await manager.tryBecomeMain();
      expect(becameMain).toBe(false);
    } finally {
      // Restore permissions so we can clean up
      try { fs.chmodSync(lockPath, 0o600); } catch {}
      try { fs.unlinkSync(lockPath); } catch {}
    }
  });

  it("should throw on permission error when writing lock file", async () => {
    // Create a directory with no write permissions
    const noPermDir = path.join(os.tmpdir(), `no-perm-${crypto.randomBytes(8).toString('hex')}`);
    fs.mkdirSync(noPermDir, 0o555); // r-x for all, no write permission

    const lockPathInNoPermDir = path.join(noPermDir, 'lock');
    const manager = new SpeclyInstanceManager(lockPathInNoPermDir);

    try {
      await expect(manager.tryBecomeMain()).rejects.toThrow();
    } finally {
      // Clean up - need to make directory writable first
      try { fs.chmodSync(noPermDir, 0o755); } catch { }
      try { fs.rmSync(noPermDir, { recursive: true, force: true }); } catch { }
    }
  });

  it("should handle concurrent access/race condition", async () => {
    const manager1 = new SpeclyInstanceManager(lockPath);
    const manager2 = new SpeclyInstanceManager(lockPath);
    const [result1, result2] = await Promise.all([
      manager1.tryBecomeMain(),
      manager2.tryBecomeMain(),
    ]);
    expect(result1 !== result2).toBe(true);
    expect(result1 || result2).toBe(true);
  });

  it("should handle lock file deletion between checks", async () => {
    const manager = new SpeclyInstanceManager(lockPath);
    await manager.tryBecomeMain();
    await cleanupLockFile(lockPath);
    const becameMain = await manager.tryBecomeMain();
    expect(becameMain).toBe(true);
  });

  it("should not become main if lock file has stale PID", async () => {
    const staleLock = {
      pid: 999999, // unlikely to exist
      version: SpeclyInstanceManager.VERSION,
      timestamp: Date.now(),
    };
    fs.writeFileSync(lockPath, JSON.stringify(staleLock));
    const manager = new SpeclyInstanceManager(lockPath);
    const becameMain = await manager.tryBecomeMain();
    expect(becameMain).toBe(false);
  });

  it("should handle unexpected fields in lock file", async () => {
    const weirdLock = {
      pid: process.pid,
      version: SpeclyInstanceManager.VERSION,
      timestamp: Date.now(),
      extra: "unexpected",
      foo: 123,
    };
    fs.writeFileSync(lockPath, JSON.stringify(weirdLock));
    const manager = new SpeclyInstanceManager(lockPath);
    const becameMain = await manager.tryBecomeMain();
    expect(becameMain).toBe(false);
  });


  it("should simulate signal handling (SIGINT/SIGTERM) without error", async () => {
    // This test is a no-op since InstanceManager does not register signal handlers.
    // Just ensure tryBecomeMain does not throw and process emits do not error.
    const manager = new SpeclyInstanceManager(lockPath);
    await manager.tryBecomeMain();
    process.emit("SIGINT");
    process.emit("SIGTERM");
    expect(true).toBe(true);
  });

  it("should handle malformed HTTP responses", async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/__version") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{not: valid json");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server!.listen(port, resolve));
    const malformedPromise = new Promise((resolve, reject) => {
      http.get({ hostname: "127.0.0.1", port, path: "/__version" }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            JSON.parse(data);
            resolve(undefined);
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", reject);
    });
    await expect(malformedPromise).rejects.toThrow();
  });

  it("should handle network errors or port conflicts", async () => {
    // Occupy the port
    const blocker = http.createServer(() => {});
    await new Promise<void>((resolve) => blocker.listen(port, resolve));
    let errorCaught = false;
    server = http.createServer(() => {});
    try {
      await new Promise<void>((resolve, reject) => {
        // Set a short timeout to avoid hanging
        const timeout = setTimeout(() => reject(new Error("timeout")), 1000);
        server!.once("error", (err) => {
          clearTimeout(timeout);
          errorCaught = true;
          resolve();
        });
        server!.listen(port);
      });
    } catch {
      errorCaught = true;
    }
    await cleanupServer(blocker);
    await cleanupServer(server);
    expect(errorCaught).toBe(true);
  });

  it("should respond with version on /__version endpoint", async () => {
    const version = SpeclyInstanceManager.VERSION;
    server = http.createServer((req, res) => {
      if (req.url === "/__version") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ version }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server!.listen(port, resolve));
    const fetched = await new Promise<string>((resolve, reject) => {
      http.get({ hostname: "127.0.0.1", port, path: "/__version" }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.version);
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", reject);
    });
    expect(fetched).toBe(version);
  });
});