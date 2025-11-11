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
    /** Keep connection alive for reuse - defaults to false */
    keepAlive?: boolean;
    /** Connection timeout in milliseconds - defaults to 10000 */
    timeout?: number;
}

export interface MCPClientPoolOptions extends MCPClientOptions {
    /** Maximum number of clients in the pool - defaults to 5 */
    maxConnections?: number;
    /** Idle timeout before closing pooled connections (ms) - defaults to 30000 */
    idleTimeout?: number;
}

/**
 * Simple MCP client connection pool for reusing connections
 */
export class MCPClientPool {
    private clients: Array<{
        client: Client;
        transport: StreamableHTTPClientTransport;
        close: () => Promise<void>;
        lastUsed: number;
        inUse: boolean;
    }> = [];
    private options: Required<MCPClientPoolOptions>;
    private cleanupInterval?: NodeJS.Timeout;

    constructor(options: MCPClientPoolOptions = {}) {
        this.options = {
            baseUrl: options.baseUrl ?? 'http://127.0.0.1',
            port: options.port ?? 8989,
            clientName: options.clientName ?? 'mcp-kit-client',
            version: options.version ?? '0.1.0',
            keepAlive: options.keepAlive ?? true,
            timeout: options.timeout ?? 10000,
            maxConnections: options.maxConnections ?? 5,
            idleTimeout: options.idleTimeout ?? 30000,
        };

        // Start cleanup interval for idle connections
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleConnections();
        }, Math.min(this.options.idleTimeout / 2, 10000));
    }

    /**
     * Get a client from the pool or create a new one
     */
    async acquire(): Promise<{
        client: Client;
        transport: StreamableHTTPClientTransport;
        close: () => Promise<void>;
        release: () => void;
    }> {
        // Find available client
        const availableClient = this.clients.find(c => !c.inUse);
        if (availableClient) {
            availableClient.inUse = true;
            availableClient.lastUsed = Date.now();
            return {
                client: availableClient.client,
                transport: availableClient.transport,
                close: availableClient.close,
                release: () => this.release(availableClient),
            };
        }

        // Create new client if under limit
        if (this.clients.length < this.options.maxConnections) {
            const { client, transport, close } = await createMCPClient(this.options);
            const pooledClient = {
                client,
                transport,
                close,
                lastUsed: Date.now(),
                inUse: true,
            };
            this.clients.push(pooledClient);

            return {
                client,
                transport,
                close,
                release: () => this.release(pooledClient),
            };
        }

        // Wait for an available client
        return new Promise((resolve) => {
            const checkAvailable = () => {
                const available = this.clients.find(c => !c.inUse);
                if (available) {
                    available.inUse = true;
                    available.lastUsed = Date.now();
                    resolve({
                        client: available.client,
                        transport: available.transport,
                        close: available.close,
                        release: () => this.release(available),
                    });
                } else {
                    setTimeout(checkAvailable, 100);
                }
            };
            checkAvailable();
        });
    }

    /**
     * Release a client back to the pool
     */
    private release(pooledClient: any) {
        pooledClient.inUse = false;
        pooledClient.lastUsed = Date.now();
    }

    /**
     * Clean up idle connections
     */
    private cleanupIdleConnections() {
        const now = Date.now();
        const idleClients = this.clients.filter(c =>
            !c.inUse && (now - c.lastUsed) > this.options.idleTimeout
        );

        for (const client of idleClients) {
            const index = this.clients.indexOf(client);
            if (index > -1) {
                this.clients.splice(index, 1);
                client.close().catch(() => { }); // Ignore close errors
            }
        }
    }

    /**
     * Close all connections and destroy the pool
     */
    async destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }

        await Promise.all(
            this.clients.map(client => client.close().catch(() => { }))
        );
        this.clients = [];
    }
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
        version = '0.1.0',
        keepAlive = false,
        timeout = 10000
    } = options;

    const client = new Client(
        { name: clientName, version },
        { capabilities: {} }
    );

    const url = port ? `${baseUrl}:${port}/mcp` : `${baseUrl}/mcp`;
    const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: {
            signal: AbortSignal.timeout(timeout),
            keepalive: keepAlive,
        }
    });
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
 * Convenience method that connects, calls a tool, and optionally disconnects.
 * Pass an existing client instance or pool for connection reuse.
 * 
 * @example
 * ```ts
 * // Single call (auto-connect/disconnect)
 * const result = await executeMCPToolCall({
 *   port: 8989,
 *   toolName: 'my_tool',
 *   arguments: { param: 'value' }
 * });
 * 
 * // Multiple calls with connection reuse
 * const { client, close } = await createMCPClient({ port: 8989 });
 * const result1 = await executeMCPToolCall({
 *   client,
 *   toolName: 'my_tool1',
 *   arguments: { param: 'value1' }
 * });
 * const result2 = await executeMCPToolCall({
 *   client,
 *   toolName: 'my_tool2',
 *   arguments: { param: 'value2' }
 * });
 * await close();
 * 
 * // Using connection pool for high-frequency calls
 * const pool = new MCPClientPool({ port: 8989, maxConnections: 3 });
 * const result = await executeMCPToolCall({
 *   pool,
 *   toolName: 'my_tool',
 *   arguments: { param: 'value' }
 * });
 * await pool.destroy();
 * ```
 */
export async function executeMCPToolCall(options: {
    baseUrl?: string;
    port?: number;
    toolName: string;
    arguments: Record<string, unknown>;
    /** Optional existing client instance for connection reuse */
    client?: Client;
    /** Optional client pool for connection reuse */
    pool?: MCPClientPool;
}): Promise<any> {
    if (options.client) {
        // Use existing client
        return await options.client.callTool({
            name: options.toolName,
            arguments: options.arguments,
        });
    } else if (options.pool) {
        // Use client from pool
        const { client, release } = await options.pool.acquire();
        try {
            return await client.callTool({
                name: options.toolName,
                arguments: options.arguments,
            });
        } finally {
            release();
        }
    } else {
    // Create temporary client for single use
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
}
