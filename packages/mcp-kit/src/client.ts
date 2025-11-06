/**
 * MCP Client Utilities
 * 
 * Reusable MCP client setup for connecting to MCP server instances
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface MCPClientOptions {
    /** Base URL of the MCP server (e.g., http://127.0.0.1) - defaults to http://127.0.0.1 */
    baseUrl?: string;
    /** Port of the MCP server - defaults to 8989 */
    port?: number;
    /** Client name/identifier - defaults to mcp-kit-client */
    clientName?: string;
    /** Client version - defaults to 0.1.0 */
    version?: string;
}

/**
 * Create and connect an MCP client to an MCP server
 * 
 * @example
 * ```ts
 * const { client, close } = await createMCPClient({ port: 8989 });
 * const tools = await client.listTools();
 * const result = await client.callTool({ name: 'my_tool', arguments: {...} });
 * await close();
 * ```
 */
export async function createMCPClient(options: MCPClientOptions = {}): Promise<{
    client: Client;
    transport: StreamableHTTPClientTransport;
    close: () => Promise<void>;
}> {
    const {
        baseUrl = 'http://127.0.0.1',
        port = 8989,
        clientName = 'mcp-kit-client',
        version = '0.1.0'
    } = options;

    const client = new Client(
        { name: clientName, version },
        { capabilities: {} }
    );

    const url = port ? `${baseUrl}:${port}/mcp` : `${baseUrl}/mcp`;
    const transport = new StreamableHTTPClientTransport(new URL(url));
    await client.connect(transport);

    return {
        client,
        transport,
        close: async () => {
            await transport.close();
        }
    };
}

/**
 * Execute a single tool call via MCP client
 * 
 * Convenience method that connects, calls a tool, and disconnects.
 * 
 * @example
 * ```ts
 * const result = await executeMCPToolCall({
 *   port: 8989,
 *   toolName: 'my_tool',
 *   arguments: { param: 'value' }
 * });
 * ```
 */
export async function executeMCPToolCall(options: {
    baseUrl?: string;
    port?: number;
    toolName: string;
    arguments: Record<string, unknown>;
}): Promise<any> {
    const { client, close } = await createMCPClient({
        baseUrl: options.baseUrl,
        port: options.port,
    });

    try {
        return await client.callTool({
            name: options.toolName,
            arguments: options.arguments,
        });
    } finally {
        await close();
    }
}
