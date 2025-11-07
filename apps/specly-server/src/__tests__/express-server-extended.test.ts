import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

import { ExpressServer } from '../server/express-server.js';

// Minimal tool handlers to allow MCP server to connect and handle requests
const makeToolHandlers = () => ({
    listTools: vi.fn(async () => ({ tools: [] })),
    handleToolCall: vi.fn(async () => ({ content: [] })),
});

describe('ExpressServer – SSE, sessions, and static UI', () => {
    let server: ExpressServer;

    beforeEach(async () => {
        server = new ExpressServer({ port: 0, dev: true });
        await server.start();
    });

    afterEach(async () => {
        await server.stop();
        vi.useRealTimers();
    });

    describe('MCP SSE endpoint', () => {
        it('returns 404 when session not found', async () => {
            const handlers = makeToolHandlers();
            server.setupMCPEndpoint(handlers);

            await request(server.getApp())
                .get('/mcp')
                .set('Mcp-Session-Id', 'unknown-session')
                .expect(404);
        });
    });

    describe('MCP session deletion', () => {
        it('DELETE returns 404 for unknown session and 200 for existing, then 404 again after deletion', async () => {
            const handlers = makeToolHandlers();
            server.setupMCPEndpoint(handlers);

            // Unknown session
            await request(server.getApp())
                .delete('/mcp')
                .set('Mcp-Session-Id', 'nope')
                .expect(404);

            // Create a real session
            const res = await request(server.getApp()).post('/mcp').send({});
            const sessionId = res.headers['mcp-session-id'];
            expect(sessionId).toBeDefined();

            // Delete existing session
            await request(server.getApp())
                .delete('/mcp')
                .set('Mcp-Session-Id', sessionId)
                .expect(200);

            // Deleting again should 404
            await request(server.getApp())
                .delete('/mcp')
                .set('Mcp-Session-Id', sessionId)
                .expect(404);
        });
    });

    describe('MCP POST session handling edge cases', () => {
        it('creates new session with provided non-existent session id and echoes it in header', async () => {
            const handlers = makeToolHandlers();
            server.setupMCPEndpoint(handlers);

            const provided = 'provided-session-123';
            const res = await request(server.getApp())
                .post('/mcp')
                .set('Mcp-Session-Id', provided)
                .send({});

            // New session was created with provided id, so header is present and equals provided
            expect(res.headers['mcp-session-id']).toBe(provided);
        });

        it('treats empty/whitespace session id as invalid and generates a new one', async () => {
            const handlers = makeToolHandlers();
            server.setupMCPEndpoint(handlers);

            const res = await request(server.getApp())
                .post('/mcp')
                .set('Mcp-Session-Id', '   ')
                .send({});

            expect(res.headers['mcp-session-id']).toBeDefined();
            expect(res.headers['mcp-session-id']).not.toBe('   ');
        });

        it('cleans up expired sessions and recreates on next request with same id', async () => {
            vi.useFakeTimers();

            const handlers = makeToolHandlers();
            server.setupMCPEndpoint(handlers);

            // Create a session now
            const first = await request(server.getApp()).post('/mcp').send({});
            const sessionId = first.headers['mcp-session-id'];
            expect(sessionId).toBeDefined();

            // Advance time by ~31 minutes (> 30 min timeout) to trigger cleanup
            vi.setSystemTime(Date.now() + 31 * 60 * 1000);

            // Use same session id; cleanupSessions should remove old and create new (so header is set again)
            const second = await request(server.getApp())
                .post('/mcp')
                .set('Mcp-Session-Id', sessionId)
                .send({});

            expect(second.headers['mcp-session-id']).toBe(sessionId);
        });
    });

    describe('Production static UI fallback', () => {
        // In monorepo: UI is in packages/specly-ui
        const uiDistPath = path.resolve(process.cwd(), '../specly-ui/dist');
        const indexPath = path.join(uiDistPath, 'index.html');

        afterEach(() => {
            // Clean up any created dist directory/files
            try {
                if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
                if (fs.existsSync(uiDistPath)) fs.rmdirSync(uiDistPath, { recursive: true });
            } catch {
                // ignore
            }
        });

        it('serves index.html for non-API GET requests when dist exists', async () => {
            // Prepare a fake UI dist folder with index.html
            fs.mkdirSync(uiDistPath, { recursive: true });
            fs.writeFileSync(indexPath, '<html><body><div>hello-ui</div></body></html>');

            const prodServer = new ExpressServer({ port: 0, dev: false });
            await prodServer.start();
            prodServer.setupHealthCheck();

            // Request a non-API route (should return index.html content)
            const res = await request(prodServer.getApp()).get('/some/route').expect(200);
            // Assert the fake HTML content we created
            expect(res.text.toLowerCase()).toContain('hello-ui');

            await prodServer.stop();
        });

        it('skips SPA fallback for API routes (404 when /api path and no router mounted)', async () => {
            const prodServer = new ExpressServer({ port: 0, dev: false });
            await prodServer.start();
            prodServer.setupHealthCheck();

            // SPA fallback is bypassed for API routes; since no /api router mounted here, expect 404
            await request(prodServer.getApp()).get('/api/something').expect(404);

            await prodServer.stop();
        });
    });
});
