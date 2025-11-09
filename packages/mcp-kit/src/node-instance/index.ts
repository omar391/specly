// Node multi-instance manager placeholder
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import type { Server as HttpServer } from 'http';

export interface InstanceLock {
    pid: number;
    version: string;
    timestamp: number;
}

export enum InstanceRole {
    MAIN = 'main',
    PROXY = 'proxy',
    UNKNOWN = 'unknown',
}

export interface BaseInstanceOptions {
    lockPath?: string;
    port?: number;
    version?: string;
}

/**
 * BaseInstanceManager: generic multi-instance coordinator with lock + proxy.
 * Framework-agnostic; no app-specific dependencies. Extend to add app hooks.
 */
export class BaseInstanceManager {
    static defaultVersion = '0.1.0';

    private _lockPath: string;
    private _port: number;
    private _version: string;

    role: InstanceRole = InstanceRole.UNKNOWN;
    proxyPort: number | null = null;
    lock: InstanceLock | null = null;

    constructor(opts: BaseInstanceOptions = {}) {
        this._lockPath = opts.lockPath ?? path.join(os.tmpdir(), 'mcp-kit-8989.lock');
        this._port = opts.port ?? 8989;
        this._version = opts.version ?? (this.constructor as typeof BaseInstanceManager).defaultVersion;
    }

    get lockPath(): string {
        return this._lockPath;
    }

    set lockPath(value: string) {
        this._lockPath = value;
    }

    get port(): number {
        return this._port;
    }

    set port(value: number) {
        this._port = value;
    }

    get version(): string {
        return this._version;
    }

    set version(value: string) {
        this._version = value;
    }

    async tryBecomeMain(): Promise<boolean> {
        try {
            const fd = fs.openSync(this.lockPath, 'wx');
            const lock: InstanceLock = {
                pid: process.pid,
                version: this.version,
                timestamp: Date.now(),
            };
            fs.writeFileSync(fd, JSON.stringify(lock), { encoding: 'utf-8' });
            fs.closeSync(fd);
            this.lock = lock;
            this.role = InstanceRole.MAIN;
            return true;
        } catch (err: any) {
            if (err.code === 'EEXIST') return false;
            throw err;
        }
    }

    async readLock(): Promise<InstanceLock | null> {
        if (!fs.existsSync(this.lockPath)) {
            this.lock = null;
            return null;
        }
        try {
            const raw = fs.readFileSync(this.lockPath, 'utf-8');
            const lock: InstanceLock = JSON.parse(raw);
            if (
                typeof lock.pid === 'number' &&
                typeof lock.version === 'string' &&
                typeof lock.timestamp === 'number'
            ) {
                this.lock = lock;
                return lock;
            }
            return null;
        } catch {
            return null;
        }
    }

    async writeLock(): Promise<void> {
        const lock: InstanceLock = {
            pid: process.pid,
            version: this.version,
            timestamp: Date.now(),
        };
        fs.writeFileSync(this.lockPath, JSON.stringify(lock), { encoding: 'utf-8', flag: 'w' });
        this.lock = lock;
    }

    async removeLock(): Promise<void> {
        try { fs.unlinkSync(this.lockPath); } catch { }
    }

    static isPidAlive(pid: number): boolean {
        if (pid <= 0) return false;
        try { process.kill(pid, 0); return true; } catch { return false; }
    }

    async fetchMainVersion(): Promise<string | null> {
        return new Promise((resolve) => {
            const req = http.get(
                { hostname: '127.0.0.1', port: this.port, path: '/__version', timeout: 2000 },
                (res) => {
                    let data = '';
                    res.on('data', (c) => (data += c));
                    res.on('end', () => {
                        try { const json = JSON.parse(data); resolve(json.version || null); } catch { resolve(null); }
                    });
                }
            );
            req.on('error', () => resolve(null));
            req.end();
        });
    }

    async requestMainShutdown(): Promise<boolean> {
        return new Promise((resolve) => {
            const req = http.request(
                { hostname: '127.0.0.1', port: this.port, path: '/__shutdown', method: 'POST', timeout: 2000 },
                (res) => resolve(res.statusCode === 200)
            );
            req.on('error', () => resolve(false));
            req.end();
        });
    }

    async requestMainTransition(): Promise<boolean> {
        return new Promise((resolve) => {
            const req = http.request(
                { hostname: '127.0.0.1', port: this.port, path: '/__transition', method: 'POST', timeout: 2000 },
                (res) => resolve(res.statusCode === 200)
            );
            req.on('error', () => resolve(false));
            req.end();
        });
    }

    async waitForPort(timeoutMs = 10000): Promise<boolean> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const s = http.createServer();
                await new Promise((resolve, reject) => {
                    s.once('error', reject);
                    s.listen(this.port, () => { s.close(); resolve(true as any); });
                });
                return true;
            } catch {
                await new Promise((r) => setTimeout(r, 300));
            }
        }
        return false;
    }

    async startProxy(config?: { port?: number }): Promise<HttpServer> {
        const targetPort = config?.port ?? this.port;
        const httpProxy = (await import('http-proxy')).default;
        const proxy = httpProxy.createProxyServer({
            target: `http://127.0.0.1:${targetPort}`,
            ws: true,
            changeOrigin: true,
            autoRewrite: true,
        });

        const server = http.createServer((req, res) => {
            proxy.web(req, res, {}, (err: Error & { code?: string }) => {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('Proxy error: ' + err?.message);
            });
        });

        server.on('upgrade', (req, socket, head) => {
            proxy.ws(req, socket as any, head);
        });

        await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => resolve()); });
        const address = server.address();
        if (typeof address === 'object' && address && 'port' in address) {
            this.proxyPort = address.port as number;
        }
        this.role = InstanceRole.PROXY;
        return server;
    }
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMCPClient } from '../client.js';

export interface StdioProxyConfig {
    port: number;
    serverName?: string;
    serverVersion?: string;
    clientName?: string;
    debug?: boolean;
}

export async function startStdioProxy(opts: StdioProxyConfig | { mainPort: number }) {
    const port = (opts as any).mainPort ?? (opts as StdioProxyConfig).port;
    const serverName = (opts as StdioProxyConfig).serverName ?? 'mcp-kit';
    const serverVersion = (opts as StdioProxyConfig).serverVersion ?? BaseInstanceManager.defaultVersion;
    const clientName = (opts as StdioProxyConfig).clientName ?? `${serverName}-proxy`;
    const debug = (opts as StdioProxyConfig).debug ?? false;

    const originalLog = console.log;
    const originalError = console.error;
    if (debug) {
        console.log = (...args) => originalError('[DEBUG]', ...args);
        console.error = (...args) => originalError('[DEBUG]', ...args);
    }

    if (debug) {
        console.error(`[DEBUG] Starting ${serverName} MCP server in STDIO PROXY mode`);
    }

    const { client: mcpClient, close: closeClient } = await createMCPClient({
        port,
        clientName,
        version: serverVersion,
    });

    if (debug) {
        console.error('[DEBUG] MCP client connected to main instance');
    }

    const server = new Server(
        { name: serverName, version: serverVersion },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return await mcpClient.listTools();
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            return await mcpClient.callTool({ name, arguments: args });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Proxy error: ${errorMessage}` }],
                isError: true,
            } as any;
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    if (debug) {
        console.error(`[DEBUG] ${serverName} MCP proxy server connected to stdio`);
    }

    const shutdownHandler = async () => {
        if (debug) {
            console.error('[DEBUG] Proxy shutting down...');
        }
        await closeClient();
        process.exit(0);
    };

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
}

export interface InstanceManagerLike {
    port: number;
    tryBecomeMain(): Promise<boolean>;
    readLock(): Promise<InstanceLock | null>;
    removeLock(): Promise<void>;
    fetchMainVersion(): Promise<string | null>;
    requestMainTransition(): Promise<boolean>;
    waitForPort(timeoutMs?: number): Promise<boolean>;
}

export interface CoordinateInstanceOptions<M extends InstanceManagerLike = BaseInstanceManager> {
    instanceManager: M;
    desiredVersion?: string;
    waitForPortTimeoutMs?: number;
    removeStaleLock?: boolean;
}

export interface CoordinateInstanceMainResult<M extends InstanceManagerLike> {
    status: 'main';
    role: InstanceRole.MAIN;
    instanceManager: M;
    reason: 'initial' | 'lock-missing' | 'stale-lock' | 'version-transition';
    previousVersion?: string | null;
}

export interface CoordinateInstanceProxyResult<M extends InstanceManagerLike> {
    status: 'proxy';
    role: InstanceRole.PROXY;
    instanceManager: M;
    reason: 'existing-main';
    mainVersion: string | null;
}

export type CoordinateInstanceResult<M extends InstanceManagerLike> =
    | CoordinateInstanceMainResult<M>
    | CoordinateInstanceProxyResult<M>;

/**
 * Coordinate multi-instance startup, handling stale lock recovery and version upgrades.
 */
export async function coordinateInstanceRole<M extends InstanceManagerLike>(
    options: CoordinateInstanceOptions<M>
): Promise<CoordinateInstanceResult<M>> {
    const { instanceManager, waitForPortTimeoutMs = 10000, removeStaleLock = true } = options;
    const desiredVersion = options.desiredVersion ?? (instanceManager as unknown as { version?: string }).version ?? BaseInstanceManager.defaultVersion;

    if (await instanceManager.tryBecomeMain()) {
        return {
            status: 'main',
            role: InstanceRole.MAIN,
            instanceManager,
            reason: 'initial',
        } satisfies CoordinateInstanceMainResult<M>;
    }

    let inspectedLock: InstanceLock | null = null;
    if (removeStaleLock) {
        inspectedLock = await instanceManager.readLock();
        const isLockStale = !inspectedLock || !BaseInstanceManager.isPidAlive(inspectedLock.pid);
        if (isLockStale) {
            await instanceManager.removeLock();
            if (await instanceManager.tryBecomeMain()) {
                return {
                    status: 'main',
                    role: InstanceRole.MAIN,
                    instanceManager,
                    reason: inspectedLock ? 'stale-lock' : 'lock-missing',
                } satisfies CoordinateInstanceMainResult<M>;
            }
        }
    }

    const mainVersion = await instanceManager.fetchMainVersion();

    if (mainVersion !== desiredVersion) {
        const transitioned = await instanceManager.requestMainTransition();
        if (!transitioned) {
            throw new Error('Failed to transition existing main instance to proxy mode.');
        }

        await instanceManager.waitForPort(waitForPortTimeoutMs);
        await instanceManager.removeLock();

        if (await instanceManager.tryBecomeMain()) {
            return {
                status: 'main',
                role: InstanceRole.MAIN,
                instanceManager,
                reason: 'version-transition',
                previousVersion: mainVersion,
            } satisfies CoordinateInstanceMainResult<M>;
        }

        throw new Error('Failed to assume main role after successful transition request.');
    }

    return {
        status: 'proxy',
        role: InstanceRole.PROXY,
        instanceManager,
        reason: 'existing-main',
        mainVersion,
    } satisfies CoordinateInstanceProxyResult<M>;
}
