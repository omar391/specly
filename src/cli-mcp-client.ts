#!/usr/bin/env node

/**
 * CLI tool for testing MCP tool calls via MCP client (connects to running server)
 * 
 * This is an alternative to src/cli.ts that connects to a running Specly server
 * via MCP protocol instead of executing tools directly.
 * 
 * Usage: 
 *   npm run test:tool:mcp -- <toolName> <arguments> [--port=8989]
 * 
 * Example: 
 *   npm run test:tool:mcp -- specly_start '{"workspace_path": "/tmp/test"}' --port=8989
 */

import { executeMCPToolCall } from './utils/mcp-client.js';

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Usage: npm run test:tool:mcp -- <toolName> [arguments] [--port=PORT]');
        console.error('Example: npm run test:tool:mcp -- specly_start \'{"workspace_path": "/tmp/test"}\' --port=8989');
        console.error('');
        console.error('This tool connects to a running Specly server via MCP protocol.');
        console.error('Make sure the server is running (npm run dev or npm run serve)');
        process.exit(1);
    }

    // Parse arguments
    let toolName = args[0];
    let toolArguments: Record<string, unknown> = {};
    let port = 8989;

    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--port=')) {
            port = parseInt(arg.split('=')[1], 10);
        } else if (!arg.startsWith('--')) {
            // Parse JSON arguments
            try {
                toolArguments = JSON.parse(arg);
            } catch (error) {
                console.error('Failed to parse arguments as JSON:', arg);
                process.exit(1);
            }
        }
    }

    try {
        console.log(`🧪 Testing tool via MCP client: ${toolName}`);
        console.log(`📡 Connecting to: http://127.0.0.1:${port}`);
        console.log(`📝 Arguments:`, JSON.stringify(toolArguments, null, 2));
        console.log(`⏳ Executing...`);
        console.log('');

        const startTime = Date.now();

        try {
            // Execute via MCP client
            const result = await executeMCPToolCall({
                port,
                toolName,
                arguments: toolArguments,
            });

            const endTime = Date.now();

            console.log(`✅ Tool call succeeded (${endTime - startTime}ms)`);
            console.log('');

            if (result.isError) {
                console.log('⚠️  Tool returned error result:');
            } else {
                console.log('📋 Tool result:');
            }

            if (Array.isArray(result.content)) {
                for (const item of result.content) {
                    if (item.type === 'text') {
                        console.log(item.text);
                    } else {
                        console.log(`[${item.type}]`, item);
                    }
                }
            } else {
                console.log(result);
            }

        } catch (error) {
            const endTime = Date.now();
            console.log(`💥 Tool call failed (${endTime - startTime}ms)`);
            console.error('Error:', error instanceof Error ? error.message : String(error));

            if ((error as any).code === 'ECONNREFUSED') {
                console.error('');
                console.error('⚠️  Connection refused. Make sure the Specly server is running:');
                console.error(`   npm run dev (for development)`);
                console.error(`   npm run serve (for production)`);
            }

            process.exit(1);
        }

    } catch (error) {
        console.error('❌ CLI test failed:', error);
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
