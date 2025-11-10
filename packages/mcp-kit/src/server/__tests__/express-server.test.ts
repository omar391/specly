import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { createServer as createHttpServer } from 'http';
import { EventEmitter } from 'events';
import { ExpressServer } from '../express/server.js';
import type { MCPToolHandlers } from '../express/mcp-adapter.js';

const mockServer = {
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
};

const mockTransport = {
    handleRequest: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: vi.fn().mockImplementation(() => mockServer),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
    StreamableHTTPServerTransport: vi.fn().mockImplementation(() => mockTransport),
}));

describe('ExpressServer (mcp-kit)', () => {
    let server: ExpressServer;
    let toolHandlers: MCPToolHandlers;

    beforeEach(() => {
        toolHandlers = {
            listTools: vi.fn().mockResolvedValue({ tools: [] }),
            handleToolCall: vi.fn().mockResolvedValue({ result: 'ok' }),
        };

        mockTransport.handleRequest = vi.fn().mockImplementation(async (_req, res, body) => {
            if (body?.method === 'tools/list') {
                await toolHandlers.listTools();
                res.status(200).json({ result: { tools: [] } });
                return;
            }

            if (body?.method === 'tools/call') {
                const name = body?.params?.name ?? body?.params?.tool ?? body?.id;
                const args = body?.params?.arguments ?? body?.params?.args ?? {};
                await toolHandlers.handleToolCall(name, args);
                res.status(200).json({ result: { content: [] } });
                return;
            }

            res.status(400).json({ error: 'unsupported' });
        });
    });

    afterEach(async () => {
        if (server) {
            await server.stop();
        }
        vi.clearAllMocks();
    });

    describe('constructor & middleware', () => {
        it('creates server and exposes app', () => {
            server = new ExpressServer({ port: 3001, dev: true });
            expect(server).toBeDefined();
            expect(server.app).toBeDefined();
        });

        it('supports CORS preflight and localhost origin in dev', async () => {
            server = new ExpressServer({ port: 3001, dev: true });
            const app = server.app;

            const preflight = await supertest(app)
                .options('/api/test')
                .set('Origin', 'http://localhost:3000')
                .set('Access-Control-Request-Method', 'POST');

            expect(preflight.status).toBe(200);
            expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:3000');
            expect(preflight.headers['access-control-allow-methods']).toContain('POST');

            const fallback = await supertest(app)
                .get('/health')
                .set('Origin', 'http://localhost:9999');

            expect(fallback.headers['access-control-allow-origin']).toBe('*');
        });

        it('parses JSON bodies', async () => {
            server = new ExpressServer({ port: 3001, dev: true });
            const app = server.app;
            let body: unknown = null;

            app.post('/json', (req, res) => {
                body = req.body;
                res.json({ ok: true });
            });

            await supertest(app)
                .post('/json')
                .set('Content-Type', 'application/json')
                .send({ hello: 'world' })
                .expect(200);

            expect(body).toEqual({ hello: 'world' });
        });
    });

    describe('health and root endpoints', () => {
        it('returns health payload with metrics', async () => {
            const metricsCollector = { snapshot: vi.fn().mockReturnValue({ requests: 42 }) };
            server = new ExpressServer({ port: 3002, dev: true });
            server.setupHealthAndRoot(metricsCollector);

            const response = await supertest(server.app).get('/health');
            expect(response.status).toBe(200);
            expect(response.body.status).toBe('healthy');
            expect(response.body.metrics).toEqual({ requests: 42 });
        });

        it('omits api endpoint from health when apiBase is null', async () => {
            server = new ExpressServer({ port: 3002, dev: true, endpoints: { apiBase: null } });
            server.setupHealthAndRoot();

            const response = await supertest(server.app).get('/health');
            expect(response.status).toBe(200);
            expect(response.body.endpoints.api).toBeUndefined();
            expect(response.body.endpoints).toMatchObject({ mcp: '/mcp', health: '/health', mcp_sse: '/sse' });
        });

        it('returns API discovery information on root', async () => {
            server = new ExpressServer({ port: 3002, dev: true });
            server.setupHealthAndRoot();

            const response = await supertest(server.app).get('/');
            expect(response.status).toBe(200);
            expect(response.body.endpoints).toMatchObject({ api: '/api', mcp: '/mcp' });
        });

        it('omits api endpoint when apiBase is null', async () => {
            server = new ExpressServer({ port: 3002, dev: true, endpoints: { apiBase: null } });
            server.setupHealthAndRoot();

            const response = await supertest(server.app).get('/');
            expect(response.status).toBe(200);
            expect(response.body.endpoints.api).toBeUndefined();
            expect(response.body.endpoints).toMatchObject({ mcp: '/mcp', health: '/health' });
        });
    });

    describe('MCP endpoint integration', () => {
        beforeEach(() => {
            server = new ExpressServer({ port: 3003, dev: true });
            server.attachMcp(toolHandlers);
        });

        it('creates sessions and handles MCP POST', async () => {
            const response = await supertest(server.app)
                .post('/mcp')
                .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

            expect(response.status).toBe(200);
            expect(response.headers['mcp-session-id']).toBeDefined();
            expect(toolHandlers.listTools).toHaveBeenCalled();
        });

        it('reuses session when header provided', async () => {
            const first = await supertest(server.app)
                .post('/mcp')
                .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

            const sessionId = first.headers['mcp-session-id'];
            expect(sessionId).toBeDefined();

            await supertest(server.app)
                .post('/mcp')
                .set('Mcp-Session-Id', sessionId as string)
                .send({ jsonrpc: '2.0', method: 'tools/call', id: 2, params: { name: 'foo', arguments: {} } });

            expect(toolHandlers.handleToolCall).toHaveBeenCalledWith('foo', {});
        });

        it('requires session header for SSE endpoint', async () => {
            const response = await supertest(server.app).get('/mcp');
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Mcp-Session-Id header is required');
        });

        it('deletes sessions on DELETE', async () => {
            const first = await supertest(server.app)
                .post('/mcp')
                .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });
            const sessionId = first.headers['mcp-session-id'] as string;

            const deletion = await supertest(server.app)
                .delete('/mcp')
                .set('Mcp-Session-Id', sessionId);

            expect(deletion.status).toBe(200);
            expect(deletion.body.message).toBe('Session terminated');
        });
    });

    describe('server lifecycle', () => {
        it('starts and stops HTTP server', async () => {
            server = new ExpressServer({ port: 0, dev: true });
            server.setupHealthAndRoot();

            await server.start();
            await expect(server.stop()).resolves.toBeUndefined();
        });

        it('rejects when port already in use', async () => {
            server = new ExpressServer({ port: 4242, dev: true });
            const listenSpy = vi.spyOn(server.app, 'listen').mockImplementation((...args: any[]) => {
                const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;
                const fakeServer = new EventEmitter() as unknown as ReturnType<typeof createHttpServer>;
                (fakeServer as unknown as { close: (cb?: () => void) => ReturnType<typeof createHttpServer> }).close = (cb) => {
                    cb?.();
                    return fakeServer;
                };
                setImmediate(() => {
                    const err = Object.assign(new Error('Port in use'), { code: 'EADDRINUSE' });
                    fakeServer.emit('error', err);
                });
                return fakeServer;
            });

            try {
                await expect(server.start()).rejects.toThrow('Port 4242 is already in use');
            } finally {
                listenSpy.mockRestore();
            }
        });
    });

    describe('error handling', () => {
        beforeEach(() => {
            server = new ExpressServer({ port: 3004, dev: true });
            server.attachMcp(toolHandlers);
        });

        it('responds with 500 when transport fails', async () => {
            mockTransport.handleRequest = vi.fn().mockRejectedValueOnce(new Error('boom'));

            const response = await supertest(server.app)
                .post('/mcp')
                .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

            expect(response.status).toBe(500);
            expect(response.body.error).toContain('Failed to process MCP request');
            expect(response.body.details).toBe('boom');
        });

        it('omits details in production mode', async () => {
            const prodServer = new ExpressServer({ port: 3004, dev: false });
            prodServer.attachMcp(toolHandlers);
            mockTransport.handleRequest = vi.fn().mockRejectedValueOnce(new Error('boom'));

            const response = await supertest(prodServer.app)
                .post('/mcp')
                .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 });

            expect(response.body.details).toBeUndefined();
            expect(response.body.stack).toBeUndefined();

            await prodServer.stop();
        });
    });
});
