import { Hono } from 'hono';
import type { Hono as HonoType } from 'hono';
import type { MCPToolHandlers } from './core/types.js';
import { startHonoMcpServer, type StartHonoMcpOptions } from './hono-starter.js';
import { startStdioServer } from './stdio.js';
import { InstanceManager, type IInstanceManager } from './local/node-instance/index.js';
import { ProxyManager } from './local/proxy/index.js';
import { startStdioProxy } from './local/node-instance/index.js';
import { parseCliArgs, displayHelp, type BaseCliOptions } from '../utils/cli-parser.js';
import { ensurePortAvailable } from './local/port-manager.js';

export interface ExtendedCliOptions extends BaseCliOptions {
    /** Custom CLI options */
    [key: string]: any;
}

export interface ServerConfig<T extends ExtendedCliOptions = ExtendedCliOptions> {
    /** Server name */
    serverName: string;
    /** Server version */
    serverVersion: string;
    /** Tool handlers */
    toolHandlers: MCPToolHandlers;
    /** Default port */
    defaultPort?: number;
    /** Instance manager factory */
    createInstanceManager?: (options: T) => IInstanceManager;
    /** Initialization hook */
    onInitialize?: (options: T) => Promise<void> | void;
    /** Pre-start hook */
    onBeforeStart?: (options: T) => Promise<void> | void;
    /** Post-start hook */
    onAfterStart?: (app: HonoType, options: T) => Promise<void> | void;
    /** Configure app hook */
    configureApp?: (app: HonoType, options: T) => Promise<void> | void;
    /** Setup routes hook */
    setupRoutes?: (app: HonoType, options: T) => Promise<void> | void;
    /** Custom CLI parser config */
    cliConfig?: import('../utils/cli-parser.js').CliParserConfig<T>;
    /** Enable CORS */
    cors?: boolean;
    /** Health endpoint path */
    healthEndpoint?: string;
    /** MCP endpoint path */
    mcpEndpoint?: string;
    /** Local mode hooks */
    localMode?: {
        /** Hook called when local mode is enabled and instance manager is ready */
        onLocalStart?: (instanceManager: IInstanceManager, options: T) => Promise<void> | void;
        /** Hook to add local control routes */
        setupLocalRoutes?: (app: HonoType, instanceManager: IInstanceManager, options: T) => Promise<void> | void;
        /** Hook called when shutdown is requested */
        onShutdown?: (instanceManager: IInstanceManager, options: T) => Promise<void> | void;
        /** Hook called when transition is requested */
        onTransition?: (instanceManager: IInstanceManager, options: T) => Promise<void> | void;
    };
}

/**
 * High-level MCP server starter that handles CLI parsing, instance management,
 * mode detection, and proxy logic automatically.
 */
export async function startMcpServer<T extends ExtendedCliOptions = ExtendedCliOptions>(
    config: ServerConfig<T>
): Promise<void> {
    const {
        serverName,
        serverVersion,
        toolHandlers,
        defaultPort = 8989,
        createInstanceManager,
        onInitialize,
        onBeforeStart,
        onAfterStart,
        configureApp,
        setupRoutes,
        cliConfig,
        cors = true,
        healthEndpoint = '/health',
        mcpEndpoint = '/mcp',
        localMode,
    } = config;

    // Parse CLI arguments
    const cliOptions = parseCliArgs<T>(process.argv.slice(2), {
        defaultPort,
        appName: serverName,
        appDescription: `${serverName} MCP Server`,
        ...cliConfig,
    });

    // Handle help
    if (cliOptions.help) {
        displayHelp(cliConfig as any);
        process.exit(0);
    }

    // Call initialization hook
    if (onInitialize) {
        await onInitialize(cliOptions);
    }

    // Create instance manager
    const instanceManager = createInstanceManager
        ? createInstanceManager(cliOptions)
        : new InstanceManager({
            lockPath: undefined,
            port: cliOptions.port,
            getVersion: () => serverVersion,
        });

    // Check if we should be main instance
    const shouldBeMain = await instanceManager.tryBecomeMain();
    if (!shouldBeMain) {
        // Start proxy mode
        const mainVersion = instanceManager.version;
        if (cliOptions.mode === 'stdio') {
            console.error(`[PROXY MODE] Main instance v${mainVersion} running on port ${instanceManager.port}. Starting stdio proxy.`);
            await startStdioProxy({
                port: instanceManager.port,
                serverName,
                serverVersion,
                clientName: `${serverName}-proxy`,
                debug: true,
            });
        } else {
            console.log(`[PROXY MODE] Main instance v${mainVersion} running on port ${instanceManager.port}. Starting HTTP proxy.`);
            const proxyManager = new ProxyManager();
            await proxyManager.start({
                targetPort: instanceManager.port,
                listenPort: cliOptions.port,
                metadata: {
                    mainVersion,
                    mainPort: instanceManager.port,
                    startTime: Date.now(),
                },
            });
        }
        return;
    }

    // We are the main instance
    console.log(`[MAIN INSTANCE] Starting ${serverName} v${serverVersion}`);

    // Call local start hook if in local mode
    if (cliOptions.local && localMode?.onLocalStart) {
        await localMode.onLocalStart(instanceManager, cliOptions);
    }

    // Ensure port is available
    const portFree = await ensurePortAvailable(cliOptions.port, cliOptions.killExisting);
    if (!portFree) {
        if (!cliOptions.killExisting) {
            throw new Error(`Port ${cliOptions.port} is already in use and --no-kill was provided (start aborted).`);
        }
        throw new Error(`Unable to free port ${cliOptions.port} for ${serverName} server`);
    }

    // Call before start hook
    if (onBeforeStart) {
        await onBeforeStart(cliOptions);
    }

    if (cliOptions.mode === 'stdio') {
        // Start STDIO server
        await startStdioServer({
            serverName,
            serverVersion,
            handlers: toolHandlers,
            debug: true
        });
    } else {
        // Start HTTP server
        await startHonoMcpServer({
            toolHandlers,
            serverName,
            serverVersion,
            cors,
            healthEndpoint,
            mcpEndpoint,
            port: cliOptions.port,
            instanceManager,
            configureApp: configureApp ? (app) => configureApp(app, cliOptions) : undefined,
            setupRoutes: async (app) => {
                // Call regular setup routes hook
                if (setupRoutes) {
                    await setupRoutes(app, cliOptions);
                }
                // Call local routes hook if in local mode
                if (cliOptions.local && localMode?.setupLocalRoutes) {
                    await localMode.setupLocalRoutes(app, instanceManager, cliOptions);
                }
                // Add control routes if in local mode and hooks are defined
                if (cliOptions.local) {
                    if (localMode?.onShutdown) {
                        app.post('/shutdown', async (c) => {
                            await localMode.onShutdown!(instanceManager, cliOptions);
                            return c.json({ status: 'shutdown initiated' });
                        });
                    }
                    if (localMode?.onTransition) {
                        app.post('/transition', async (c) => {
                            await localMode.onTransition!(instanceManager, cliOptions);
                            return c.json({ status: 'transition initiated' });
                        });
                    }
                }
            },
            onBeforeStart: () => { }, // Already called above
            onAfterStart: onAfterStart ? (app) => onAfterStart(app, cliOptions) : undefined,
        });
    }
}