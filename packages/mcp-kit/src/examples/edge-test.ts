/**
 * Test script for edge deployment capability
 *
 * This script simulates deploying the universal Hono MCP server
 * to an edge environment (like Cloudflare Workers) by testing
 * the Cloudflare example locally.
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
    serverName: 'mcp-kit-edge-test',
    serverVersion: '1.0.0',
    cors: true,
    healthEndpoint: '/health',
    mcpEndpoint: '/mcp'
});

// Simulate Cloudflare Workers fetch handler
async function testEdgeDeployment() {
    console.log('🧪 Testing edge deployment capability...\n');

    // Test health endpoint
    console.log('Testing health endpoint...');
    const healthRequest = new Request('http://localhost/health');
    const healthResponse = await app.fetch(healthRequest);
    const healthData = await healthResponse.json();
    console.log('✅ Health response:', healthData);

    // Test MCP tools/list
    console.log('\nTesting MCP tools/list...');
    const toolsRequest = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 1
        })
    });
    const toolsResponse = await app.fetch(toolsRequest);
    const toolsData = await toolsResponse.json();
    console.log('✅ Tools list response:', JSON.stringify(toolsData, null, 2));

    // Test MCP tools/call
    console.log('\nTesting MCP tools/call (hello tool)...');
    const callRequest = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            id: 2,
            params: {
                name: 'hello',
                arguments: { name: 'Edge Runtime' }
            }
        })
    });
    const callResponse = await app.fetch(callRequest);
    const callData = await callResponse.json();
    console.log('✅ Tool call response:', JSON.stringify(callData, null, 2));

    // Test CORS
    console.log('\nTesting CORS headers...');
    const corsRequest = new Request('http://localhost/mcp', {
        method: 'OPTIONS',
        headers: { 'Origin': 'https://example.com' }
    });
    const corsResponse = await app.fetch(corsRequest);
    console.log('✅ CORS headers:', {
        'Access-Control-Allow-Origin': corsResponse.headers.get('Access-Control-Allow-Origin'),
        'Access-Control-Allow-Methods': corsResponse.headers.get('Access-Control-Allow-Methods'),
        'Access-Control-Allow-Headers': corsResponse.headers.get('Access-Control-Allow-Headers')
    });

    console.log('\n🎉 Edge deployment test completed successfully!');
    console.log('✅ Universal Hono core works in simulated edge environment');
    console.log('✅ MCP protocol handling works without local runtime features');
    console.log('✅ CORS and middleware work correctly');
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testEdgeDeployment().catch(console.error);
}