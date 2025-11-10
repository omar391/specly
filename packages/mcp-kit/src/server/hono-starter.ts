import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Hono as HonoType } from 'hono';
import type { MCPToolHandlers } from './core/types.js';
import type { CreateHonoMcpOptions } from './core/hono-mcp.js';
import { createHonoMcpServer } from './core/hono-mcp.js';
import type { IInstanceManager } from './local/node-instance/index.js';

export interface StartHonoMcpOptions extends CreateHonoMcpOptions {
    /**
     * Port to listen on
     */
    port: number;

    /**
     * Instance manager for coordination (optional)
     */
    instanceManager?: IInstanceManager;

    /**
     * Hook to configure the app before starting
     */
    configureApp?: (app: HonoType) => Promise<void> | void;

    /**
     * Hook to setup custom routes
     */
    setupRoutes?: (app: HonoType) => Promise<void> | void;

    /**
     * Hook called before starting the server
     */
    onBeforeStart?: () => Promise<void> | void;

    /**
     * Hook called after starting the server
     */
    onAfterStart?: (app: HonoType) => Promise<void> | void;
}

/**
 * Start a Hono MCP server with hooks for customization
 */
export async function startHonoMcpServer(options: StartHonoMcpOptions): Promise<HonoType> {
    const {
        port,
        instanceManager,
        configureApp,
        setupRoutes,
        onBeforeStart,
        onAfterStart,
        ...createOptions
    } = options;

    // Call before start hook
    if (onBeforeStart) {
        await onBeforeStart();
    }

    // Create the base MCP server
    const app = createHonoMcpServer(createOptions);

    // Configure app if hook provided
    if (configureApp) {
        await configureApp(app);
    }

    // Setup custom routes if hook provided
    if (setupRoutes) {
        await setupRoutes(app);
    }

    // Start the server
    serve({
        fetch: app.fetch,
        port,
    });

    // Call after start hook
    if (onAfterStart) {
        await onAfterStart(app);
    }

    return app;
}