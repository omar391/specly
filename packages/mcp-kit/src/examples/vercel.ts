/**
 * Vercel Edge deployment example for universal Hono MCP server
 *
 * This example shows how to deploy the universal Hono MCP server
 * to Vercel Edge Functions.
 *
 * Usage:
 * ```bash
 * # Deploy to Vercel
 * npx vercel --prod
 * ```
 *
 * vercel.json:
 * ```json
 * {
 *   "functions": {
 *     "api/mcp.ts": {
 *       "runtime": "@vercel/edge"
 *     }
 *   }
 * }
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
    serverName: 'mcp-kit-vercel-example',
    serverVersion: '1.0.0',
    cors: true,
    healthEndpoint: '/health',
    mcpEndpoint: '/mcp'
});

// Export the fetch handler for Vercel Edge
export const config = {
    runtime: 'edge'
};

export default app.fetch;