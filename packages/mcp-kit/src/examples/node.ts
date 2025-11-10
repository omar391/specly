/**
 * Node.js deployment example for universal Hono MCP server
 *
 * This example shows how to deploy the universal Hono MCP server
 * to Node.js using @hono/node-server.
 *
 * Usage:
 * ```bash
 * npm install @hono/node-server
 * node examples/node.ts
 * ```
 */

import { serve } from '@hono/node-server';
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
    serverName: 'mcp-kit-node-example',
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

serve({
    fetch: app.fetch,
    port
});