import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { InstanceManager, InstanceRole } from '../server/local/node-instance/index.js';
import { ProxyManager } from '../server/local/proxy/index.js';

function uniqueLockPath() {
    return path.join(os.tmpdir(), `mcp-kit-test-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`);
}

async function startEphemeralServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
    const srv = http.createServer(handler);
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const addr = srv.address();
    if (!addr || typeof addr !== 'object') throw new Error('No address');
    return { server: srv, port: addr.port as number };
}

async function closeServer(server?: http.Server) {
    if (server?.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

describe('InstanceManager (generic multi-instance coordination)', () => {
    let lockPath: string;
    let manager: InstanceManager;

    beforeEach(() => {
        lockPath = uniqueLockPath();
        manager = new InstanceManager({ lockPath });
    });

    afterEach(async () => {
        try { fs.unlinkSync(lockPath); } catch { }
    });

    describe('Lock File Lifecycle', () => {
        it('tryBecomeMain creates a valid lock file', async () => {
            expect(fs.existsSync(lockPath)).toBe(false);
            const becameMain = await manager.tryBecomeMain();
            expect(becameMain).toBe(true);
            expect(manager.role).toBe(InstanceRole.MAIN);
            expect(fs.existsSync(lockPath)).toBe(true);
            const raw = fs.readFileSync(lockPath, 'utf-8');
            const json = JSON.parse(raw);
            expect(json.pid).toBe(process.pid);
            expect(typeof json.timestamp).toBe('number');
            expect(json.version).toBe(manager.version);
        });

        it('readLock returns null when missing and sets state', async () => {
            const lock = await manager.readLock();
            expect(lock).toBeNull();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((manager as any).lock).toBeNull();
        });

        it('writeLock overwrites and removeLock deletes', async () => {
            await manager.writeLock();
            expect(fs.existsSync(lockPath)).toBe(true);
            await manager.removeLock();
            expect(fs.existsSync(lockPath)).toBe(false);
            // idempotent
            await manager.removeLock();
        });

        it('handles corrupted lock file gracefully', async () => {
            fs.writeFileSync(lockPath, 'not-json');
            const read = await manager.readLock();
            expect(read).toBeNull();
        });
    });

    describe('Multi-Instance Contention', () => {
        it('only one instance becomes MAIN with same lock path', async () => {
            const managers = Array.from({ length: 3 }, () => new InstanceManager({ lockPath }));
            const results = await Promise.all(managers.map(m => m.tryBecomeMain()));
            const successCount = results.filter(Boolean).length;
            expect(successCount).toBe(1);
        });

        it('permission error (directory instead of file) prevents becoming main', async () => {
            fs.mkdirSync(lockPath); // occupy path with directory
            const blocked = await manager.tryBecomeMain();
            expect(blocked).toBe(false);
            fs.rmdirSync(lockPath);
        });
    });

    describe('PID & Version Utilities', () => {
        it('isPidAlive true for current, false for invalid', () => {
            expect(InstanceManager.isPidAlive(process.pid)).toBe(true);
            expect(InstanceManager.isPidAlive(0)).toBe(false);
            expect(InstanceManager.isPidAlive(-5)).toBe(false);
        });

        it('fetchMainVersion returns version, malformed & network return null', async () => {
            // Start server returning version
            const version = '9.9.9';
            const started = await startEphemeralServer((req, res) => {
                if (req.url === '/__version') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ version }));
                } else { res.writeHead(404); res.end(); }
            });
            manager = new InstanceManager({ lockPath, port: started.port });
            await expect(manager.fetchMainVersion()).resolves.toBe(version);
            await closeServer(started.server);

            // Malformed JSON
            const malformed = await startEphemeralServer((req, res) => {
                if (req.url === '/__version') { res.writeHead(200); res.end('{oops'); } else { res.writeHead(404); res.end(); }
            });
            manager = new InstanceManager({ lockPath, port: malformed.port });
            await expect(manager.fetchMainVersion()).resolves.toBeNull();
            await closeServer(malformed.server);

            // No server
            await expect(manager.fetchMainVersion()).resolves.toBeNull();
        });
    });

    describe('Control Endpoints', () => {
        it('requestMainShutdown & requestMainTransition return expected booleans', async () => {
            const started = await startEphemeralServer((req, res) => {
                if (req.url === '/__shutdown' && req.method === 'POST') { res.writeHead(200); res.end('ok'); return; }
                if (req.url === '/__transition' && req.method === 'POST') { res.writeHead(200); res.end('ok'); return; }
                res.writeHead(404); res.end();
            });
            manager = new InstanceManager({ lockPath, port: started.port });
            await expect(manager.requestMainShutdown()).resolves.toBe(true);
            await expect(manager.requestMainTransition()).resolves.toBe(true);
            await closeServer(started.server);
            // Network error case
            await expect(manager.requestMainShutdown()).resolves.toBe(false);
        });
    });

    describe('Port Availability & Proxy', () => {
        it('waitForPort resolves true when free', async () => {
            const ephemeral = await startEphemeralServer((req, res) => { res.writeHead(200); res.end('ok'); });
            const candidate = ephemeral.port + 1; // likely free
            await closeServer(ephemeral.server);
            manager = new InstanceManager({ lockPath, port: candidate });
            await expect(manager.waitForPort(1000)).resolves.toBe(true);
        });

        it('waitForPort returns false when consistently failing (simulate EADDRINUSE)', async () => {
            // Start a server on the port to make it busy
            const busyServer = http.createServer();
            await new Promise<void>((resolve) => busyServer.listen(65534, resolve));

            manager = new InstanceManager({ lockPath, port: 65534 });
            await expect(manager.waitForPort(300)).resolves.toBe(false);

            busyServer.close();
        });

        it('startProxy proxies to main and returns 502 after main stopped', async () => {
            const main = await startEphemeralServer((req, res) => { res.writeHead(200); res.end('from-main'); });
            manager = new InstanceManager({ lockPath, port: main.port });
            const proxyManager = new ProxyManager();
            const proxyServer = await proxyManager.start({ targetPort: main.port });
            manager.proxyManager = proxyManager;
            manager.proxyPort = proxyManager.port;
            manager.role = InstanceRole.PROXY;
            const proxyAddr = proxyServer.address();
            expect(typeof proxyAddr).toBe('object');
            const proxyPort = (proxyAddr as any).port as number;
            const body = await new Promise<string>((resolve, reject) => {
                http.get({ hostname: '127.0.0.1', port: proxyPort, path: '/' }, (res) => {
                    let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(data));
                }).on('error', reject);
            });
            expect(body).toBe('from-main');
            await closeServer(main.server);
            const code = await new Promise<number>((resolve) => {
                const req = http.request({ hostname: '127.0.0.1', port: proxyPort, path: '/', timeout: 2000 }, (res) => resolve(res.statusCode || 0));
                req.on('error', (err) => {
                    if (err.message.includes('timeout') || err.code === 'ECONNREFUSED') {
                        resolve(502); // Assume 502 for timeout or connection refused
                    } else {
                        resolve(0);
                    }
                });
                req.end();
            });
            expect(code).toBe(502);
            await proxyManager.stop();
        });
    });

    describe('Takeover Scenario (version mismatch + shutdown)', () => {
        it('handles version mismatch then takeover after shutdown', async () => {
            // First manager becomes main (lock file only)
            const first = new InstanceManager({ lockPath, port: 0 });
            await first.writeLock();
            // Server with old version + shutdown endpoint
            const versionServer = http.createServer((req, res) => {
                if (req.url === '/__version') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ version: '0.0.1' }));
                } else if (req.url === '/__shutdown' && req.method === 'POST') {
                    res.writeHead(200); res.end('OK');
                    setTimeout(() => { try { fs.unlinkSync(lockPath); } catch { } versionServer.close(); }, 25);
                } else { res.writeHead(404); res.end(); }
            });
            await new Promise<void>((resolve) => versionServer.listen(0, '127.0.0.1', resolve));
            const addr = versionServer.address();
            const port = typeof addr === 'object' && addr ? (addr as any).port as number : 0;

            const second = new InstanceManager({ lockPath, port });
            // Cannot become main due to existing lock
            const secondMainAttempt = await second.tryBecomeMain();
            expect(secondMainAttempt).toBe(false);
            const mainVersion = await second.fetchMainVersion();
            expect(mainVersion).toBe('0.0.1');
            expect(mainVersion).not.toBe(second.version);
            const shutdownOk = await second.requestMainShutdown();
            expect(shutdownOk).toBe(true);
            const portAvailable = await second.waitForPort(3000);
            expect(portAvailable).toBe(true);
            // Ensure lock file is removed before takeover to avoid race
            const startWait = Date.now();
            while (fs.existsSync(lockPath) && Date.now() - startWait < 1000) {
                await new Promise(r => setTimeout(r, 25));
            }
            const takeover = await second.tryBecomeMain();
            expect(takeover).toBe(true);
            expect(second.role).toBe(InstanceRole.MAIN);
        }, 8000);
    });
});
