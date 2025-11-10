/**
 * Bun deployment example for universal Hono MCP server
 *
 * This example shows how to deploy the universal Hono MCP server
 * to Bun using Bun.serve.
 *
 * Usage:
 * ```bash
 * bun run examples/bun.ts
 * ```
 */

import { createHonoMcpServer } from '../core/hono-mcp';
import { createToolHandlers } from '../handlers';
import { z } from 'zod';

// Example tool handlers
const toolHandlers = createToolHandlers([
    {
        name: 'hello',
        description: 'Say hello to someone',
        schema: z.object({
            name: z.string()
        }),
        exec: ({ name }: { name: string }) => `Hello, ${name}!`
    },
    {
        name: 'add',
        description: 'Add two numbers',
        schema: z.object({
            a: z.number(),
            b: z.number()
        }),
        exec: ({ a, b }: { a: number; b: number }) => a + b
    }
]);

// Create the universal Hono MCP server
const app = createHonoMcpServer({
    toolHandlers,
    serverName: 'mcp-kit-bun-example',
    serverVersion: '1.0.0',
    cors: true,
    healthEndpoint: '/health',
    mcpEndpoint: '/mcp'
});

// Start the server
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

console.log(`🚀 Starting MCP server on port ${port}`);
console.log(`📊 Health endpoint: http://localhost:${port}/health`);
console.log(`🔧 MCP endpoint: http://localhost:${port}/mcp`);

Bun.serve({
    fetch: app.fetch,
    port
});