import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { InstanceRole } from '@omar391/mcp-kit/node-instance';

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

vi.mock('@omar391/mcp-kit/utils/port-manager', () => ({
    ensurePortAvailable: ensurePortAvailableMock,
}));

vi.mock('../database/global-queries.js', () => ({
    initializeGlobalDatabaseService: initializeGlobalDatabaseServiceMock,
}));

vi.mock('../services/database-service.js', () => ({
    DatabaseService: class {
        constructor(_: unknown) { }
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
        startBackgroundJobs: vi.fn(),
        stopBackgroundJobs: vi.fn(),
    };
});

vi.mock('../server/instance-manager.js', async () => {
    const actual = await vi.importActual<typeof import('@omar391/mcp-kit/node-instance')>('@omar391/mcp-kit/node-instance');
    class InstanceManager {
        static VERSION = 'test-version';
        port: number;
        proxyPort: number;
        role = actual.InstanceRole.MAIN;

        constructor(_lockPath?: string, port?: number) {
            this.port = port ?? 8989;
            this.proxyPort = this.port + 1;
        }

        startBackgroundJobs = instanceManagerMocks.startBackgroundJobs;
        stopBackgroundJobs = instanceManagerMocks.stopBackgroundJobs;
    }

    return {
        InstanceManager,
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

vi.mock('@omar391/mcp-kit/node-instance', async () => {
    const actual = await vi.importActual<typeof import('@omar391/mcp-kit/node-instance')>('@omar391/mcp-kit/node-instance');
    return {
        ...actual,
        startStdioProxy: startStdioProxyMock,
    };
});

vi.mock('@omar391/mcp-kit/server', async () => {
    const actual = await vi.importActual<typeof import('@omar391/mcp-kit/server')>('@omar391/mcp-kit/server');
    return {
        ...actual,
        startMcpServer: startMcpServerMock,
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
        fakeDb.all.mockReset();
        fakeSeedManagerInitMock.mockReset();
        fakeSeedManagerSeedMock.mockReset();
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

        expect(startMcpServerMock).toHaveBeenCalledTimes(1);
        expect(capturedOptions?.autoProxy).toBe(false);
        expect(startStdioProxyMock).toHaveBeenCalledTimes(1);
        expect(ensurePortAvailableMock).not.toHaveBeenCalled();
        expect(startStdioProxyMock.mock.calls[0][0]).toMatchObject({
            port: capturedInstanceManager?.port,
            serverName: 'specly',
            serverVersion: expect.any(String),
            clientName: 'specly-proxy',
        });
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('propagates dev flag and killExisting=true to startMcpServer', async () => {
        parseCliArgsMock.mockReturnValue({
            mode: 'http',
            port: 6000,
            dev: true,
            help: false,
            killExisting: true,
            forceSeed: false,
        });

        startMcpServerMock.mockImplementation(async (options: any) => {
            await options.onBeforeStart?.();
            return {
                role: InstanceRole.MAIN,
                instanceManager: options.instanceManager,
                proxyServer: null,
                coordination: undefined,
            };
        });

        const { main } = await import('../index.ts');

        await expect(main()).resolves.toBeUndefined();

        expect(ensurePortAvailableMock).toHaveBeenCalledWith(6000, true);
        expect(startMcpServerMock).toHaveBeenCalledWith(expect.objectContaining({
            dev: true,
            expressOptions: expect.objectContaining({ dev: true, port: 6000 }),
        }));
        expect(instanceManagerMocks.startBackgroundJobs).toHaveBeenCalled();
        expect(startStdioProxyMock).not.toHaveBeenCalled();
    });

    it('aborts startup when --no-kill is provided and port is busy', async () => {
        parseCliArgsMock.mockReturnValue({
            mode: 'http',
            port: 7000,
            dev: false,
            help: false,
            killExisting: false,
            forceSeed: false,
        });

        ensurePortAvailableMock.mockResolvedValue(false);

        startMcpServerMock.mockImplementation(async (options: any) => {
            await options.onBeforeStart?.();
            return {
                role: InstanceRole.MAIN,
                instanceManager: options.instanceManager,
                proxyServer: null,
                coordination: undefined,
            };
        });

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        const { main } = await import('../index.ts');

        try {
            await expect(main()).resolves.toBeUndefined();

            expect(ensurePortAvailableMock).toHaveBeenCalledWith(7000, false);
            expect(startMcpServerMock).toHaveBeenCalledTimes(1);
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
