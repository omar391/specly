import type { Application } from 'express';
import type { Server as HttpServer } from 'http';
import { createExpressServer, type ExpressServerOptions, type IExpressServer } from './server.js';
import type { MCPToolHandlers } from './mcp-adapter.js';
import {
    BaseInstanceManager,
    InstanceRole,
    coordinateInstanceRole,
    type CoordinateInstanceOptions,
    type CoordinateInstanceResult,
    type CoordinateInstanceMainResult,
} from '../../node-instance/index.js';

export interface StartNodeServerMainContext {
    role: InstanceRole.MAIN;
    expressServer: IExpressServer;
    instanceManager: BaseInstanceManager;
    coordination?: CoordinateInstanceMainResult<BaseInstanceManager>;
}

export interface StartNodeServerProxyContext {
    role: InstanceRole.PROXY;
    instanceManager: BaseInstanceManager;
    proxyServer: HttpServer | null;
    coordination?: CoordinateInstanceResult<BaseInstanceManager>;
}

export type StartNodeServerResult = StartNodeServerMainContext | StartNodeServerProxyContext;

export interface McpExpressServerOptions {
    toolHandlers: MCPToolHandlers | (() => MCPToolHandlers | Promise<MCPToolHandlers>);
    port?: number;
    dev?: boolean;
    serverName?: string;
    serverVersion?: string;
    lockPath?: string;
    metricsCollector?: { snapshot: () => unknown };
    configureApp?: (app: Application, context: StartNodeServerMainContext) => void | Promise<void>;
    setupApi?: (server: IExpressServer, context: StartNodeServerMainContext) => void | Promise<void>;
    createExpressServer?: (options: ExpressServerOptions) => IExpressServer;
    instanceManager?: BaseInstanceManager;
    autoProxy?: boolean;
    onBeforeStart?: (context: StartNodeServerMainContext) => void | Promise<void>;
    onAfterStart?: (context: StartNodeServerMainContext) => void | Promise<void>;
    onProxyStart?: (context: StartNodeServerProxyContext) => void | Promise<void>;
    gracefulShutdown?: (context: StartNodeServerMainContext & { reason: string }) => void | Promise<void>;
    shutdownSignals?: NodeJS.Signals[];
    exitOnShutdown?: boolean;
    controlEndpoints?: {
        enabled?: boolean;
        versionPath?: string;
        shutdownPath?: string;
        transitionPath?: string;
        onShutdown?: (context: StartNodeServerMainContext & { reason: string }) => void | Promise<void>;
        onTransition?: (context: StartNodeServerMainContext & { reason: string }) => void | Promise<void>;
    };
    expressOptions?: Pick<ExpressServerOptions, 'cors' | 'info' | 'endpoints'> & {
        port?: number;
        dev?: boolean;
    };
    coordinateInstance?: boolean | Omit<CoordinateInstanceOptions<BaseInstanceManager>, 'instanceManager'>;
    onCoordinateDecision?: (result: CoordinateInstanceResult<BaseInstanceManager>) => void | Promise<void>;
}

export function isHandlersFactory(value: McpExpressServerOptions['toolHandlers']): value is () => MCPToolHandlers | Promise<MCPToolHandlers> {
    return typeof value === 'function' && !(value as unknown as MCPToolHandlers).listTools;
}

function buildExpressOptions(opts: McpExpressServerOptions, port: number, dev: boolean, version: string) {
    const info = {
        name: opts.serverName ?? opts.expressOptions?.info?.name ?? 'mcp-kit-backend',
        version: opts.serverVersion ?? opts.expressOptions?.info?.version ?? version,
        uiHintUrl: opts.expressOptions?.info?.uiHintUrl,
    };

    const endpoints = opts.expressOptions?.endpoints;
    const cors = opts.expressOptions?.cors;

    return {
        port,
        dev,
        info,
        cors,
        endpoints,
    } satisfies ExpressServerOptions;
}

export async function startMcpExpressServer(opts: McpExpressServerOptions): Promise<StartNodeServerResult> {
    const resolvedPort = opts.port ?? opts.expressOptions?.port ?? 8989;
    const defaultDev = process.env.NODE_ENV !== 'production';
    const dev = opts.dev ?? opts.expressOptions?.dev ?? defaultDev;
    const version = opts.serverVersion ?? opts.expressOptions?.info?.version ?? BaseInstanceManager.defaultVersion;

    const instanceManager = opts.instanceManager ?? new BaseInstanceManager({
        lockPath: opts.lockPath,
        port: resolvedPort,
        version,
    });

    const coordinationEnabled = opts.coordinateInstance !== undefined && opts.coordinateInstance !== false;

    const handleProxyReturn = async (coordination?: CoordinateInstanceResult<BaseInstanceManager>): Promise<StartNodeServerProxyContext> => {
        if (opts.autoProxy === false) {
            const proxyContext: StartNodeServerProxyContext = {
                role: InstanceRole.PROXY,
                instanceManager,
                proxyServer: null,
                coordination,
            };
            if (opts.onProxyStart) {
                await opts.onProxyStart(proxyContext);
            }
            return proxyContext;
        }

        const proxyServer = await instanceManager.startProxy();
        const proxyContext: StartNodeServerProxyContext = {
            role: InstanceRole.PROXY,
            instanceManager,
            proxyServer,
            coordination,
        };
        if (opts.onProxyStart) {
            await opts.onProxyStart(proxyContext);
        }
        return proxyContext;
    };

    let coordinationResult: CoordinateInstanceResult<BaseInstanceManager> | undefined;

    if (coordinationEnabled) {
        const coordConfig = typeof opts.coordinateInstance === 'boolean' ? {} : opts.coordinateInstance ?? {};
        coordinationResult = await coordinateInstanceRole({
            instanceManager,
            desiredVersion: coordConfig.desiredVersion ?? version,
            waitForPortTimeoutMs: coordConfig.waitForPortTimeoutMs,
            removeStaleLock: coordConfig.removeStaleLock,
        });

        if (opts.onCoordinateDecision) {
            await opts.onCoordinateDecision(coordinationResult);
        }

        if (coordinationResult.status === 'proxy') {
            return await handleProxyReturn(coordinationResult);
        }
        // proceed as main instance using coordinationResult
    } else {
        const becameMain = await instanceManager.tryBecomeMain();

        if (!becameMain) {
            return await handleProxyReturn();
        }
    }

    const expressOptions = buildExpressOptions(opts, resolvedPort, dev, version);
    const expressFactory: (options: ExpressServerOptions) => IExpressServer = opts.createExpressServer ?? createExpressServer;
    const expressServer = expressFactory(expressOptions);

    const mainContext: StartNodeServerMainContext = {
        role: InstanceRole.MAIN,
        expressServer,
        instanceManager,
        coordination: coordinationResult && coordinationResult.status === 'main' ? coordinationResult : undefined,
    };

    if (opts.configureApp) {
        await opts.configureApp(expressServer.app, mainContext);
    }

    const toolHandlers = isHandlersFactory(opts.toolHandlers)
        ? await opts.toolHandlers()
        : opts.toolHandlers;

    expressServer.attachMcp(toolHandlers);
    expressServer.setupHealthAndRoot(opts.metricsCollector);

    if (opts.setupApi) {
        await opts.setupApi(expressServer, mainContext);
    }

    const exitOnShutdown = opts.exitOnShutdown ?? true;
    let shuttingDown = false;

    const performShutdown = async (reason: string, exitCode = 0) => {
        if (shuttingDown) return;
        shuttingDown = true;

        try {
            if (opts.controlEndpoints?.onShutdown) {
                await opts.controlEndpoints.onShutdown({ ...mainContext, reason });
            }
            if (opts.gracefulShutdown) {
                await opts.gracefulShutdown({ ...mainContext, reason });
            } else {
                await expressServer.stop();
            }
        } catch (error) {
            if (dev) {
                console.error('[mcp-kit] shutdown error', error);
            }
        } finally {
            if (exitOnShutdown) {
                process.exit(exitCode);
            }
        }
    };

    const controlConfig = opts.controlEndpoints;
    if (!controlConfig || controlConfig.enabled !== false) {
        const versionPath = controlConfig?.versionPath ?? '/__version';
        const shutdownPath = controlConfig?.shutdownPath ?? '/__shutdown';
        const transitionPath = controlConfig?.transitionPath ?? '/__transition';

        expressServer.app.get(versionPath, (_req, res) => {
            res.json({ version });
        });

        expressServer.app.post(shutdownPath, async (_req, res) => {
            res.status(200).json({ ok: true });
            await performShutdown('http-shutdown');
        });

        expressServer.app.post(transitionPath, async (_req, res) => {
            res.status(200).json({ ok: true });
            if (controlConfig?.onTransition) {
                await controlConfig.onTransition({ ...mainContext, reason: 'http-transition' });
            }
            await performShutdown('http-transition');
        });
    }

    if (opts.onBeforeStart) {
        await opts.onBeforeStart(mainContext);
    }

    await expressServer.start();

    if (opts.onAfterStart) {
        await opts.onAfterStart(mainContext);
    }

    const signals = opts.shutdownSignals ?? ['SIGINT', 'SIGTERM', 'SIGUSR1', 'SIGUSR2'];
    for (const signal of signals) {
        process.on(signal, () => {
            void performShutdown(signal, 0);
        });
    }

    return mainContext;
}
