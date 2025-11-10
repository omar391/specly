import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Application, Request, Response } from 'express';
import type { Server as HttpServer } from 'http';
import { InstanceRole, type InstanceManager, coordinateInstanceRole } from '@omar391/mcp-kit/server/express';
import * as nodeInstanceModule from '@omar391/mcp-kit/server/express';

import type { IExpressServer, ExpressServerOptions, MCPToolHandlers } from '../express/index.js';
import {
    startMcpExpressServer,
    startMcpServer,
    type StartNodeServerMainContext,
    type StartNodeServerProxyContext,
    type StartMcpServerEdgeContext,
} from '../index.js';

class FakeExpressServer implements IExpressServer {
    readonly app: Application;
    readonly opts: ExpressServerOptions;
    readonly attachedHandlers = vi.fn();
    readonly healthSetup = vi.fn();
    readonly started = vi.fn();
    readonly stopped = vi.fn();
    routes: Array<{ method: 'get' | 'post'; path: string; handler: (req: Request, res: Response) => any }> = [];

    constructor(public readonly options: ExpressServerOptions) {
        this.opts = options;
        const routes = this.routes;
        const appImpl = {
            get: (path: string, handler: (req: Request, res: Response) => any) => {
                routes.push({ method: 'get', path, handler });
                return appImpl as unknown as Application;
            },
            post: (path: string, handler: (req: Request, res: Response) => any) => {
                routes.push({ method: 'post', path, handler });
                return appImpl as unknown as Application;
            },
            use: vi.fn(),
        };
        this.app = appImpl as unknown as Application;
    }

    attachMcp(toolHandlers: MCPToolHandlers) {
        this.attachedHandlers(toolHandlers);
    }

    setupHealthAndRoot(metricsCollector?: { snapshot: () => unknown }) {
        this.healthSetup(metricsCollector);
    }

    setupMiddleware() {
        // fake
    }

    async start() {
        this.started();
    }

    async stop() {
        this.stopped();
    }
}

function createStubInstanceManager(overrides: Partial<InstanceManager> & { tryBecomeMain: () => Promise<boolean> }) {
    const base = {
        version: '1.0.0',
        port: 8989,
        lockPath: '/tmp/lock',
        role: InstanceRole.UNKNOWN,
        proxyPort: null as number | null,
        startProxy: vi.fn(async () => ({ close: vi.fn() } as unknown as HttpServer)),
        removeLock: vi.fn(async () => { }),
        readLock: vi.fn(async () => null),
        writeLock: vi.fn(async () => { }),
        requestMainTransition: vi.fn(async () => true),
        requestMainShutdown: vi.fn(async () => true),
        waitForPort: vi.fn(async () => true),
        fetchMainVersion: vi.fn(async () => '1.0.0'),
    };
    return Object.assign(base, overrides) as unknown as InstanceManager;
}

function makeToolHandlers(): MCPToolHandlers {
    return {
        listTools: vi.fn(async () => ({ tools: [] })),
        handleToolCall: vi.fn(async () => ({ result: 'ok' })),
    };
}

describe('startMcpExpressServer', () => {
    const toolHandlers = makeToolHandlers();

    let processOnSpy: any;
    let capturedSignals: Map<NodeJS.Signals, () => void>;

    beforeEach(() => {
        capturedSignals = new Map();
        processOnSpy = vi.spyOn(process, 'on').mockImplementation((signal: any, handler: any) => {
            capturedSignals.set(signal as NodeJS.Signals, handler as () => void);
            return process;
        });
    });

    afterEach(() => {
        processOnSpy.mockRestore();
        vi.restoreAllMocks();
    });

    it('starts main server with hooks and default control endpoints', async () => {
        const fakeServerFactory = vi.fn((options: ExpressServerOptions) => new FakeExpressServer(options)) as any;
        const instanceManager = createStubInstanceManager({
            tryBecomeMain: vi.fn(async () => {
                (instanceManager as unknown as { role: InstanceRole }).role = InstanceRole.MAIN;
                return true;
            }),
        });

        const configureApp = vi.fn();
        const setupApi = vi.fn(async () => { });
        const beforeStart = vi.fn();
        const afterStart = vi.fn();
        const gracefulShutdown = vi.fn(async () => { });

        const metricsCollector = { snapshot: vi.fn(() => ({ requests: 1 })) };

        const result = await startMcpExpressServer({
            toolHandlers,
            port: 3100,
            dev: true,
            serverName: 'test-server',
            serverVersion: '2.0.0',
            instanceManager,
            createExpressServer: fakeServerFactory,
            configureApp,
            setupApi,
            onBeforeStart: beforeStart,
            onAfterStart: afterStart,
            gracefulShutdown,
            metricsCollector,
            exitOnShutdown: false,
            shutdownSignals: ['SIGTERM'],
        });

        expect(result.role).toBe(InstanceRole.MAIN);
        const mainContext = result as StartNodeServerMainContext;
        expect(fakeServerFactory).toHaveBeenCalledTimes(1);
        expect(mainContext.expressServer).toBeInstanceOf(FakeExpressServer);
        expect(mainContext.coordination).toBeUndefined();
        const constructed = fakeServerFactory.mock.results[0].value as FakeExpressServer;
        expect(constructed.options.port).toBe(3100);
        expect(constructed.options.dev).toBe(true);
        expect(configureApp).toHaveBeenCalledWith(constructed.app, mainContext);
        expect(constructed.attachedHandlers).toHaveBeenCalledWith(toolHandlers);
        expect(constructed.healthSetup).toHaveBeenCalledWith(metricsCollector);
        expect(setupApi).toHaveBeenCalledWith(constructed, mainContext);
        expect(beforeStart).toHaveBeenCalledWith(mainContext);
        expect(afterStart).toHaveBeenCalledWith(mainContext);
        expect(constructed.started).toHaveBeenCalled();

        const versionRoute = constructed.routes.find(r => r.method === 'get' && r.path === '/__version');
        expect(versionRoute).toBeDefined();
        const shutdownRoute = constructed.routes.find(r => r.method === 'post' && r.path === '/__shutdown');
        expect(shutdownRoute).toBeDefined();
        const transitionRoute = constructed.routes.find(r => r.method === 'post' && r.path === '/__transition');
        expect(transitionRoute).toBeDefined();

        expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
        const handler = capturedSignals.get('SIGTERM');
        expect(handler).toBeDefined();

        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        } as unknown as Response;

        await shutdownRoute!.handler({} as Request, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(gracefulShutdown).toHaveBeenCalledWith(expect.objectContaining({ role: InstanceRole.MAIN, reason: 'http-shutdown' }));
        expect(constructed.stopped).not.toHaveBeenCalled();
        expect(handler).toBeDefined();
        handler!();
        expect(gracefulShutdown).toHaveBeenCalledTimes(1);
    });

    it('invokes tool handler factory lazily', async () => {
        const instanceManager = createStubInstanceManager({
            tryBecomeMain: vi.fn(async () => true),
        });
        let resolved = false;
        const factory = vi.fn(async () => {
            resolved = true;
            return toolHandlers;
        });

        await startMcpExpressServer({
            toolHandlers: factory,
            instanceManager,
            createExpressServer: (options) => new FakeExpressServer(options) as any,
            exitOnShutdown: false,
            shutdownSignals: [],
        });

        expect(resolved).toBe(true);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it('starts proxy when another main instance exists', async () => {
        const instanceManager = createStubInstanceManager({
            tryBecomeMain: vi.fn(async () => false),
        });
        const onProxyStart = vi.fn();

        const result = await startMcpExpressServer({
            toolHandlers,
            instanceManager,
            autoProxy: true,
            createExpressServer: (options) => new FakeExpressServer(options) as any,
            onProxyStart,
        });

        expect(result.role).toBe(InstanceRole.PROXY);
        const proxyContext = result as StartNodeServerProxyContext;
        expect(proxyContext.proxyServer).toBeDefined();
        expect(proxyContext.coordination).toBeUndefined();
        expect(onProxyStart).toHaveBeenCalledWith(proxyContext);
    });

    it('returns proxy context without starting proxy when autoProxy=false', async () => {
        const instanceManager = createStubInstanceManager({
            tryBecomeMain: vi.fn(async () => false),
            startProxy: vi.fn(),
        });

        const result = await startMcpExpressServer({
            toolHandlers,
            instanceManager,
            autoProxy: false,
            createExpressServer: (options) => new FakeExpressServer(options) as any,
        });

        expect(result.role).toBe(InstanceRole.PROXY);
        const proxyContext = result as StartNodeServerProxyContext;
        expect(proxyContext.proxyServer).toBeNull();
        expect(proxyContext.coordination).toBeUndefined();
        expect((instanceManager as unknown as { startProxy: ReturnType<typeof vi.fn> }).startProxy).not.toHaveBeenCalled();
    });

    it('allows disabling default control endpoints', async () => {
        const instanceManager = createStubInstanceManager({
            tryBecomeMain: vi.fn(async () => true),
        });
        const server = new FakeExpressServer({ port: 9000, dev: false });

        await startMcpExpressServer({
            toolHandlers,
            instanceManager,
            createExpressServer: (() => server) as any,
            controlEndpoints: { enabled: false },
            exitOnShutdown: false,
            shutdownSignals: [],
        });

        expect(server.routes.length).toBe(0);
    });

    it('delegates coordination when enabled and returns metadata', async () => {
        const instanceManager = createStubInstanceManager({
            tryBecomeMain: vi.fn(async () => true),
        });

        const onCoordinateDecision = vi.fn();

        const result = await startMcpExpressServer({
            toolHandlers,
            instanceManager,
            createExpressServer: (options) => new FakeExpressServer(options) as any,
            coordinateInstance: {
                desiredVersion: '2.1.0',
                waitForPortTimeoutMs: 1500,
                removeStaleLock: false,
            },
            onCoordinateDecision,
        });

        expect(onCoordinateDecision).toHaveBeenCalledWith({
            status: 'main',
            role: InstanceRole.MAIN,
            instanceManager,
            reason: 'initial',
        });
        expect(result.role).toBe(InstanceRole.MAIN);
        const mainContext = result as StartNodeServerMainContext;
        expect(mainContext.coordination).toEqual({
            status: 'main',
            role: InstanceRole.MAIN,
            instanceManager,
            reason: 'initial',
        });
    });

    it('propagates coordination metadata when proxying', async () => {
        const proxyServer = { close: vi.fn() } as unknown as HttpServer;
        const instanceManager = createStubInstanceManager({
            version: '1.7.0',
            tryBecomeMain: vi.fn(async () => false),
            startProxy: vi.fn(async () => proxyServer),
            fetchMainVersion: vi.fn(async () => '1.7.0'),
        });

        const coordinationOutcome = {
            status: 'proxy',
            role: InstanceRole.PROXY,
            instanceManager,
            reason: 'existing-main',
            mainVersion: '1.7.0',
        } satisfies nodeInstanceModule.CoordinateInstanceProxyResult<InstanceManager>;

        const onProxyStart = vi.fn();

        const result = await startMcpExpressServer({
            toolHandlers,
            instanceManager,
            serverVersion: '1.7.0',
            autoProxy: true,
            createExpressServer: (options) => new FakeExpressServer(options) as any,
            coordinateInstance: true,
            onProxyStart,
        });

        expect(result.role).toBe(InstanceRole.PROXY);
        const proxyContext = result as StartNodeServerProxyContext;
        expect(proxyContext.coordination).toEqual(coordinationOutcome);
        expect(onProxyStart).toHaveBeenCalledWith(proxyContext);
    });
});

describe('startMcpServer', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts Express transport when kind is express', async () => {
        const instanceManager = createStubInstanceManager({
            tryBecomeMain: vi.fn(async () => true),
        });
        const factory = vi.fn((options: ExpressServerOptions) => new FakeExpressServer(options)) as any;

        const result = await startMcpServer({
            kind: 'express',
            toolHandlers: makeToolHandlers(),
            instanceManager,
            createExpressServer: factory,
            exitOnShutdown: false,
            shutdownSignals: [],
        });

        expect(factory).toHaveBeenCalledTimes(1);
        expect((result as StartNodeServerMainContext).role).toBe(InstanceRole.MAIN);
    });

    it('honors express options such as port overrides', async () => {
        const instanceManager = createStubInstanceManager({
            tryBecomeMain: vi.fn(async () => true),
        });
        const factory = vi.fn((options: ExpressServerOptions) => new FakeExpressServer(options)) as any;

        await startMcpServer({
            kind: 'express',
            toolHandlers: makeToolHandlers(),
            instanceManager,
            createExpressServer: factory,
            exitOnShutdown: false,
            shutdownSignals: [],
            port: 4321,
        });

        expect(factory).toHaveBeenCalledWith(expect.objectContaining({ port: 4321 }));
    });

    it('returns edge handler when kind is edge', async () => {
        const result = await startMcpServer({
            kind: 'edge',
            toolHandlers: makeToolHandlers(),
            edge: { serverName: 'edge-test', serverVersion: '9.9.9' },
        });

        expect((result as StartMcpServerEdgeContext).transport).toBe('edge');
        const edgeResult = result as StartMcpServerEdgeContext;
        expect(edgeResult.serverName).toBe('edge-test');
        expect(edgeResult.serverVersion).toBe('9.9.9');

        const request = new Request('https://example.com/mcp', {
            method: 'POST',
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await edgeResult.handler(request);
        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.result.tools).toEqual([]);
    });

    it('uses top-level defaults when edge overrides are omitted', async () => {
        const result = await startMcpServer({
            kind: 'edge',
            toolHandlers: makeToolHandlers(),
            serverName: 'fallback-name',
            serverVersion: '7.0.0',
        });
        const edgeResult = result as StartMcpServerEdgeContext;
        expect(edgeResult.serverName).toBe('fallback-name');
        expect(edgeResult.serverVersion).toBe('7.0.0');
    });

    it('throws when kind is missing', async () => {
        // @ts-expect-error runtime guard
        await expect(startMcpServer({
            toolHandlers: makeToolHandlers(),
        })).rejects.toThrow(/requires a 'kind' of 'express' or 'edge'/);
    });
});
