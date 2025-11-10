import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHonoMcpServer, createFetchHandler } from '../hono-mcp.js';
import { createToolHandlers } from '../../handlers.js';
import type { ToolSpec } from '../../handlers.js';
import { z } from 'zod';

// Mock tool for testing
const mockTool: ToolSpec = {
    name: 'test-tool',
    description: 'A test tool for integration testing',
    schema: z.object({
        message: z.string()
    }),
    exec: async (input: { message: string }) => {
        return { result: `Hello, ${input.message}!` };
    }
};

const mockTool2: ToolSpec = {
    name: 'error-tool',
    description: 'A tool that throws errors',
    schema: z.object({
        shouldError: z.boolean()
    }),
    exec: async (input: { shouldError: boolean }) => {
        if (input.shouldError) {
            throw new Error('Test error');
        }
        return { success: true };
    }
};

describe('Cross-Runtime Integration Tests', () => {
    let app: any;
    let fetchHandler: any;
    let toolHandlers: any;

    beforeEach(() => {
        toolHandlers = createToolHandlers([mockTool, mockTool2]);
        app = createHonoMcpServer({
            toolHandlers,
            serverName: 'test-server',
            serverVersion: '1.0.0',
            cors: true,
            healthEndpoint: '/health',
            mcpEndpoint: '/mcp'
        });
        fetchHandler = createFetchHandler(app);
    });

    describe('Universal Hono Core Functionality', () => {
        it('should handle health endpoint correctly', async () => {
            const request = new Request('http://localhost/health', {
                method: 'GET'
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data.status).toBe('healthy');
            expect(data.server).toBe('test-server');
            expect(data.version).toBe('1.0.0');
            expect(data.runtime).toBeDefined();
            expect(data.timestamp).toBeDefined();
        });

        it('should handle root endpoint with server info', async () => {
            const request = new Request('http://localhost/', {
                method: 'GET'
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data.name).toBe('test-server');
            expect(data.version).toBe('1.0.0');
            expect(data.protocol).toBe('mcp');
            expect(data.endpoints).toEqual({
                health: '/health',
                mcp: '/mcp'
            });
            expect(data.capabilities).toEqual(['tools/list', 'tools/call']);
        });

        it('should handle CORS preflight requests', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'OPTIONS',
                headers: {
                    'Origin': 'http://localhost:3000',
                    'Access-Control-Request-Method': 'POST',
                    'Access-Control-Request-Headers': 'Content-Type'
                }
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(204);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
            expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
        });

        it('should handle MCP tools/list request', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 1
                })
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data.jsonrpc).toBe('2.0');
            expect(data.id).toBe(1);
            expect(data.result.tools).toHaveLength(2);
            expect(data.result.tools[0]).toMatchObject({
                name: 'test-tool',
                description: 'A test tool for integration testing'
            });
        });

        it('should handle MCP tools/call request successfully', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'test-tool',
                        arguments: { message: 'world' }
                    },
                    id: 2
                })
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data.jsonrpc).toBe('2.0');
            expect(data.id).toBe(2);
            expect(data.result).toEqual({ result: 'Hello, world!' });
        });

        it('should handle MCP tools/call request with error', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'error-tool',
                        arguments: { shouldError: true }
                    },
                    id: 3
                })
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(500);

            const data = await response.json();
            expect(data.jsonrpc).toBe('2.0');
            expect(data.error.code).toBe(-32603);
            expect(data.error.message).toBe('Internal error');
            expect(data.error.data.details).toBe('Test error');
        });

        it('should handle unknown tool call', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'unknown-tool',
                        arguments: {}
                    },
                    id: 4
                })
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(500);

            const data = await response.json();
            expect(data.jsonrpc).toBe('2.0');
            expect(data.error.code).toBe(-32603);
            expect(data.error.message).toBe('Internal error');
            expect(data.error.data.details).toBe('Unknown tool: unknown-tool');
        });

        it('should handle invalid JSON-RPC request', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    method: 'tools/list',
                    id: 5
                })
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(400);

            const data = await response.json();
            expect(data.jsonrpc).toBe('2.0');
            expect(data.id).toBe(5);
            expect(data.error.code).toBe(-32600);
            expect(data.error.message).toBe('Invalid Request');
        });

        it('should handle unknown MCP method', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'unknown/method',
                    id: 6
                })
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(404);

            const data = await response.json();
            expect(data.jsonrpc).toBe('2.0');
            expect(data.id).toBe(6);
            expect(data.error.code).toBe(-32601);
            expect(data.error.message).toBe('Method not found: unknown/method');
        });

        it('should handle tools/call without tool name', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        arguments: {}
                    },
                    id: 7
                })
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(400);

            const data = await response.json();
            expect(data.jsonrpc).toBe('2.0');
            expect(data.id).toBe(7);
            expect(data.error.code).toBe(-32602);
            expect(data.error.message).toBe('Invalid params: missing tool name');
        });

        it('should reject non-POST requests to MCP endpoint', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'GET'
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(405);
            expect(response.headers.get('Allow')).toBe('POST');

            const data = await response.json();
            expect(data.error).toBe('Method not allowed. MCP protocol requires POST requests.');
        });

        it('should handle malformed JSON', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: 'invalid json'
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(500);

            const data = await response.json();
            expect(data.jsonrpc).toBe('2.0');
            expect(data.error.code).toBe(-32603);
            expect(data.error.message).toBe('Internal error');
        });
    });

    describe('Runtime Environment Simulation', () => {
        it('should work in simulated Node.js environment', async () => {
            // The test already runs in Node.js, so this verifies basic functionality
            const request = new Request('http://localhost/health');
            const response = await fetchHandler(request);
            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data.runtime).toBe('node');
        });

        it('should work with custom base path', () => {
            const customApp = createHonoMcpServer({
                toolHandlers,
                basePath: '/api/v1'
            });

            // This would need a custom test setup for base path routing
            // For now, we verify the app is created successfully
            expect(customApp).toBeDefined();
            expect(typeof customApp.fetch).toBe('function');
        });

        it('should work without CORS enabled', () => {
            const noCorsApp = createHonoMcpServer({
                toolHandlers,
                cors: false
            });

            expect(noCorsApp).toBeDefined();
        });

        it('should work with custom endpoints', () => {
            const customApp = createHonoMcpServer({
                toolHandlers,
                healthEndpoint: '/status',
                mcpEndpoint: '/api/mcp'
            });

            expect(customApp).toBeDefined();
        });
    });

    describe('Error Scenarios and Edge Cases', () => {
        it('should handle tool execution with invalid arguments', async () => {
            const request = new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'test-tool',
                        arguments: { invalidField: 'value' } // Missing required 'message' field
                    },
                    id: 8
                })
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(500);

            const data = await response.json();
            expect(data.jsonrpc).toBe('2.0');
            expect(data.error.code).toBe(-32603);
            expect(data.error.message).toBe('Internal error');
        });

        it('should handle concurrent requests', async () => {
            const requests = Array.from({ length: 5 }, (_, i) =>
                fetchHandler(new Request('http://localhost/health'))
            );

            const responses = await Promise.all(requests);
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });
        });

        it('should handle large request payloads', async () => {
            const largeArgs = { message: 'x'.repeat(10000) };

            const request = new Request('http://localhost/mcp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: 'test-tool',
                        arguments: largeArgs
                    },
                    id: 9
                })
            });

            const response = await fetchHandler(request);
            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data.result.result).toBe(`Hello, ${largeArgs.message}!`);
        });
    });
});