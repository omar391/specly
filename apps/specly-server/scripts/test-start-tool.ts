
import { SpeclyServer } from '../src/index.js';
import { ToolNames } from '../src/constants/tool-names.js';
import * as path from 'path';

async function main() {
    const workspacePath = process.argv[2] || '/tmp/mcp-cli-test-ws';
    console.log(`Testing specly_start with workspace: ${workspacePath}`);

    const server = new SpeclyServer();
    await server.initializeServer();

    const handlers = server.createMCPToolHandlers();

    try {
        console.log('Executing specly_start...');
        const result = await handlers.handleToolCall(ToolNames.START, { workspace_path: workspacePath });
        console.log('Tool execution result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Tool execution failed:', error);
        process.exit(1);
    }
}

main().catch(console.error);
