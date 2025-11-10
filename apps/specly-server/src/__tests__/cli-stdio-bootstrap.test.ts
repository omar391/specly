import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { InstanceRole } from '@omar391/mcp-kit/server/local/node-instance';

const {
    parseCliArgsMock,
    displayHelpMock,
    startStdioProxyMock,
    startMcpServerMock,
    ensurePortAvailableMock,
    initializeGlobalDatabaseServiceMock,
    fakeGlobalDbService,
    fakeDrizzleManager,
    fakeDb,
    fakeSeedManagerInitMock,
    fakeSeedManagerSeedMock,
    createHonoMcpServerMock,
    startHonoMcpServerMock,
    serveMock,
} = vi.hoisted(() => {
    const fakeDb = {
        all: vi.fn(async () => []),
    };

    const fakeDrizzleManager = {
        getDb: vi.fn(() => fakeDb),
    };

    const fakeGlobalDbService = {
        getDrizzleManager: vi.fn(() => fakeDrizzleManager),
    };

    return {
        parseCliArgsMock: vi.fn(),
        displayHelpMock: vi.fn(),
        startStdioProxyMock: vi.fn(),
        startMcpServerMock: vi.fn(),
        ensurePortAvailableMock: vi.fn(),
        initializeGlobalDatabaseServiceMock: vi.fn(async () => fakeGlobalDbService),
        fakeGlobalDbService,
        fakeDrizzleManager,
        fakeDb,
        fakeSeedManagerInitMock: vi.fn(),
        fakeSeedManagerSeedMock: vi.fn(async () => ({
            specsCreated: 0,
            toolVersionsCreated: 0,
            profileCreated: false,
            profileVersionsCreated: 0,
            toolsAttached: 0,
            workspaceBindings: 0,
        })),
        createHonoMcpServerMock: vi.fn(() => ({
            get: vi.fn(),
            post: vi.fn(),
        })),
        startHonoMcpServerMock: vi.fn(),
        serveMock: vi.fn(),
    };
});

const createToolModule = () => {
    const schema = { parse: (input: unknown) => input };

    class Tool {
        constructor(_: unknown) { }
        async execute(input: unknown) {
            return { content: input, isError: false };
        }
    }

    return { Tool, schema };
};

vi.mock('../utils/cli-parser.js', () => ({
    parseCliArgs: parseCliArgsMock,
    displayHelp: displayHelpMock,
}));

vi.mock('@omar391/mcp-kit/server/local/port-manager', () => ({
    ensurePortAvailable: ensurePortAvailableMock,
    ensurePortFree: ensurePortAvailableMock, // Alias for ensurePortAvailable
}));

vi.mock('../database/global-queries.js', () => ({
    initializeGlobalDatabaseService: initializeGlobalDatabaseServiceMock,
    getGlobalDatabaseService: () => fakeGlobalDbService,
}));

vi.mock('../services/database-service.js', () => ({
    DatabaseService: class {
        constructor(_: unknown) { }
        getGlobal() {
            return fakeGlobalDbService;
        }
    },
}));

vi.mock('../services/seed-manager.js', () => ({
    SeedManager: class {
        constructor(_: unknown) { }
        initializeGlobalData = fakeSeedManagerInitMock;
        seedSpecly = fakeSeedManagerSeedMock;
    },
}));

vi.mock('../services/prompt-orchestrator.js', () => ({
    PromptOrchestrator: class {
        constructor(_: unknown) { }
    },
}));

const instanceManagerMocks = vi.hoisted(() => {
    return {
        tryBecomeMain: vi.fn(),
        startBackgroundJobs: vi.fn(),
        stopBackgroundJobs: vi.fn(),
    };
});

vi.mock('../server/instance-manager.js', async () => {
    const actual = await vi.importActual<typeof import('@omar391/mcp-kit/server/local/node-instance')>('@omar391/mcp-kit/server/local/node-instance');
    class SpeclyInstanceManager {
        static VERSION = 'test-version';
        port: number;
        proxyPort: number;
        role = actual.InstanceRole.MAIN;
        version = 'test-version';

        constructor(_lockPath?: string, _port?: number) {
            this.port = _port ?? 8989;
            this.proxyPort = this.port + 1;
        }

        tryBecomeMain = instanceManagerMocks.tryBecomeMain;
        startBackgroundJobs = instanceManagerMocks.startBackgroundJobs;
        stopBackgroundJobs = instanceManagerMocks.stopBackgroundJobs;
    }

    return {
        SpeclyInstanceManager,
        InstanceRole: actual.InstanceRole,
    };
});

vi.mock('../server/specly-express-hooks.js', () => ({
    configureSpeclyApp: vi.fn(),
    setupSpeclyApi: vi.fn(async () => { }),
}));

vi.mock('../tools/init.js', () => {
    const { Tool, schema } = createToolModule();
    return { InitToolNew: Tool, initToolSchema: schema };
});

vi.mock('../tools/start.js', () => {
    const { Tool, schema } = createToolModule();
    return { StartTool: Tool, startToolSchema: schema };
});

vi.mock('../tools/add.js', () => {
    const { Tool, schema } = createToolModule();
    return { AddToolNew: Tool, addToolSchema: schema };
});

vi.mock('../tools/status.js', () => {
    const { Tool, schema } = createToolModule();
    return { StatusToolNew: Tool, statusToolSchema: schema };
});

vi.mock('../tools/update.js', () => {
    const { Tool, schema } = createToolModule();
    return { UpdateToolNew: Tool, updateToolSchema: schema };
});

vi.mock('../tools/audit.js', () => {
    const { Tool, schema } = createToolModule();
    return { AuditToolNew: Tool, auditToolSchema: schema };
});

vi.mock('../tools/focus.js', () => {
    const { Tool, schema } = createToolModule();
    return { FocusToolNew: Tool, focusToolSchema: schema };
});

vi.mock('../tools/github.js', () => {
    const { Tool, schema } = createToolModule();
    return { GitHubTool: Tool, githubToolSchema: schema };
});

vi.mock('../tools/rule-update.js', () => {
    const { Tool, schema } = createToolModule();
    return { RuleUpdateTool: Tool, ruleUpdateToolSchema: schema };
});

vi.mock('../tools/remote-interface.js', () => {
    const { Tool, schema } = createToolModule();
    return { RemoteInterfaceTool: Tool, remoteInterfaceToolSchema: schema };
});

vi.mock('../tools/update-resources.js', () => {
    const { Tool, schema } = createToolModule();
    return { UpdateResourcesTool: Tool, updateResourcesToolSchema: schema };
});

vi.mock('../tools/update-steps.js', () => {
    const { Tool, schema } = createToolModule();
    return { UpdateStepsTool: Tool, updateStepsToolSchema: schema };
});

vi.mock('@omar391/mcp-kit/server/local/node-instance', async () => {
    const actual = await vi.importActual<typeof import('@omar391/mcp-kit/server/local/node-instance')>('@omar391/mcp-kit/server/local/node-instance');
    return {
        ...actual,
        startStdioProxy: startStdioProxyMock,
    };
});

vi.mock('hono', () => ({
    Hono: class {
        all() { return this; }
    },
}));

vi.mock('@hono/node-server', () => ({
    serve: serveMock,
}));

vi.mock('@omar391/mcp-kit/server/core/hono-mcp', () => ({
    createHonoMcpServer: createHonoMcpServerMock,
}));

vi.mock('@omar391/mcp-kit/server', async () => {
    const actual = await vi.importActual<typeof import('@omar391/mcp-kit/server')>('@omar391/mcp-kit/server');
    return {
        ...actual,
        startStdioServer: startMcpServerMock, // Reuse the mock for startStdioServer
        startHonoMcpServer: startHonoMcpServerMock,
    };
});

describe('Specly CLI bootstrap', () => {
    let exitSpy: MockInstance<typeof process.exit> | null = null;

    beforeEach(() => {
        vi.resetModules();
        parseCliArgsMock.mockReset();
        displayHelpMock.mockReset();
        startStdioProxyMock.mockReset();
        startMcpServerMock.mockReset();
        ensurePortAvailableMock.mockReset();
        initializeGlobalDatabaseServiceMock.mockReset();
        createHonoMcpServerMock.mockReset();
        startHonoMcpServerMock.mockReset();
        serveMock.mockReset();
        fakeDb.all.mockReset();
        fakeSeedManagerInitMock.mockReset();
        fakeSeedManagerSeedMock.mockReset();
        instanceManagerMocks.tryBecomeMain.mockReset();
        instanceManagerMocks.startBackgroundJobs.mockReset();
        instanceManagerMocks.stopBackgroundJobs.mockReset();

        parseCliArgsMock.mockReturnValue({
            mode: 'stdio',
            port: 4567,
            dev: false,
            help: false,
            killExisting: true,
            forceSeed: false,
        });
        startStdioProxyMock.mockResolvedValue(undefined);
        ensurePortAvailableMock.mockResolvedValue(true);
        initializeGlobalDatabaseServiceMock.mockResolvedValue(fakeGlobalDbService);
        fakeDb.all.mockResolvedValue([]);

        exitSpy = null;
    });

    afterEach(() => {
        if (exitSpy) {
            exitSpy.mockRestore();
        }
        vi.clearAllMocks();
    });

    it('disables autoProxy and launches stdio proxy when running in stdio mode', async () => {
        instanceManagerMocks.tryBecomeMain.mockResolvedValue(false);

        let capturedOptions: any;
        let capturedInstanceManager: any;

        startMcpServerMock.mockImplementation(async (options: any) => {
            capturedOptions = options;
            capturedInstanceManager = options.instanceManager;

            if (options.onProxyStart) {
                await options.onProxyStart({
                    role: InstanceRole.PROXY,
                    instanceManager: capturedInstanceManager,
                    proxyServer: null,
                    coordination: undefined,
                });
            }

            return {
                role: InstanceRole.PROXY,
                instanceManager: capturedInstanceManager,
                proxyServer: null,
            };
        });

        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        const { main } = await import('../index.ts');

        await main();

        expect(startStdioProxyMock).toHaveBeenCalledTimes(1);
        expect(ensurePortAvailableMock).not.toHaveBeenCalled();
        expect(startStdioProxyMock.mock.calls[0][0]).toMatchObject({
            port: 4567,
            serverName: 'specly',
            serverVersion: expect.any(String),
            clientName: 'specly-proxy',
        });
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('propagates dev flag and killExisting=true to server setup', async () => {
        instanceManagerMocks.tryBecomeMain.mockResolvedValue(true);

        parseCliArgsMock.mockReturnValue({
            mode: 'http',
            port: 6000,
            dev: true,
            help: false,
            killExisting: true,
            forceSeed: false,
            local: true,
        });

        createHonoMcpServerMock.mockReturnValue({
            get: vi.fn(),
            post: vi.fn(),
        });

        startHonoMcpServerMock.mockImplementation(async (options: any) => {
            if (options.configureApp) {
                await options.configureApp({ get: vi.fn(), post: vi.fn() });
            }
            if (options.setupRoutes) {
                await options.setupRoutes({ get: vi.fn(), post: vi.fn() });
            }
            if (options.onAfterStart) {
                await options.onAfterStart({ get: vi.fn(), post: vi.fn() });
            }
            return { get: vi.fn(), post: vi.fn() };
        });

        const { main } = await import('../index.ts');

        await expect(main()).resolves.toBeUndefined();

        expect(ensurePortAvailableMock).toHaveBeenCalledWith(6000, true);
        expect(startHonoMcpServerMock).toHaveBeenCalledWith(expect.objectContaining({
            serverName: 'specly',
            serverVersion: expect.any(String),
            port: 6000,
        }));
        expect(instanceManagerMocks.startBackgroundJobs).toHaveBeenCalled();
        expect(startStdioProxyMock).not.toHaveBeenCalled();
        expect(serveMock).not.toHaveBeenCalled(); // serve is called inside startHonoMcpServer
    });

    it('aborts startup when --no-kill is provided and port is busy', async () => {
        instanceManagerMocks.tryBecomeMain.mockResolvedValue(true);

        parseCliArgsMock.mockReturnValue({
            mode: 'http',
            port: 7000,
            dev: false,
            help: false,
            killExisting: false,
            forceSeed: false,
            local: true,
        });

        ensurePortAvailableMock.mockResolvedValue(false);

        startHonoMcpServerMock.mockImplementation(async (options: any) => {
            await options.onBeforeStart?.();
            return {
                get: vi.fn(),
                post: vi.fn(),
            };
        });

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        const { main } = await import('../index.ts');

        try {
            await expect(main()).resolves.toBeUndefined();

            expect(ensurePortAvailableMock).toHaveBeenCalledWith(7000, false);
            expect(startHonoMcpServerMock).not.toHaveBeenCalled();
            expect(fakeSeedManagerSeedMock).not.toHaveBeenCalled();
            expect(startStdioProxyMock).not.toHaveBeenCalled();
            expect(exitSpy).toHaveBeenCalledWith(1);
            const errorCalls = consoleErrorSpy.mock.calls.filter((call) => call[0] === 'Error starting server:');
            expect(errorCalls.length).toBeGreaterThanOrEqual(1);
            const errorArg = errorCalls[0][1];
            expect(errorArg).toBeInstanceOf(Error);
            expect((errorArg as Error).message).toMatch(/--no-kill was provided/i);
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });
});
