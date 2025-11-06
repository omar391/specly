/**
 * Edge/serverless adapter for MCP server
 * Provides a fetch-based handler compatible with Cloudflare Workers, Vercel Edge, etc.
 */

export interface MCPToolHandlers {
    listTools: () => Promise<any>;
    handleToolCall: (name: string, args: any) => Promise<any>;
}

export interface CreateEdgeHandlerOptions {
    serverName?: string;
    serverVersion?: string;
}

/**
 * Create an edge-compatible MCP handler
 * Returns a fetch-style handler for serverless/edge runtimes
 * 
 * @example
 * ```ts
 * const handler = createMcpEdgeHandler({ serverName: 'my-mcp' }, {
 *   listTools: async () => ({ tools: [...] }),
 *   handleToolCall: async (name, args) => ({ content: [...] })
 * });
 * 
 * // Cloudflare Worker
 * export default { fetch: handler };
 * 
 * // Vercel Edge
 * export const config = { runtime: 'edge' };
 * export default handler;
 * ```
 */
export function createMcpEdgeHandler(
    opts: CreateEdgeHandlerOptions,
    toolHandlers: MCPToolHandlers
): (request: Request) => Promise<Response> {
    const serverName = opts.serverName ?? 'mcp-server';
    const serverVersion = opts.serverVersion ?? '0.1.0';

    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);

        // Only handle /mcp endpoint
        if (!url.pathname.endsWith('/mcp')) {
            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'POST') {
            try {
                const body = await request.json();
                const { method, params, id } = body;

                let result: any;

                if (method === 'tools/list') {
                    result = await toolHandlers.listTools();
                } else if (method === 'tools/call') {
                    const { name, arguments: args } = params;
                    result = await toolHandlers.handleToolCall(name, args);
                } else {
                    return new Response(
                        JSON.stringify({
                            jsonrpc: '2.0',
                            id,
                            error: { code: -32601, message: `Method not found: ${method}` }
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    );
                }

                return new Response(
                    JSON.stringify({ jsonrpc: '2.0', id, result }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Internal error';
                return new Response(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        error: { code: -32603, message }
                    }),
                    { status: 500, headers: { 'Content-Type': 'application/json' } }
                );
            }
        }

        // Method not allowed
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', 'Allow': 'POST' }
        });
    };
}
