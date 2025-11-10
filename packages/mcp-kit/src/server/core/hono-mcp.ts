import { Hono } from 'hono';
import type { Hono as HonoType } from 'hono';
import type { MCPToolHandlers, UniversalServerOptions } from './types.js';
import { cors, logger, jsonResponse, errorResponse } from './middleware.js';
import { getRuntimeInfo } from './runtime.js';

/**
 * Universal Hono-based MCP server that works across all JavaScript runtimes
 *
 * This provides MCP protocol handling using Hono + fetch-to-node bridge,
 * enabling deployment to Node.js, Bun, Cloudflare Workers, Vercel Edge, etc.
 */

export interface CreateHonoMcpOptions extends UniversalServerOptions {
    /**
     * Base path for the MCP server (default: '/')
     */
    basePath?: string;
}

/**
 * Create a universal Hono MCP server
 *
 * @example
 * ```ts
 * const app = createHonoMcpServer({
 *   toolHandlers: createToolHandlers([...]),
 *   serverName: 'my-mcp-server',
 *   cors: true,
 * });
 *
 * // Node.js with @hono/node-server
 * import { serve } from '@hono/node-server';
 * serve({ fetch: app.fetch, port: 3000 });
 *
 * // Cloudflare Worker
 * export default { fetch: app.fetch };
 * ```
 */
export function createHonoMcpServer(options: CreateHonoMcpOptions): HonoType {
    const {
        toolHandlers,
        serverName = 'mcp-server',
        serverVersion = '1.0.0',
        cors: enableCors = true,
        healthEndpoint = '/health',
        mcpEndpoint = '/mcp',
        basePath = '/',
    } = options;

    const app = new Hono();

    // Add CORS middleware if enabled
    if (enableCors) {
        app.use('*', cors());
    }

    // Add logging middleware
    app.use('*', logger());

    // Health endpoint
    app.get(healthEndpoint, (c) => {
        const runtime = getRuntimeInfo();
        return jsonResponse({
            status: 'healthy',
            server: serverName,
            version: serverVersion,
            runtime: runtime.name,
            timestamp: new Date().toISOString(),
        });
    });

    // MCP protocol endpoint
    app.post(mcpEndpoint, async (c) => {
        try {
            const body = await c.req.json();
            const { jsonrpc, method, params, id } = body;

            // Validate JSON-RPC 2.0 format
            if (jsonrpc !== '2.0' || !method) {
                return jsonResponse({
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32600, message: 'Invalid Request' }
                }, 400);
            }

            let result: any;

            // Handle MCP methods
            if (method === 'tools/list') {
                result = await toolHandlers.listTools();
            } else if (method === 'tools/call') {
                const { name, arguments: args } = params || {};
                if (!name) {
                    return jsonResponse({
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32602, message: 'Invalid params: missing tool name' }
                    }, 400);
                }
                result = await toolHandlers.handleToolCall(name, args || {});
            } else {
                return jsonResponse({
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32601, message: `Method not found: ${method}` }
                }, 404);
            }

            return jsonResponse({
                jsonrpc: '2.0',
                id,
                result
            });

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Internal server error';
            console.error('MCP server error:', error);

            return jsonResponse({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal error',
                    data: { details: message }
                }
            }, 500);
        }
    });

    // Handle unsupported methods on MCP endpoint
    app.all(mcpEndpoint, (c) => {
        if (c.req.method !== 'POST') {
            return jsonResponse({
                error: 'Method not allowed. MCP protocol requires POST requests.'
            }, 405, { Allow: 'POST' });
        }
        return c.text('OK');
    });

    // Root endpoint with server info
    app.get('/', (c) => {
        const runtime = getRuntimeInfo();
        return jsonResponse({
            name: serverName,
            version: serverVersion,
            protocol: 'mcp',
            endpoints: {
                health: healthEndpoint,
                mcp: mcpEndpoint,
            },
            runtime: runtime.name,
            capabilities: ['tools/list', 'tools/call'],
        });
    });

    return app;
}

/**
 * Create a fetch handler from the Hono app for environments that expect a fetch function
 */
export function createFetchHandler(app: HonoType): (request: Request) => Promise<Response> {
    return (request: Request) => Promise.resolve(app.fetch(request));
}

/**
 * Helper to create a complete MCP server setup with default options
 */
export function createUniversalMcpServer(toolHandlers: MCPToolHandlers, options: Partial<CreateHonoMcpOptions> = {}) {
    return createHonoMcpServer({
        toolHandlers,
        ...options,
    });
}