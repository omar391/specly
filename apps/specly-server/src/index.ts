#!/usr/bin/env node

/**
 * Specly Integrated Server
 * 
 * Unified server that combines MCP server + UI + REST API
 */

import { startMcpServer } from '@omar391/mcp-kit/server';
import { parseCliArgs, type CliOptions } from './utils/cli-parser.js';
import { MCPToolHandlers } from '@omar391/mcp-kit/server/core/types';
import { createToolHandlers } from '@omar391/mcp-kit/server/handlers';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { ToolNames } from './constants/tool-names.js';
import { initializeGlobalDatabaseService, type GlobalDatabaseService } from './database/global-queries.js';
import { DatabaseService } from './services/database-service.js';
import { SeedManager } from './services/seed-manager.js';
import { PromptOrchestrator } from './services/prompt-orchestrator.js';
import { createApiRouter, SSEEventManager } from './api/router.js';
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
import { UpdateResourcesTool, updateResourcesToolSchema } from './tools/update-resources.js';
import { UpdateStepsTool, updateStepsToolSchema } from './tools/update-steps.js';
import { SpeclyInstanceManager } from './server/instance-manager.js';
import { InstanceManager } from '@omar391/mcp-kit/server/local/node-instance';

// Legacy multi-step types removed; all tools now return SpeclyToolResult.

// Global variables
let seedManager: SeedManager;
let lastSeedSummary: any | null = null;
let orchestrator: PromptOrchestrator;
let initTool: InitToolNew;
let startTool: StartTool;
let addTool: AddToolNew;

let statusTool: StatusToolNew;
let updateTool: UpdateToolNew;
let auditTool: AuditToolNew;
let focusTool: FocusToolNew;
let githubTool: GitHubTool;
let ruleUpdateTool: RuleUpdateTool;
let remoteInterfaceTool: RemoteInterfaceTool;
let updateResourcesTool: UpdateResourcesTool;
let updateStepsTool: UpdateStepsTool;

let globalDbService: GlobalDatabaseService;
let databaseService: DatabaseService;
let sseManager: SSEEventManager;

let serverInitialized = false;

async function initializeServer() {
  try {
    // Initialize global database using pure Drizzle system
    globalDbService = await initializeGlobalDatabaseService();
    const globalDrizzleManager = globalDbService.getDrizzleManager();

    // Create DatabaseService for API endpoints
    databaseService = new DatabaseService(globalDrizzleManager);

    // Initialize SSE manager
    sseManager = new SSEEventManager();

    // Initialize services with pure Drizzle operations
    seedManager = new SeedManager(globalDrizzleManager);
    orchestrator = new PromptOrchestrator(globalDrizzleManager);

    // Initialize tools with pure Drizzle database manager
    initTool = new InitToolNew(globalDrizzleManager);
    startTool = new StartTool(globalDrizzleManager);
    addTool = new AddToolNew(globalDrizzleManager);

    statusTool = new StatusToolNew(globalDrizzleManager);
    updateTool = new UpdateToolNew(globalDrizzleManager);
    auditTool = new AuditToolNew(globalDrizzleManager);
    focusTool = new FocusToolNew(globalDrizzleManager);
    githubTool = new GitHubTool(globalDrizzleManager);
    ruleUpdateTool = new RuleUpdateTool(globalDrizzleManager);
    remoteInterfaceTool = new RemoteInterfaceTool(globalDrizzleManager);
    updateResourcesTool = new UpdateResourcesTool(globalDrizzleManager);
    updateStepsTool = new UpdateStepsTool(globalDrizzleManager);

    // Initialize global seed data (MCP server mappings etc.)
    await seedManager.initializeGlobalData();

    serverInitialized = true;
  } catch (error) {
    console.error('Error initializing server:', error);
    throw error;
  }
}

async function ensureServerInitialized(): Promise<void> {
  if (serverInitialized) {
    return;
  }
  await initializeServer();
}

function createMCPToolHandlers(): MCPToolHandlers {
  const specs = [
    { name: ToolNames.INIT, description: "Initialize a Specly workspace with .task folder structure and configuration", schema: initToolSchema, exec: (input: any) => initTool.execute(input) },
    {
      name: ToolNames.START, description: "Initialize Specly session for a workspace and provide comprehensive project context", schema: startToolSchema, exec: async (input: any) => {
        const result = await startTool.execute(input); return { content: result.content, isError: result.isError };
      }
    },
    { name: ToolNames.ADD, description: "Orchestrate task creation workflow with analytical validation", schema: addToolSchema, exec: (input: any) => addTool.execute(input) },
    { name: ToolNames.STATUS, description: "Generate comprehensive project status report with analysis and recommendations", schema: statusToolSchema, exec: (input: any) => statusTool.execute(input) },
    { name: ToolNames.UPDATE, description: "Update task properties with audit trail and validation", schema: updateToolSchema, exec: (input: any) => updateTool.execute(input) },
    { name: ToolNames.AUDIT, description: "Perform comprehensive project audit with health checking and cleanup recommendations", schema: auditToolSchema, exec: (input: any) => auditTool.execute(input as any) },
    { name: ToolNames.FOCUS, description: "Focus on a specific task and provide comprehensive implementation context", schema: focusToolSchema, exec: (input: any) => focusTool.execute(input) },
    { name: ToolNames.GITHUB, description: "Integrate with GitHub for issue creation, PR management, and task synchronization", schema: githubToolSchema, exec: async (input: any) => { const r = await githubTool.execute(input); return { content: r.content, isError: r.isError }; } },
    { name: ToolNames.RULE_UPDATE, description: "Manage workspace-specific rules and guidelines", schema: ruleUpdateToolSchema, exec: async (input: any) => { const r = await ruleUpdateTool.execute(input); return { content: r.content, isError: r.isError }; } },
    { name: ToolNames.REMOTE_INTERFACE, description: "Manage connections to external systems for task synchronization", schema: remoteInterfaceToolSchema, exec: async (input: any) => { const r = await remoteInterfaceTool.execute(input); return { content: r.content, isError: r.isError }; } },
    { name: ToolNames.UPDATE_RESOURCES, description: "Update project documentation resources like project.md and design.md", schema: updateResourcesToolSchema, exec: async (input: any) => { const r = await updateResourcesTool.execute(input); return { content: r.content, isError: r.isError }; } },
    { name: ToolNames.UPDATE_STEPS, description: "Update workspace-specific feedback steps and validation rules", schema: updateStepsToolSchema, exec: async (input: any) => { const r = await updateStepsTool.execute(input); return { content: r.content, isError: r.isError }; } },
  ];

  const handlers = createToolHandlers(specs);

  // Adapt listTools to emit json-schema objects for UI/SDK consumers
  const listTools = async () => {
    const lt = await handlers.listTools();
    return {
      tools: lt.tools.map((t: any) => ({ ...t, inputSchema: zodToJsonSchema(t.inputSchema) }))
    };
  };

  return { listTools, handleToolCall: handlers.handleToolCall } as MCPToolHandlers;
}

// Configure Specly-specific Hono app settings
async function configureSpeclyApp(app: any, options: { dev: boolean }) {
  // Add development-specific middleware
  if (options.dev) {
    console.log('  CORS: Enabled for localhost development');
  }
}

// Setup Specly API routes in Hono app
async function setupSpeclyApi(app: any, databaseService: DatabaseService) {
  const apiRouter = await createApiRouter(databaseService);

  // TODO: Integrate Express apiRouter with Hono
  // Currently adding basic routes directly since Express router can't be mounted in Hono
  // Need to either migrate API to Hono or create Express-to-Hono adapter

  app.get('/api/health', (c: any) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
  app.get('/api/workspaces', async (c: any) => {
    try {
      // Basic implementation - would need full migration
      return c.json({ workspaces: [], message: 'API migration in progress' });
    } catch (error) {
      return c.json({ error: 'Failed to fetch workspaces' }, 500);
    }
  });

  // Add SSE endpoint
  app.get('/api/events', (c: any) => {
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  });
}

async function ensureSpeclySeed(force: boolean) {
  // Detect if Specly baseline exists by checking for root profile
  try {
    const db = globalDbService.getDrizzleManager().getDb();
    const rows = await db.all?.("SELECT id FROM profiles WHERE name = 'root-profile' LIMIT 1") || [];
    const needsSeed = force || rows.length === 0;
    if (needsSeed) {
      const result = await seedManager.seedSpecly();
      lastSeedSummary = { event: 'specly_seed_summary', timestamp: new Date().toISOString(), ...result, forced: force };
      // Single authoritative summary line
      console.log(JSON.stringify(lastSeedSummary));
    }
  } catch (err) {
    console.error('Error checking/performing Specly seed:', err);
  }
}

export async function main() {
  await startMcpServer<CliOptions>({
    serverName: 'specly',
    serverVersion: SpeclyInstanceManager.VERSION,
    toolHandlers: createMCPToolHandlers(),
    defaultPort: 8989,
    createInstanceManager: (options) => {
      if (options.local) {
        return new SpeclyInstanceManager(undefined, options.port);
      } else {
        return new InstanceManager({
          lockPath: undefined,
          port: options.port,
          getVersion: () => SpeclyInstanceManager.VERSION
        });
      }
    },
    onInitialize: async (options) => {
      await ensureServerInitialized();
      await ensureSpeclySeed(!!options.forceSeed);
    },
    configureApp: async (app, options) => {
      await configureSpeclyApp(app, { dev: options.local });
    },
    setupRoutes: async (app, options) => {
      await setupSpeclyApi(app, databaseService);
    },
    onAfterStart: async (app, options) => {
      console.log(`Specly backend server running on http://localhost:${options.port}`);
    },
    localMode: {
      onLocalStart: async (instanceManager, options) => {
        if (instanceManager instanceof SpeclyInstanceManager) {
          instanceManager.startBackgroundJobs(globalDbService);
        }
      },
      setupLocalRoutes: async (app, instanceManager, options) => {
        if (instanceManager instanceof SpeclyInstanceManager) {
          app.post('/shutdown', async (c: any) => {
            console.log('Shutdown requested via API');
            instanceManager.stopBackgroundJobs();
            // Graceful shutdown
            setTimeout(() => {
              process.exit(0);
            }, 100);
            return c.json({ status: 'shutting_down' });
          });

          app.post('/transition', async (c: any) => {
            console.log('Version transition requested via API');
            instanceManager.stopBackgroundJobs();
            // Start new instance
            setTimeout(async () => {
              const { spawn } = await import('child_process');
              spawn(process.argv[0], process.argv.slice(1), {
                detached: true,
                stdio: 'inherit',
              }).unref();
            }, 100);
            return c.json({ status: 'transitioning' });
          });
        }
      },
    },
    cliConfig: {
      customFlagHandlers: {
        '--force-seed': () => {
          // This will be handled by the custom options parser
        },
      },
      customOptionsParser: (args, options) => {
        // Parse Specly-specific options
        const forceSeed = args.includes('--force-seed') || process.env.SPECLY_FORCE_SEED === '1';
        return { ...options, forceSeed };
      },
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('dist/index.js')) {
  main().catch((err) => {
    // Only log error if not in stdio mode
    let cliOptions: CliOptions;
    try {
      cliOptions = parseCliArgs();
    } catch {
      cliOptions = {
        port: 8989,
        mode: 'http',
        local: false,
        help: false,
        killExisting: true,
        forceSeed: false,
      };
    }
    if (!cliOptions.mode || cliOptions.mode !== 'stdio') {
      console.error(err);
    }
  });
}
