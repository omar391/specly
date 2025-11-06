#!/usr/bin/env node

/**
 * Generic CLI Tool for Testing MCP Servers via MCP Client
 * 
 * This tool connects to a running MCP server via MCP protocol
 * and executes tool calls programmatically.
 * 
 * Usage: 
 *   mcp-test-client <toolName> [arguments] [--port=PORT] [--base-url=URL]
 * 
 * Example: 
 *   mcp-test-client my_tool '{"param": "value"}' --port=8989
 */

import { executeMCPToolCall } from '../client.js';

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Usage: mcp-test-client <toolName> [arguments] [--port=PORT] [--base-url=URL]');
        console.error('Example: mcp-test-client my_tool \'{"param": "value"}\' --port=8989');
        console.error('');
        console.error('This tool connects to a running MCP server via MCP protocol.');
        console.error('Make sure the server is running before using this tool.');
        process.exit(1);
    }

    // Parse arguments
    let toolName = args[0];
    let toolArguments: Record<string, unknown> = {};
    let port = 8989;
    let baseUrl = 'http://127.0.0.1';

    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--port=')) {
            port = parseInt(arg.split('=')[1], 10);
        } else if (arg.startsWith('--base-url=')) {
            baseUrl = arg.split('=')[1];
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
        console.log(`🧪 Testing MCP tool: ${toolName}`);
        console.log(`📡 Connecting to: ${baseUrl}:${port}`);
        console.log(`📝 Arguments:`, JSON.stringify(toolArguments, null, 2));
        console.log(`⏳ Executing...`);
        console.log('');

        const startTime = Date.now();

        try {
            // Execute via MCP client
            const result = await executeMCPToolCall({
                baseUrl,
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
                console.error('⚠️  Connection refused. Make sure the MCP server is running.');
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
