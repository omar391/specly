#!/usr/bin/env node

/**
 * Specly Integrated Server
 * 
 * Unified server that combines MCP server + UI + REST API
 */

import { ToolNames } from './constants/tool-names.js';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { initializeGlobalDatabaseService, type GlobalDatabaseService } from './database/global-queries.js';
import { DatabaseService } from './services/database-service.js';
import { SeedManager } from './services/seed-manager.js';
import { PromptOrchestrator } from './services/prompt-orchestrator.js';

// Type definitions
interface CmdOptions {
  mode?: 'stdio' | 'http';
  port?: number;
  help?: boolean;
  forceSeed?: boolean;
}

// Utils
import { parseCliArgs, displayHelp } from './utils/cli-parser.js';
import { ensurePortFree } from './utils/process-manager.js';

// Express server
import { ExpressServer, MCPToolHandlers } from './server/express-server.js';

import { zodToJsonSchema } from 'zod-to-json-schema';
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
import { InstanceManager } from './server/instance-manager.js';
import { SpeclyToolResult } from './types/index.js';

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
let expressServer: ExpressServer | null = null;

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

  } catch (error) {
    console.error('Error initializing server:', error);
    throw error;
  }
}

function createMCPToolHandlers(): MCPToolHandlers {
  return {
    async listTools() {
      return {
        tools: [
          {
            name: ToolNames.INIT,
            description: "Initialize a Specly workspace with .task folder structure and configuration",
            inputSchema: zodToJsonSchema(initToolSchema),
          },
          {
            name: ToolNames.START,
            description: "Initialize Specly session for a workspace and provide comprehensive project context",
            inputSchema: zodToJsonSchema(startToolSchema),
          },
          {
            name: ToolNames.ADD,
            description: "Orchestrate task creation workflow with analytical validation",
            inputSchema: zodToJsonSchema(addToolSchema),
          },
          {
            name: ToolNames.STATUS,
            description: "Generate comprehensive project status report with analysis and recommendations",
            inputSchema: zodToJsonSchema(statusToolSchema),
          },
          {
            name: ToolNames.UPDATE,
            description: "Update task properties with audit trail and validation",
            inputSchema: zodToJsonSchema(updateToolSchema),
          },
          {
            name: ToolNames.AUDIT,
            description: "Perform comprehensive project audit with health checking and cleanup recommendations",
            inputSchema: zodToJsonSchema(auditToolSchema),
          },
          {
            name: ToolNames.FOCUS,
            description: "Focus on a specific task and provide comprehensive implementation context",
            inputSchema: zodToJsonSchema(focusToolSchema),
          },
          {
            name: ToolNames.GITHUB,
            description: "Integrate with GitHub for issue creation, PR management, and task synchronization",
            inputSchema: zodToJsonSchema(githubToolSchema),
          },
          {
            name: ToolNames.RULE_UPDATE,
            description: "Manage workspace-specific rules and guidelines",
            inputSchema: zodToJsonSchema(ruleUpdateToolSchema),
          },
          {
            name: ToolNames.REMOTE_INTERFACE,
            description: "Manage connections to external systems for task synchronization",
            inputSchema: zodToJsonSchema(remoteInterfaceToolSchema),
          },
          {
            name: ToolNames.UPDATE_RESOURCES,
            description: "Update project documentation resources like project.md and design.md",
            inputSchema: zodToJsonSchema(updateResourcesToolSchema),
          },
          {
            name: ToolNames.UPDATE_STEPS,
            description: "Update workspace-specific feedback steps and validation rules",
            inputSchema: zodToJsonSchema(updateStepsToolSchema),
          },
        ],
      };
    },

    async handleToolCall(name: string, args: Record<string, unknown>) {
      try {
        switch (name) {
          case ToolNames.INIT: {
            const input = initToolSchema.parse(args);
            const result = await initTool.execute(input);
            return result;
          }

          case ToolNames.START: {
            const input = startToolSchema.parse(args);
            const result = await startTool.execute(input);
            return {
              content: result.content,
              isError: result.isError
            };
          }

          case ToolNames.ADD: {
            const input = addToolSchema.parse(args);
            const result = await addTool.execute(input);
            return result;
          }



          case ToolNames.STATUS: {
            const input = statusToolSchema.parse(args);
            const result = await statusTool.execute(input);
            return result;
          }

          case ToolNames.UPDATE: {
            const input = updateToolSchema.parse(args);
            const result = await updateTool.execute(input);
            return result;
          }

          case ToolNames.AUDIT: {
            const input = auditToolSchema.parse(args);
            const result = await auditTool.execute(input as any);
            return result;
          }

          case ToolNames.FOCUS: {
            const input = focusToolSchema.parse(args);
            const result = await focusTool.execute(input);
            return result;
          }

          case ToolNames.GITHUB: {
            const input = githubToolSchema.parse(args);
            const result = await githubTool.execute(input);
            return {
              content: result.content,
              isError: result.isError
            };
          }

          case ToolNames.RULE_UPDATE: {
            const input = ruleUpdateToolSchema.parse(args);
            const result = await ruleUpdateTool.execute(input);
            return {
              content: result.content,
              isError: result.isError
            };
          }

          case ToolNames.REMOTE_INTERFACE: {
            const input = remoteInterfaceToolSchema.parse(args);
            const result = await remoteInterfaceTool.execute(input);
            return {
              content: result.content,
              isError: result.isError
            };
          }

          case ToolNames.UPDATE_RESOURCES: {
            const input = updateResourcesToolSchema.parse(args);
            const result = await updateResourcesTool.execute(input);
            return {
              content: result.content,
              isError: result.isError
            };
          }

          case ToolNames.UPDATE_STEPS: {
            const input = updateStepsToolSchema.parse(args);
            const result = await updateStepsTool.execute(input);
            return {
              content: result.content,
              isError: result.isError
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true
        };
      }
    }
  };
}

async function startStdioMode(cliOptions: CmdOptions) {
  // In stdio mode, prefix all logs with [DEBUG] and ensure they go to stderr
  if (cliOptions.mode === 'stdio') {
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => originalError('[DEBUG]', ...args);
    console.error = (...args) => originalError('[DEBUG]', ...args);
  }

  // POTENTIAL ISSUE: This console.log goes to stdout, violating MCP protocol
  if (cliOptions.mode !== 'stdio') {
    // Allow error logs only in test for debugging
    console.error('[DEBUG] Starting Specly MCP server in STDIO mode (logging to stderr)');
  }

  const server = new Server(
    {
      name: "specly",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const toolHandlers = createMCPToolHandlers();

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, toolHandlers.listTools);

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Avoid debug logs in stdio mode
    if (cliOptions.mode !== 'stdio') {
      console.debug(`[DEBUG] MCP tool call received: ${request.params.name}`);
    }
    const { name, arguments: args } = request.params;
    return await toolHandlers.handleToolCall(name, args);
  });

  // Start the server
  const transport = new StdioServerTransport();
  if (cliOptions.mode !== 'stdio') {
    console.error('[DEBUG] Connecting to STDIO transport...');
  }
  await server.connect(transport);

  // POTENTIAL ISSUE: This console.log goes to stdout, violating MCP protocol
  if (cliOptions.mode !== 'stdio') {
    console.error('[DEBUG] Specly MCP server running on stdio (logging to stderr)');
  }
}

async function startHttpMode(port: number) {
  console.log(`Starting Specly integrated server on port ${port}`);

  // Ensure port is free (killing any processes using it)
  const portFree = await ensurePortFree(port);
  if (!portFree) {
    throw new Error(`Unable to free port ${port} for Specly server`);
  }

  // Create Express server
  expressServer = new ExpressServer({ port, dev: process.env.NODE_ENV !== 'production' });

  // Add /__version and /__shutdown endpoints for multi-instance/proxy logic
  expressServer.registerCustomEndpoints((app) => {
    app.get('/__version', (req, res) => {
      res.json({ version: require('./server/instance-manager.js').InstanceManager.VERSION });
    });
    app.post('/__shutdown', (req, res) => {
      res.status(200).json({ ok: true });
      setTimeout(() => process.exit(0), 100);
    });
  });
  // Setup MCP endpoint with SSE
  const toolHandlers = createMCPToolHandlers();
  expressServer.setupMCPEndpoint(toolHandlers);

  // Setup REST API endpoints
  await expressServer.setupAPIEndpoints(databaseService);

  // Setup health check
  expressServer.setupHealthCheck();

  // Setup graceful shutdown handling with Express server cleanup
  setupGracefulShutdown();

  // Start the server
  await expressServer.start();
}

function setupGracefulShutdown(): void {
  const shutdownHandler = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down Specly Integrated Server gracefully...`);

    try {
      if (expressServer) {
        await expressServer.stop();
      }
    } catch (error) {
      console.error('Error during shutdown:', error);
    }

    console.log('Specly Integrated Server shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGUSR1', () => shutdownHandler('SIGUSR1'));
  process.on('SIGUSR2', () => shutdownHandler('SIGUSR2'));

  // Handle uncaught exceptions gracefully
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.log('Shutting down due to uncaught exception...');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.log('Shutting down due to unhandled rejection...');
    process.exit(1);
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

async function main() {
  let cliOptions: CmdOptions | undefined;
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

  // Initialize server
  await initializeServer();
  await ensureSpeclySeed(!!cliOptions.forceSeed);

    // Start in appropriate mode

    // Multi-instance/proxy logic
    const instanceManager = new InstanceManager();
    let isMain = await instanceManager.tryBecomeMain();
    if (!isMain) {
      // Read lock and check PID liveness
      const lock = await instanceManager.readLock();
      if (!lock || !InstanceManager.isPidAlive(lock.pid)) {
        // Stale lock, remove and try to become main again
        await instanceManager.removeLock();
        isMain = await instanceManager.tryBecomeMain();
      }
    }

    if (!isMain) {
      // Check version of running main instance
      const mainVersion = await instanceManager.fetchMainVersion();
      if (mainVersion === InstanceManager.VERSION) {
        // Proxy mode: forward all requests to main instance
        const proxyServer = await instanceManager.startProxy();
        const port = instanceManager.proxyPort;
        console.log(`[PROXY MODE] Main instance running on port 8989. Proxying on port ${port}.`);
        // Keep process alive
        await new Promise(() => { });
      } else {
        // Version mismatch: request shutdown, wait, then become main
        const shutdownOk = await instanceManager.requestMainShutdown();
        if (shutdownOk) {
          await instanceManager.waitForPort(10000);
          await instanceManager.removeLock();
          isMain = await instanceManager.tryBecomeMain();
          if (!isMain) {
            throw new Error("Failed to take over as main instance after shutdown.");
          }
        } else {
          throw new Error("Failed to shutdown old main instance (version mismatch).");
        }
      }
    }

    // Main instance: proceed with normal startup
    // we only allow stdio mode for main instance
    // underlying reason is: we are using sqlite3 db which may cause issues for multi writer
    if (isMain) {
      if (cliOptions.mode === 'stdio') {
        // Avoid debug logs in stdio mode
        await startStdioMode(cliOptions);
      }
      await startHttpMode(cliOptions.port || 3000);
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
    let cliOptions: CmdOptions;
    try {
      cliOptions = parseCliArgs();
    } catch {
      cliOptions = {};
    }
    if (!cliOptions.mode || cliOptions.mode !== 'stdio') {
      console.error(err);
    }
  });
}
