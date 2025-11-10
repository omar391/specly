#!/usr/bin/env node

/**
 * Specly Integrated Server
 * 
 * Unified server that combines MCP server + UI + REST API
 */

import { ToolNames } from './constants/tool-names.js';
// stdio server is handled via mcp-kit utilities now

import { initializeGlobalDatabaseService, type GlobalDatabaseService } from './database/global-queries.js';
import { DatabaseService } from './services/database-service.js';
import { SeedManager } from './services/seed-manager.js';
import { PromptOrchestrator } from './services/prompt-orchestrator.js';
import { parseCliArgs, displayHelp, type CliOptions } from './utils/cli-parser.js';
import { ensurePortAvailable as ensurePortFree } from '@omar391/mcp-kit/server/express/port-manager';

import type { MCPToolHandlers } from '@omar391/mcp-kit/server/express';
import { startMcpServer } from '@omar391/mcp-kit/server';

import { zodToJsonSchema } from 'zod-to-json-schema';
import { createToolHandlers } from '@omar391/mcp-kit/server/handlers';
import { startStdioServer } from '@omar391/mcp-kit/server/stdio';
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
import { SpeclyInstanceManager, InstanceRole } from './server/instance-manager.js';
import { SpeclyToolResult } from './types/index.js';
import { startStdioProxy } from '@omar391/mcp-kit/server/express';
import { configureSpeclyApp, setupSpeclyApi } from './server/specly-express-hooks.js';

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

let serverInitialized = false;

async function initializeServer() {
  try {
    // Initialize global database using pure Drizzle system
    globalDbService = await initializeGlobalDatabaseService();
    const globalDrizzleManager = globalDbService.getDrizzleManager();

    // Create DatabaseService for API endpoints
    databaseService = new DatabaseService(globalDrizzleManager);


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

// Proxy: forward MCP stdio to main via generic mcp-kit utility
// (No wrapper function needed anymore)

async function startStdioMode(cliOptions: CliOptions) {
  await ensureServerInitialized();
  const toolHandlers = createMCPToolHandlers();
  await startStdioServer({ serverName: 'specly', serverVersion: '0.1.0', handlers: toolHandlers, debug: true });
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
  let cliOptions: CliOptions | undefined;
  try {
    // Parse CLI arguments
    cliOptions = parseCliArgs();

    // DIAGNOSTIC: Log parsed CLI options to stderr (not stdout to avoid MCP protocol pollution)
    if (cliOptions.mode !== 'stdio') {
      console.error(`[DEBUG] Parsed CLI options:`, JSON.stringify(cliOptions, null, 2));
      console.error(`[DEBUG] Process argv:`, process.argv);
    }

    if (cliOptions.help) {
      displayHelp();
      process.exit(0);
    }

    // DIAGNOSTIC: Log mode detection
    if (cliOptions.mode !== 'stdio') {
      console.error(`[DEBUG] Starting in mode: ${cliOptions.mode}`);
    }

    const port = cliOptions.port ?? 8989;
    const dev = cliOptions.dev || process.env.NODE_ENV !== 'production';
    const instanceManager = new SpeclyInstanceManager(undefined, port);

    const serverResult = await startMcpServer({
      kind: 'express',
      port,
      dev,
      serverName: 'specly',
      serverVersion: SpeclyInstanceManager.VERSION,
      instanceManager,
      autoProxy: cliOptions.mode !== 'stdio',
      expressOptions: {
        port,
        dev,
        info: { name: 'specly', version: SpeclyInstanceManager.VERSION, uiHintUrl: 'http://localhost:5173' },
        endpoints: { apiBase: '/api', mcpBase: '/mcp', healthPath: '/health' },
        cors: { allowAnyLocalhost: true, credentials: true },
      },
      coordinateInstance: {
        desiredVersion: SpeclyInstanceManager.VERSION,
        waitForPortTimeoutMs: 10000,
        removeStaleLock: true,
      },
      toolHandlers: async () => {
        await ensureServerInitialized();
        return createMCPToolHandlers();
      },
      configureApp: async (app) => {
        configureSpeclyApp(app, { dev });
      },
      setupApi: async (server) => {
        await ensureServerInitialized();
        await setupSpeclyApi(server, databaseService);
      },
      onBeforeStart: async () => {
        await ensureServerInitialized();
        const killExisting = cliOptions!.killExisting;
        const portFree = await ensurePortFree(port, killExisting);
        if (!portFree) {
          if (!killExisting) {
            throw new Error(`Port ${port} is already in use and --no-kill was provided (start aborted).`);
          }
          throw new Error(`Unable to free port ${port} for Specly server`);
        }
        await ensureSpeclySeed(!!cliOptions!.forceSeed);
        instanceManager.startBackgroundJobs(globalDbService);
      },
      onAfterStart: async () => {
        console.log(`Specly backend server running on http://localhost:${port}`);
        console.log(`  API: http://localhost:${port}/api`);
        console.log(`  MCP: http://localhost:${port}/mcp`);
        console.log(`  Health: http://localhost:${port}/health`);
        if (dev) {
          console.log(`  CORS: Enabled for localhost development`);
          console.log(`  Note: UI should run separately on http://localhost:5173`);
        }
      },
      onProxyStart: async (context) => {
        const mainVersion = SpeclyInstanceManager.VERSION;
        if (cliOptions!.mode === 'stdio') {
          console.error(`[PROXY MODE] Main instance v${mainVersion} running on port ${instanceManager.port}. Starting stdio proxy.`);
          await startStdioProxy({
            port: instanceManager.port,
            serverName: 'specly',
            serverVersion: SpeclyInstanceManager.VERSION,
            clientName: 'specly-proxy',
            debug: true,
          });
        } else {
          const proxyPort = context.instanceManager.proxyPort;
          console.log(`[PROXY MODE] Main instance v${mainVersion} running on port ${instanceManager.port}. Proxying on port ${proxyPort}.`);
        }
      },
      gracefulShutdown: async ({ expressServer }) => {
        instanceManager.stopBackgroundJobs();
        await expressServer.stop();
      },
      controlEndpoints: {
        onShutdown: async () => {
          instanceManager.stopBackgroundJobs();
        },
        onTransition: async () => {
          instanceManager.stopBackgroundJobs();
          setTimeout(async () => {
            const { spawn } = await import('child_process');
            spawn(process.argv[0], process.argv.slice(1), {
              detached: true,
              stdio: 'inherit',
            }).unref();
          }, 100);
        },
      },
    });

    if (serverResult.role === InstanceRole.PROXY) {
      return;
    }

    const coordination = serverResult.coordination;
    if (coordination?.reason === 'version-transition') {
      const previous = coordination.previousVersion ?? 'unknown';
      console.log(`[VERSION CHANGE] Current v${SpeclyInstanceManager.VERSION}, main is v${previous}. Taking over...`);
      console.log(`[VERSION CHANGE] Successfully became main instance v${SpeclyInstanceManager.VERSION}`);
    }

    console.log(`[MAIN INSTANCE] Starting v${SpeclyInstanceManager.VERSION}`);
    if (cliOptions.mode === 'stdio') {
      await startStdioMode(cliOptions);
    }

  } catch (error) {
    // Only log error if cliOptions is defined and not stdio mode
    if (cliOptions && cliOptions.mode !== 'stdio') {
      console.error('Error starting server:', error);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // Only log error if not in stdio mode
    let cliOptions: CliOptions;
    try {
      cliOptions = parseCliArgs();
    } catch {
      cliOptions = {
        port: 8989,
        mode: 'http',
        dev: false,
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
