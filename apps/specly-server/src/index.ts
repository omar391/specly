import { startMcpServer, type ExtendedCliOptions } from '@omar391/mcp-kit/server';
import { parseCliArgs } from '@omar391/mcp-kit/utils/cli-parser';
import { MCPToolHandlers } from '@omar391/mcp-kit/server/core/types';
import { createToolHandlers } from '@omar391/mcp-kit/server';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Hono, type Context } from 'hono';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

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
import { InstanceManager } from '@omar391/mcp-kit/server/local/node-instance';
import { BackgroundJobsService } from './services/background-jobs-service.js';

// Version constant
export const SPECLY_VERSION = (() => {
  try {
    const pkgPath = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
})();

/**
 * SpeclyServer class encapsulates all server state and initialization
 */
export class SpeclyServer {
  private seedManager!: SeedManager;
  private lastSeedSummary: any | null = null;
  private orchestrator!: PromptOrchestrator;
  private initTool!: InitToolNew;
  private startTool!: StartTool;
  private addTool!: AddToolNew;
  private statusTool!: StatusToolNew;
  private updateTool!: UpdateToolNew;
  private auditTool!: AuditToolNew;
  private focusTool!: FocusToolNew;
  private githubTool!: GitHubTool;
  private ruleUpdateTool!: RuleUpdateTool;
  private remoteInterfaceTool!: RemoteInterfaceTool;
  private updateResourcesTool!: UpdateResourcesTool;
  private updateStepsTool!: UpdateStepsTool;
  private globalDbService!: GlobalDatabaseService;
  private databaseService!: DatabaseService;
  private sseManager!: SSEEventManager;
  private serverInitialized = false;
  private backgroundJobsService?: BackgroundJobsService;
  private gcInterval: NodeJS.Timeout | null = null;

  async initializeServer() {
    try {
      // Initialize global database using pure Drizzle system
      this.globalDbService = await initializeGlobalDatabaseService();
      const globalDrizzleManager = this.globalDbService.getDrizzleManager();

      // Create DatabaseService for API endpoints
      this.databaseService = new DatabaseService(globalDrizzleManager);

      // Initialize SSE manager
      this.sseManager = new SSEEventManager();

      // Initialize services with pure Drizzle operations
      this.seedManager = new SeedManager(globalDrizzleManager);
      this.orchestrator = new PromptOrchestrator(globalDrizzleManager);

      // Initialize tools with pure Drizzle database manager
      this.initTool = new InitToolNew(globalDrizzleManager);
      this.startTool = new StartTool(globalDrizzleManager);
      this.addTool = new AddToolNew(globalDrizzleManager);
      this.statusTool = new StatusToolNew(globalDrizzleManager);
      this.updateTool = new UpdateToolNew(globalDrizzleManager);
      this.auditTool = new AuditToolNew(globalDrizzleManager);
      this.focusTool = new FocusToolNew(globalDrizzleManager);
      this.githubTool = new GitHubTool(globalDrizzleManager);
      this.ruleUpdateTool = new RuleUpdateTool(globalDrizzleManager);
      this.remoteInterfaceTool = new RemoteInterfaceTool(globalDrizzleManager);
      this.updateResourcesTool = new UpdateResourcesTool(globalDrizzleManager);
      this.updateStepsTool = new UpdateStepsTool(globalDrizzleManager);

      // Initialize global seed data (MCP server mappings etc.)
      await this.seedManager.initializeGlobalData();

      this.serverInitialized = true;
    } catch (error) {
      console.error('Error initializing server:', error);
      throw error;
    }
  }

  async ensureServerInitialized(): Promise<void> {
    if (this.serverInitialized) {
      return;
    }
    await this.initializeServer();
  }

  createMCPToolHandlers(): MCPToolHandlers {
    // Capture tool instances in closures to ensure proper binding
    const initTool = this.initTool;
    const startTool = this.startTool;
    const addTool = this.addTool;
    const statusTool = this.statusTool;
    const updateTool = this.updateTool;
    const auditTool = this.auditTool;
    const focusTool = this.focusTool;
    const githubTool = this.githubTool;
    const ruleUpdateTool = this.ruleUpdateTool;
    const remoteInterfaceTool = this.remoteInterfaceTool;
    const updateResourcesTool = this.updateResourcesTool;
    const updateStepsTool = this.updateStepsTool;

    const specs = [
      { name: ToolNames.INIT, description: "Initialize a Specly workspace with .task folder structure and configuration", schema: initToolSchema, exec: async (input: any) => await initTool.execute(input) },
      {
        name: ToolNames.START, description: "Initialize Specly session for a workspace and provide comprehensive project context", schema: startToolSchema, exec: async (input: any) => {
          const result = await startTool.execute(input); return result;
        }
      },
      { name: ToolNames.ADD, description: "Orchestrate task creation workflow with analytical validation", schema: addToolSchema, exec: async (input: any) => await addTool.execute(input) },
      { name: ToolNames.STATUS, description: "Generate comprehensive project status report with analysis and recommendations", schema: statusToolSchema, exec: async (input: any) => await statusTool.execute(input) },
      { name: ToolNames.UPDATE, description: "Update task properties with audit trail and validation", schema: updateToolSchema, exec: async (input: any) => await updateTool.execute(input) },
      { name: ToolNames.AUDIT, description: "Perform comprehensive project audit with health checking and cleanup recommendations", schema: auditToolSchema, exec: async (input: any) => await auditTool.execute(input as any) },
      { name: ToolNames.FOCUS, description: "Focus on a specific task and provide comprehensive implementation context", schema: focusToolSchema, exec: async (input: any) => await focusTool.execute(input) },
      { name: ToolNames.GITHUB, description: "Integrate with GitHub for issue creation, PR management, and task synchronization", schema: githubToolSchema, exec: async (input: any) => await githubTool.execute(input) },
      { name: ToolNames.RULE_UPDATE, description: "Manage workspace-specific rules and guidelines", schema: ruleUpdateToolSchema, exec: async (input: any) => await ruleUpdateTool.execute(input) },
      { name: ToolNames.REMOTE_INTERFACE, description: "Manage connections to external systems for task synchronization", schema: remoteInterfaceToolSchema, exec: async (input: any) => await remoteInterfaceTool.execute(input) },
      { name: ToolNames.UPDATE_RESOURCES, description: "Update project documentation resources like project.md and design.md", schema: updateResourcesToolSchema, exec: async (input: any) => await updateResourcesTool.execute(input) },
      { name: ToolNames.UPDATE_STEPS, description: "Update workspace-specific feedback steps and validation rules", schema: updateStepsToolSchema, exec: async (input: any) => await updateStepsTool.execute(input) },
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
  async configureSpeclyApp(app: Hono, options: { local: boolean }) {
    // Add error handling
    app.onError((error: Error, c: Context) => {
      console.error('API Error:', error);

      // Default error response
      let statusCode = 500;
      let errorResponse = { error: { code: 'INTERNAL_ERROR', message: 'An internal server error occurred' } };

      // Handle specific error types
      if (error.name === 'ValidationError') {
        statusCode = 422;
        errorResponse = { error: { code: 'VALIDATION_ERROR', message: error.message } };
      } else if (error.name === 'NotFoundError') {
        statusCode = 404;
        errorResponse = { error: { code: 'NOT_FOUND', message: error.message } };
      } else if (error.name === 'BadRequestError') {
        statusCode = 400;
        errorResponse = { error: { code: 'BAD_REQUEST', message: error.message } };
      }

      return c.json(errorResponse, statusCode as any);
    });

    // Add development-specific middleware
    if (options.local) {
      console.log('  CORS: Enabled for localhost development');
    }
  }

  // Setup Specly API routes in Hono app
  async setupSpeclyApi(app: Hono) {
    const apiRouter = await createApiRouter(this.databaseService);
    app.route('/api', apiRouter);
  }

  async ensureSpeclySeed(force: boolean) {
    // Detect if Specly baseline exists by checking for root profile
    try {
      const db = this.globalDbService.getDrizzleManager().getDb();
      const rows = await db.all?.("SELECT id FROM profiles WHERE name = 'root-profile' LIMIT 1") || [];
      const needsSeed = force || rows.length === 0;
      if (needsSeed) {
        const result = await this.seedManager.seedSpecly();
        this.lastSeedSummary = { event: 'specly_seed_summary', timestamp: new Date().toISOString(), ...result, forced: force };
        // Single authoritative summary line
        console.log(JSON.stringify(this.lastSeedSummary));
      }
    } catch (err) {
      console.error('Error checking/performing Specly seed:', err);
    }
  }

  getGlobalDbService(): GlobalDatabaseService {
    if (!this.serverInitialized || !this.globalDbService) {
      throw new Error('Server not initialized. Call initializeServer() first.');
    }
    return this.globalDbService;
  }

  startBackgroundJobs(): void {
    if (this.backgroundJobsService) return; // already started

    const config = {
      transientSessionHours: parseInt(process.env.SPECLY_GC_TRANSIENT_SESSION_HOURS || '24', 10),
      softDeleteDays: parseInt(process.env.SPECLY_GC_SOFT_DELETE_DAYS || '90', 10),
      enabled: process.env.SPECLY_GC_ENABLED !== 'false'
    };

    if (!config.enabled) {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'Background jobs disabled via SPECLY_GC_ENABLED=false'
      }));
      return;
    }

    this.backgroundJobsService = new BackgroundJobsService(this.globalDbService, config);

    this.backgroundJobsService.runAll().then((results: any) => {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'Initial GC sweep completed',
        transient_sessions_deleted: results.transientSessionsDeleted,
        soft_delete_purged: results.softDeletePurged
      }));
    }).catch((err: Error) => {
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        msg: 'Initial GC sweep failed',
        error: err.message
      }));
    });

    const intervalMs = 60 * 60 * 1000; // 1 hour
    this.gcInterval = setInterval(() => {
      this.backgroundJobsService!.runAll().catch((err: Error) => {
        console.error(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          msg: 'Scheduled GC sweep failed',
          error: err.message
        }));
      });
    }, intervalMs);

    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      msg: 'Background jobs started',
      transient_session_hours: config.transientSessionHours,
      soft_delete_days: config.softDeleteDays,
      sweep_interval_ms: intervalMs
    }));
  }

  stopBackgroundJobs(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
      this.backgroundJobsService = undefined;
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'Background jobs stopped'
      }));
    }
  }
}

// Create singleton instance
const speclyServer = new SpeclyServer();

export async function initializeServer() {
  await speclyServer.initializeServer();
}

export async function ensureServerInitialized(): Promise<void> {
  await speclyServer.ensureServerInitialized();
}

export function createMCPToolHandlers(): MCPToolHandlers {
  return speclyServer.createMCPToolHandlers();
}

// Configure Specly-specific Hono app settings
export async function configureSpeclyApp(app: Hono, options: { local: boolean }) {
  await speclyServer.configureSpeclyApp(app, options);
}

// Setup Specly API routes in Hono app
export async function setupSpeclyApi(app: Hono, databaseService: DatabaseService) {
  await speclyServer.setupSpeclyApi(app);
}

export async function ensureSpeclySeed(force: boolean) {
  await speclyServer.ensureSpeclySeed(force);
}

export async function main() {
  // Build options object separately so unit tests can import and exercise
  // the lifecycle callbacks without starting the full server.
  const options = buildStartOptions();
  await startMcpServer<ExtendedCliOptions>(options as any);
}

// Exported helper to construct the start options object. Tests can import
// `buildStartOptions()` to inspect or invoke callbacks (createInstanceManager,
// onInitialize, configureApp, setupRoutes, localMode handlers) without
// actually starting the server process.
export function buildStartOptions() {
  return {
    serverName: 'specly',
    serverVersion: SPECLY_VERSION,
    toolHandlers: createMCPToolHandlers(),
    defaultPort: 8989,
    createInstanceManager: (options: any) => {
      return new InstanceManager({
        lockPath: options.local ? path.join(os.tmpdir(), "specly-8989.lock") : undefined,
        port: options.port,
        getVersion: () => SPECLY_VERSION
      });
    },
    onInitialize: async (options: any) => {
      await speclyServer.ensureServerInitialized();
      await speclyServer.ensureSpeclySeed(!!(options as any).forceSeed);
    },
    configureApp: async (app: any, options: any) => {
      await speclyServer.configureSpeclyApp(app, { local: options.local });
    },
    setupRoutes: async (app: any, options: any) => {
      await speclyServer.setupSpeclyApi(app);
    },
    onAfterStart: async (app: any, options: any) => {
      console.log(`Specly backend server running on http://localhost:${options.port}`);
    },
    localMode: {
      onLocalStart: async (instanceManager: any, options: any) => {
        speclyServer.startBackgroundJobs();
      },
      onShutdown: async (instanceManager: any, options: any) => {
        console.log('Shutdown requested via API');
        speclyServer.stopBackgroundJobs();
        // Graceful shutdown
        setTimeout(() => {
          if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
            process.exit(0);
          }
        }, 100);
      },
      onTransition: async (instanceManager: any, options: any) => {
        console.log('Version transition requested via API');
        speclyServer.stopBackgroundJobs();
        // Start new instance
        /* istanbul ignore next -- spawning processes not executed in tests */
        setTimeout(async () => {
          await performTransitionSpawn();
        }, 100);
      },
    },
    cliConfig: {
      appName: 'specly',
      appDescription: 'Specly MCP Server',
      customOptionsParser: (args: string[], options: any) => {
        // Parse Specly-specific options
        const forceSeed = args.includes('--force-seed') || process.env.SPECLY_FORCE_SEED === '1';
        return { ...options, forceSeed };
      },
      customHelpText: `
SPECLY-SPECIFIC OPTIONS:
  --force-seed          Force re-run of Specly seeding even if data present
                        (or set SPECLY_FORCE_SEED=1)

HTTP MODE ENDPOINTS:
  - Serves UI at http://localhost:<port>/
  - REST API at http://localhost:<port>/api/
  - MCP via Server-Sent Events at http://localhost:<port>/mcp
`
    },
  };
}

// Exported test helper to perform the dynamic spawn used during version transition.
// Tests can spy on or stub this to avoid launching processes.
export async function performTransitionSpawn() {
  // Allow a simulated transition mode via environment flag to avoid spawning
  // processes when running in constrained environments.
  if (process.env.SPECLY_TRANSITION_SIMULATE === '1') {
    const fake = { unref: () => { } };
    // mirror the real call shape for coverage purposes
    fake.unref();
    return;
  }

  const { spawn } = await import('child_process');
  spawn(process.argv[0], process.argv.slice(1), {
    detached: true,
    stdio: 'inherit',
  }).unref();
}

export async function handleMainError(err: any) {
  // Only log error if not in stdio mode
  let cliOptions: ExtendedCliOptions;
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
}

export function runIfMain() {
  if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('dist/index.js')) {
    return main().catch(handleMainError);
  }
  return Promise.resolve();
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('dist/index.js')) {
  runIfMain();
}
