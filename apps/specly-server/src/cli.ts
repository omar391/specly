#!/usr/bin/env node

import { initializeGlobalDatabaseService, GlobalDatabaseService } from './database/global-queries.js';
import { DatabaseService } from './services/database-service.js';
import { SeedManager } from './services/seed-manager.js';
import { PromptOrchestrator } from './services/prompt-orchestrator.js';
import type { DrizzleDatabaseManager } from './database/drizzle-connection.js';
import type { BaseTool } from './tools/base-tool.js';
import type { z } from 'zod';
import { validateToolName, ToolNames } from './constants/tool-names.js';
import { getTestDatabaseInstances } from './test-utils/database-test-helpers.js';

// Tools
import { InitToolNew, initToolSchema } from './tools/init.js';
import { StartTool, startToolSchema } from './tools/start.js';
import { AddToolNew, addToolSchema } from './tools/add.js';
import { StatusToolNew, statusToolSchema } from './tools/status.js';
import { UpdateToolNew, updateToolSchema } from './tools/update.js';
import { AuditToolNew, auditToolSchema } from './tools/audit.js';
import { FocusToolNew, focusToolSchema } from './tools/focus.js';
import { GitHubTool, githubToolSchema } from './tools/github.js';
import { RuleUpdateTool, ruleUpdateToolSchema } from './tools/rule-update.js';
import { RemoteInterfaceTool, remoteInterfaceToolSchema } from './tools/remote-interface.js';

/**
 * CLI tool for testing MCP tool calls programmatically
 * Usage: npm run test:tool -- <toolName> <arguments>
 * Example: npm run test:tool -- specly_start '{"workspace_path": "/tmp/test-workspace"}'
 */

// TODO: do we need ToolRegistry and SchemaRegistry be defined here or can it be centralized?

// Types for tools and schemas
interface ToolRegistry {
    specly_init: InitToolNew;
    specly_start: StartTool;
    specly_add: AddToolNew;
    specly_status: StatusToolNew;
    specly_update: UpdateToolNew;
    specly_audit: AuditToolNew;
    specly_focus: FocusToolNew;
    specly_github: GitHubTool;
    specly_rule_update: RuleUpdateTool;
    specly_remote_interface: RemoteInterfaceTool;
}

interface SchemaRegistry {
    specly_init: typeof initToolSchema;
    specly_start: typeof startToolSchema;
    specly_add: typeof addToolSchema;
    specly_status: typeof statusToolSchema;
    specly_update: typeof updateToolSchema;
    specly_audit: typeof auditToolSchema;
    specly_focus: typeof focusToolSchema;
    specly_github: typeof githubToolSchema;
    specly_rule_update: typeof ruleUpdateToolSchema;
    specly_remote_interface: typeof remoteInterfaceToolSchema;
}

// Global variables
let toolsInitialized = false;
let globalDbService: GlobalDatabaseService | null = null;
let globalDrizzleManager: DrizzleDatabaseManager | null = null;

async function initializeTools(): Promise<{
    tools: ToolRegistry;
    schemas: SchemaRegistry;
}> {
    // Check if test database instances are available
    const testInstances = getTestDatabaseInstances();

    if (testInstances.isInitialized && testInstances.drizzleManager && testInstances.dbService) {
        // Use test database instances
        globalDrizzleManager = testInstances.drizzleManager;
        globalDbService = testInstances.dbService;
        toolsInitialized = true;
    }

    if (toolsInitialized && globalDrizzleManager) {
        // Return cached tools
        const tools = {
            [ToolNames.INIT]: new InitToolNew(globalDrizzleManager),
            [ToolNames.START]: new StartTool(globalDrizzleManager),
            [ToolNames.ADD]: new AddToolNew(globalDrizzleManager),
            [ToolNames.STATUS]: new StatusToolNew(globalDrizzleManager),
            [ToolNames.UPDATE]: new UpdateToolNew(globalDrizzleManager),
            [ToolNames.AUDIT]: new AuditToolNew(globalDrizzleManager),
            [ToolNames.FOCUS]: new FocusToolNew(globalDrizzleManager),
            [ToolNames.GITHUB]: new GitHubTool(globalDrizzleManager),
            [ToolNames.RULE_UPDATE]: new RuleUpdateTool(globalDrizzleManager),
            [ToolNames.REMOTE_INTERFACE]: new RemoteInterfaceTool(globalDrizzleManager),
        };

        const schemas = {
            [ToolNames.INIT]: initToolSchema,
            [ToolNames.START]: startToolSchema,
            [ToolNames.ADD]: addToolSchema,
            [ToolNames.STATUS]: statusToolSchema,
            [ToolNames.UPDATE]: updateToolSchema,
            [ToolNames.AUDIT]: auditToolSchema,
            [ToolNames.FOCUS]: focusToolSchema,
            [ToolNames.GITHUB]: githubToolSchema,
            [ToolNames.RULE_UPDATE]: ruleUpdateToolSchema,
            [ToolNames.REMOTE_INTERFACE]: remoteInterfaceToolSchema,
        };

        return { tools, schemas };
    }

    try {
        // Check if we're in a test environment
        const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

        if (isTest) {
            // Create in-memory database for tests
            const { DrizzleDatabaseManager, DatabaseType } = await import('./database/drizzle-connection.js');
            const inMemoryDb = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
            await inMemoryDb.initialize();

            // Seed the database with tool flows and feedback steps
            const { SeedManager } = await import('./services/seed-manager.js');
            const seedManager = new SeedManager(inMemoryDb);
            await seedManager.initializeGlobalData();

            const { GlobalDatabaseService } = await import('./database/global-queries.js');
            globalDbService = new GlobalDatabaseService(inMemoryDb);
            await globalDbService.initialize();
        } else {
            // Production environment
            globalDbService = (await import('./database/global-queries.js')).getGlobalDatabaseService();
            await globalDbService.initialize();
        }
    } catch (error) {
        console.error('Error initializing database:', error);
        console.error('Error stack:', (error as Error).stack);
        globalDbService = null;
    }

    if (!globalDbService) {
        throw new Error('Failed to initialize global database service');
    }

    try {
        globalDrizzleManager = globalDbService.getDrizzleManager();

        // Mark tools as initialized
        toolsInitialized = true;

        // Create tool instances
        const tools = {
            [ToolNames.INIT]: new InitToolNew(globalDrizzleManager),
            [ToolNames.START]: new StartTool(globalDrizzleManager),
            [ToolNames.ADD]: new AddToolNew(globalDrizzleManager),
            [ToolNames.STATUS]: new StatusToolNew(globalDrizzleManager),
            [ToolNames.UPDATE]: new UpdateToolNew(globalDrizzleManager),
            [ToolNames.AUDIT]: new AuditToolNew(globalDrizzleManager),
            [ToolNames.FOCUS]: new FocusToolNew(globalDrizzleManager),
            [ToolNames.GITHUB]: new GitHubTool(globalDrizzleManager),
            [ToolNames.RULE_UPDATE]: new RuleUpdateTool(globalDrizzleManager),
            [ToolNames.REMOTE_INTERFACE]: new RemoteInterfaceTool(globalDrizzleManager),
        };

        const schemas = {
            [ToolNames.INIT]: initToolSchema,
            [ToolNames.START]: startToolSchema,
            [ToolNames.ADD]: addToolSchema,
            [ToolNames.STATUS]: statusToolSchema,
            [ToolNames.UPDATE]: updateToolSchema,
            [ToolNames.AUDIT]: auditToolSchema,
            [ToolNames.FOCUS]: focusToolSchema,
            [ToolNames.GITHUB]: githubToolSchema,
            [ToolNames.RULE_UPDATE]: ruleUpdateToolSchema,
            [ToolNames.REMOTE_INTERFACE]: remoteInterfaceToolSchema,
        };

        return { tools, schemas };
    } catch (error) {
        console.error('Error getting drizzle manager:', error);
        throw error;
    }
}

async function executeToolCall(toolName: string, toolArguments: Record<string, unknown>) {
    // Pre-validate tool name before initializing database
    validateToolName(toolName);

    const { tools, schemas } = await initializeTools();

    if (!(toolName in tools)) {
        throw new Error(`Unknown tool: ${toolName}. Available tools: ${Object.keys(tools).join(', ')}`);
    }

    // Parse and validate arguments
    const schema = schemas[toolName as keyof typeof schemas];
    const validatedArgs = schema.parse(toolArguments);

    // Execute the tool based on name
    switch (toolName) {
        case 'specly_init': {
            const args = validatedArgs as z.infer<typeof initToolSchema>;
            return await tools.specly_init.execute(args);
        }
        case 'specly_start': {
            const args = validatedArgs as z.infer<typeof startToolSchema>;
            return await tools.specly_start.execute(args);
        }
        case 'specly_add': {
            const args = validatedArgs as z.infer<typeof addToolSchema>;
            return await tools.specly_add.execute(args);
        }
        case 'specly_status': {
            const args = validatedArgs as z.infer<typeof statusToolSchema>;
            return await tools.specly_status.execute(args);
        }
        case 'specly_update': {
            const args = validatedArgs as z.infer<typeof updateToolSchema>;
            return await tools.specly_update.execute(args);
        }
        case 'specly_audit': {
            const args = validatedArgs as z.infer<typeof auditToolSchema>;
            return await tools.specly_audit.execute(args as any);
        }
        case 'specly_focus': {
            const args = validatedArgs as z.infer<typeof focusToolSchema>;
            return await tools.specly_focus.execute(args);
        }
        case 'specly_github': {
            const args = validatedArgs as z.infer<typeof githubToolSchema>;
            return await tools.specly_github.execute(args);
        }
        case 'specly_rule_update': {
            const args = validatedArgs as z.infer<typeof ruleUpdateToolSchema>;
            return await tools.specly_rule_update.execute(args);
        }
        case 'specly_remote_interface': {
            const args = validatedArgs as z.infer<typeof remoteInterfaceToolSchema>;
            return await tools.specly_remote_interface.execute(args);
        }
        default:
            throw new Error(`Unhandled tool: ${toolName}`);
    }
}

// Export for testing
export { executeToolCall };

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Usage: npm run test:tool -- <toolName> [arguments]');
        console.error('Example: npm run test:tool -- specly_start \'{"workspace_path": "/tmp/test-workspace"}\'');
        console.error('');
        console.error('Available tools:');
        console.error('  specly_init');
        console.error('  specly_start');
        console.error('  specly_add');
        console.error('  specly_status');
        console.error('  specly_update');
        console.error('  specly_audit');
        console.error('  specly_focus');
        console.error('  specly_github');
        console.error('  specly_rule_update');
        console.error('  specly_remote_interface');
        process.exit(1);
    }

    const toolName = args[0];
    const toolArguments = args[1] ? JSON.parse(args[1]) : {};

    try {
        console.log(`🧪 Testing tool: ${toolName}`);
        console.log(`📝 Arguments:`, JSON.stringify(toolArguments, null, 2));
        console.log(`⏳ Executing...`);
        console.log('');

        const startTime = Date.now();

        try {
            // Execute the tool
            const result = await executeToolCall(toolName, toolArguments);
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
                    if (item.type === 'text') console.log(item.text); else console.log(`[${item.type}]`, item);
                }
            } else {
                console.log(result);
            }

        } catch (error) {
            const endTime = Date.now();
            console.log(`💥 Tool call failed (${endTime - startTime}ms)`);
            console.error('Error:', error instanceof Error ? error.message : String(error));
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

// Only run main when not in test environment
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    main().catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}
