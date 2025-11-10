import type { Application } from 'express';
import type { Server as HttpServer } from 'http';
import { createExpressServer, type ExpressServerOptions, type IExpressServer } from '../express/server.js';
import type { MCPToolHandlers } from '../express/mcp-adapter.js';
import { ProxyManager } from './proxy/index.js';
import {
    InstanceManager,
    InstanceRole,
    coordinateInstanceRole,
    type CoordinateInstanceOptions,
    type CoordinateInstanceResult,
    type CoordinateInstanceMainResult,
    type IInstanceManager,
} from './node-instance/index.js';

export interface StartNodeServerMainContext<M extends IInstanceManager = IInstanceManager> {
    role: InstanceRole.MAIN;
    expressServer: IExpressServer;
    instanceManager: M;
    coordination?: CoordinateInstanceMainResult<M>;
}

export interface StartNodeServerProxyContext<M extends IInstanceManager = IInstanceManager> {
    role: InstanceRole.PROXY;
    instanceManager: M;
    proxyServer: HttpServer | null;
    coordination?: CoordinateInstanceResult<M>;
}

export type StartNodeServerResult<M extends IInstanceManager = IInstanceManager> = StartNodeServerMainContext<M> | StartNodeServerProxyContext<M>;

export interface McpExpressServerOptions<M extends IInstanceManager = InstanceManager> {
    toolHandlers: MCPToolHandlers | (() => MCPToolHandlers | Promise<MCPToolHandlers>);
    port?: number;
    dev?: boolean;
    serverName?: string;
    serverVersion?: string;
    lockPath?: string;
    metricsCollector?: { snapshot: () => unknown };
    configureApp?: (app: Application, context: StartNodeServerMainContext<M>) => void | Promise<void>;
    setupApi?: (server: IExpressServer, context: StartNodeServerMainContext<M>) => void | Promise<void>;
    createExpressServer?: (options: ExpressServerOptions) => IExpressServer;
    instanceManager?: M;
    autoProxy?: boolean;
    onBeforeStart?: (context: StartNodeServerMainContext<M>) => void | Promise<void>;
    onAfterStart?: (context: StartNodeServerMainContext<M>) => void | Promise<void>;
    onProxyStart?: (context: StartNodeServerProxyContext<M>) => void | Promise<void>;
    gracefulShutdown?: (context: StartNodeServerMainContext<M> & { reason: string }) => void | Promise<void>;
    shutdownSignals?: NodeJS.Signals[];
    exitOnShutdown?: boolean;
    controlEndpoints?: {
        enabled?: boolean;
        versionPath?: string;
        shutdownPath?: string;
        transitionPath?: string;
        onShutdown?: (context: StartNodeServerMainContext<M> & { reason: string }) => void | Promise<void>;
        onTransition?: (context: StartNodeServerMainContext<M> & { reason: string }) => void | Promise<void>;
    };
    expressOptions?: Pick<ExpressServerOptions, 'cors' | 'info' | 'endpoints'> & {
        port?: number;
        dev?: boolean;
    };
    coordinateInstance?: boolean | Omit<CoordinateInstanceOptions<M>, 'instanceManager'>;
    onCoordinateDecision?: (result: CoordinateInstanceResult<M>) => void | Promise<void>;
}

export function isHandlersFactory(value: McpExpressServerOptions['toolHandlers']): value is () => MCPToolHandlers | Promise<MCPToolHandlers> {
    return typeof value === 'function' && !(value as unknown as MCPToolHandlers).listTools;
}

function buildExpressOptions<M extends IInstanceManager>(opts: McpExpressServerOptions<M>, port: number, dev: boolean, version: string) {
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

export async function startMcpExpressServer<M extends IInstanceManager = InstanceManager>(opts: McpExpressServerOptions<M>): Promise<StartNodeServerResult<M>> {
    const resolvedPort = opts.port ?? opts.expressOptions?.port ?? 8989;
    const defaultDev = process.env.NODE_ENV !== 'production';
    const dev = opts.dev ?? opts.expressOptions?.dev ?? defaultDev;
    const version = opts.serverVersion ?? opts.expressOptions?.info?.version ?? InstanceManager.defaultVersion;

    const instanceManager: M = opts.instanceManager ?? new InstanceManager({
        lockPath: opts.lockPath,
        port: resolvedPort,
        getVersion: () => version,
    }) as unknown as M;

    const coordinationEnabled = opts.coordinateInstance !== undefined && opts.coordinateInstance !== false;

    const handleProxyReturn = async (coordination?: CoordinateInstanceResult<M>): Promise<StartNodeServerProxyContext<M>> => {
        if (opts.autoProxy === false) {
            const proxyContext: StartNodeServerProxyContext<M> = {
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

        const proxyManager = new ProxyManager();
        const mainVersion = coordination?.status === 'proxy' ? coordination.mainVersion : null;
        const metadata = {
            mainVersion: mainVersion ?? undefined,
            mainPort: resolvedPort,
            instanceId: `proxy-${process.pid}`,
            startTime: Date.now(),
        };
        const proxyServer = await proxyManager.start(resolvedPort, metadata);
        instanceManager.proxyManager = proxyManager;
        instanceManager.proxyPort = proxyManager.port;
        instanceManager.role = InstanceRole.PROXY;
        const proxyContext: StartNodeServerProxyContext<M> = {
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

    let coordinationResult: CoordinateInstanceResult<M> | undefined;

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

    const mainContext: StartNodeServerMainContext<M> = {
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
