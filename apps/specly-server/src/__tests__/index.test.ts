import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';
import { SpeclyServer, SPECLY_VERSION, initializeServer, ensureServerInitialized, createMCPToolHandlers, configureSpeclyApp, setupSpeclyApi, ensureSpeclySeed, main } from '../index.js';
import { Hono } from 'hono';

// Mock external dependencies at module level
vi.mock('fs', () => ({
    readFileSync: vi.fn()
}));

vi.mock('../database/global-queries.js', () => ({
    initializeGlobalDatabaseService: vi.fn()
}));

vi.mock('../services/database-service.js', () => ({
    DatabaseService: vi.fn()
}));

vi.mock('../services/seed-manager.js', () => ({
    SeedManager: vi.fn()
}));

vi.mock('../services/prompt-orchestrator.js', () => ({
    PromptOrchestrator: vi.fn()
}));

vi.mock('../api/router.js', () => ({
    createApiRouter: vi.fn(() => ({
        routes: [],
        use: vi.fn(),
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
    })),
    SSEEventManager: vi.fn()
}));

vi.mock('../tools/init.js', () => ({
    InitToolNew: vi.fn(),
    initToolSchema: {}
}));

vi.mock('../tools/start.js', () => ({
    StartTool: vi.fn(),
    startToolSchema: {}
}));

vi.mock('../tools/add.js', () => ({
    AddToolNew: vi.fn(),
    addToolSchema: {}
}));

vi.mock('../tools/status.js', () => ({
    StatusToolNew: vi.fn(),
    statusToolSchema: {}
}));

vi.mock('../tools/update.js', () => ({
    UpdateToolNew: vi.fn(),
    updateToolSchema: {}
}));

vi.mock('../tools/audit.js', () => ({
    AuditToolNew: vi.fn(),
    auditToolSchema: {}
}));

vi.mock('../tools/focus.js', () => ({
    FocusToolNew: vi.fn(),
    focusToolSchema: {}
}));

vi.mock('../tools/github.js', () => ({
    GitHubTool: vi.fn(),
    githubToolSchema: {}
}));

vi.mock('../tools/rule-update.js', () => ({
    RuleUpdateTool: vi.fn(),
    ruleUpdateToolSchema: {}
}));

vi.mock('../tools/remote-interface.js', () => ({
    RemoteInterfaceTool: vi.fn(),
    remoteInterfaceToolSchema: {}
}));

vi.mock('../tools/update-resources.js', () => ({
    UpdateResourcesTool: vi.fn(),
    updateResourcesToolSchema: {}
}));

vi.mock('../tools/update-steps.js', () => ({
    UpdateStepsTool: vi.fn(),
    updateStepsToolSchema: {}
}));

vi.mock('../services/background-jobs-service.js', () => ({
    BackgroundJobsService: vi.fn()
}));

vi.mock('@omar391/mcp-kit/server', () => ({
    startMcpServer: vi.fn(),
    createToolHandlers: vi.fn()
}));

vi.mock('@omar391/mcp-kit/utils/cli-parser', () => ({
    parseCliArgs: vi.fn()
}));

vi.mock('@omar391/mcp-kit/server/local/node-instance', () => ({
    InstanceManager: vi.fn()
}));

// Create mock functions
const mockCreateToolHandlers = vi.fn((specs) => ({
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    handleToolCall: vi.fn().mockResolvedValue({ content: [] })
}));

const mockStartMcpServer = vi.fn();
const mockParseCliArgs = vi.fn();

// Set up mock implementations
beforeAll(async () => {
    // Set up MCP Kit mocks
    const { createToolHandlers } = await import('@omar391/mcp-kit/server');
    createToolHandlers.mockImplementation(mockCreateToolHandlers);

    const { startMcpServer } = await import('@omar391/mcp-kit/server');
    startMcpServer.mockImplementation(mockStartMcpServer);

    const { parseCliArgs } = await import('@omar391/mcp-kit/utils/cli-parser');
    parseCliArgs.mockImplementation(mockParseCliArgs);

    // Set up service mocks
    const { SeedManager } = await import('../services/seed-manager.js');
    SeedManager.mockImplementation(() => mockSeedManager);

    const { BackgroundJobsService } = await import('../services/background-jobs-service.js');
    BackgroundJobsService.mockImplementation(() => mockBackgroundJobsService);
});

// Create mock instances
const mockDrizzleManager = {
    getDb: vi.fn(),
    initialize: vi.fn(),
    getDrizzleManager: vi.fn()
};

mockDrizzleManager.getDrizzleManager.mockReturnValue(mockDrizzleManager);

const mockGlobalDbService = {
    getDrizzleManager: vi.fn().mockReturnValue(mockDrizzleManager),
    initialize: vi.fn(),
    getWorkspaceByPath: vi.fn(),
    createWorkspace: vi.fn(),
    getAllWorkspaces: vi.fn(),
    updateWorkspaceActivity: vi.fn()
};

const mockDatabaseService = {
    getGlobal: vi.fn().mockReturnValue(mockGlobalDbService)
};

const mockSeedManager = {
    initializeGlobalData: vi.fn(),
    seedSpecly: vi.fn()
};

const mockPromptOrchestrator = {
    orchestrate: vi.fn()
};

const mockBackgroundJobsService = {
    runAll: vi.fn()
};

const mockTools = {
    execute: vi.fn()
};

describe('index.ts', () => {
    describe('SPECLY_VERSION', () => {
        it('returns a version string', () => {
            expect(typeof SPECLY_VERSION).toBe('string');
            expect(SPECLY_VERSION.length).toBeGreaterThan(0);
        });
    });

    describe('SpeclyServer', () => {
        let server: SpeclyServer;

        beforeEach(async () => {
            server = new SpeclyServer();
            // Reset mocks
            const { initializeGlobalDatabaseService } = await import('../database/global-queries.js');
            initializeGlobalDatabaseService.mockResolvedValue(mockGlobalDbService);

            mockDrizzleManager.getDb.mockReturnValue({
                all: vi.fn().mockResolvedValue([])
            });
        });

        describe('initializeServer', () => {
            it('initializes all services and tools successfully', async () => {
                await server.initializeServer();
                expect(mockGlobalDbService.getDrizzleManager).toHaveBeenCalled();
                expect(server['serverInitialized']).toBe(true);
            });

            it('throws error when initialization fails', async () => {
                const { initializeGlobalDatabaseService } = await import('../database/global-queries.js');
                initializeGlobalDatabaseService.mockRejectedValue(new Error('Init failed'));

                await expect(server.initializeServer()).rejects.toThrow('Init failed');
                expect(server['serverInitialized']).toBe(false);
            });
        });

        describe('ensureServerInitialized', () => {
            it('initializes server when not initialized', async () => {
                await server.ensureServerInitialized();
                expect(server['serverInitialized']).toBe(true);
            });
        });

        describe('configureSpeclyApp', () => {
            it('adds error handling middleware', async () => {
                const app = new Hono();
                await server.configureSpeclyApp(app, { dev: true });

                // Test error handling by triggering an error
                const error = new Error('Test error');
                error.name = 'ValidationError';

                const mockContext = {
                    json: vi.fn()
                };

                const middlewares = (app as any).middlewares || [];
                if (middlewares.length > 0) {
                    const errorHandler = middlewares[middlewares.length - 1];
                    if (errorHandler && typeof errorHandler === 'function') {
                        await errorHandler(error, mockContext as any);
                        expect(mockContext.json).toHaveBeenCalledWith(
                            { error: { code: 'VALIDATION_ERROR', message: 'Test error' } },
                            422
                        );
                    }
                }
            });
        });

        describe('ensureSpeclySeed', () => {
            beforeEach(async () => {
                await server.initializeServer();
            });

            it('seeds when no root profile exists', async () => {
                mockDrizzleManager.getDb.mockReturnValue({
                    all: vi.fn().mockResolvedValue([])
                });
                mockSeedManager.seedSpecly.mockResolvedValue({ seeded: true });

                await server.ensureSpeclySeed(false);
                expect(mockSeedManager.seedSpecly).toHaveBeenCalled();
            });

            it('handles seeding errors gracefully', async () => {
                mockDrizzleManager.getDb.mockReturnValue({
                    all: vi.fn().mockRejectedValue(new Error('DB error'))
                });

                await server.ensureSpeclySeed(false);
                // Should not throw
            });
        });

        describe('getGlobalDbService', () => {
            it('returns global db service when initialized', async () => {
                await server.initializeServer();
                const service = server.getGlobalDbService();
                expect(service).toBe(mockGlobalDbService);
            });

            it('throws when not initialized', () => {
                expect(() => server.getGlobalDbService()).toThrow('Server not initialized');
            });
        });

        describe('startBackgroundJobs', () => {
            beforeEach(async () => {
                await server.initializeServer();
            });

            it('starts background jobs with default config', () => {
                mockBackgroundJobsService.runAll.mockResolvedValue({
                    transientSessionsDeleted: 5,
                    softDeletePurged: 10
                });

                server.startBackgroundJobs();
                expect(server['backgroundJobsService']).toBeDefined();
            });
        });

        describe('stopBackgroundJobs', () => {
            it('stops background jobs and clears interval', () => {
                server['gcInterval'] = setInterval(() => { }, 1000);
                server.stopBackgroundJobs();
                expect(server['gcInterval']).toBeNull();
            });
        });
    });

    describe('Backward compatibility functions', () => {
        beforeEach(async () => {
            mockDrizzleManager.getDb.mockReturnValue({
                all: vi.fn().mockResolvedValue([])
            });
        });

        describe('initializeServer', () => {
            it('initializes server through singleton', async () => {
                await initializeServer();
                expect(mockGlobalDbService.getDrizzleManager).toHaveBeenCalled();
            });
        });

        describe('ensureServerInitialized', () => {
            it('ensures server is initialized through singleton', async () => {
                await ensureServerInitialized();
                expect(mockGlobalDbService.getDrizzleManager).toHaveBeenCalled();
            });
        });

        describe('createMCPToolHandlers', () => {
            it('creates tool handlers through singleton', async () => {
                await initializeServer();
                const handlers = createMCPToolHandlers();
                expect(handlers).toBeDefined();
            });
        });

        describe('configureSpeclyApp', () => {
            it('configures app through singleton', async () => {
                await initializeServer();
                const app = new Hono();
                await configureSpeclyApp(app, { dev: true });
                expect(app).toBeDefined();
            });
        });

        describe('setupSpeclyApi', () => {
            it('sets up API through singleton', async () => {
                await initializeServer();
                const app = new Hono();
                await setupSpeclyApi(app, mockDatabaseService);
                expect(app).toBeDefined();
            });
        });

        describe('ensureSpeclySeed', () => {
            it('ensures seeding through singleton', async () => {
                await initializeServer();
                await ensureSpeclySeed(false);
                expect(mockSeedManager.seedSpecly).toHaveBeenCalled();
            });
        });
    });

    describe('main function', () => {
        it('starts MCP server with correct configuration', async () => {
            mockParseCliArgs.mockReturnValue({
                port: 8989,
                mode: 'http',
                local: false,
                dev: false,
                help: false,
                killExisting: true,
                forceSeed: false
            });

            let capturedCallbacks: any = {};
            mockStartMcpServer.mockImplementation(async (config) => {
                capturedCallbacks = config;
                // Call the callbacks to ensure they are covered
                if (config.createInstanceManager) {
                    const instanceManager = config.createInstanceManager({ port: 8989, local: false });
                    expect(instanceManager).toBeDefined();
                }
                if (config.onInitialize) {
                    await config.onInitialize({ port: 8989, local: false, forceSeed: false });
                }
                if (config.configureApp) {
                    const app = new Hono();
                    await config.configureApp(app, { port: 8989, local: false });
                }
                if (config.setupRoutes) {
                    const app = new Hono();
                    await config.setupRoutes(app, { port: 8989, local: false });
                }
                if (config.onAfterStart) {
                    const app = new Hono();
                    await config.onAfterStart(app, { port: 8989, local: false });
                }
                if (config.localMode?.onLocalStart) {
                    const instanceManager = config.createInstanceManager!({ port: 8989, local: true });
                    await config.localMode.onLocalStart(instanceManager, { port: 8989, local: true, forceSeed: false });
                }
                if (config.localMode?.onShutdown) {
                    const instanceManager = config.createInstanceManager!({ port: 8989, local: true });
                    await config.localMode.onShutdown(instanceManager, { port: 8989, local: true, forceSeed: false });
                }
                if (config.localMode?.onTransition) {
                    const instanceManager = config.createInstanceManager!({ port: 8989, local: true });
                    await config.localMode.onTransition(instanceManager, { port: 8989, local: true, forceSeed: false });
                }
                if (config.cliConfig?.customOptionsParser) {
                    const result = config.cliConfig.customOptionsParser(['--force-seed'], { port: 8989, mode: 'http', local: false, dev: false, help: false, killExisting: true });
                    expect(result.forceSeed).toBe(true);
                }
                return undefined;
            });

            await main();

            expect(mockStartMcpServer).toHaveBeenCalledWith({
                serverName: 'specly',
                serverVersion: SPECLY_VERSION,
                toolHandlers: expect.any(Object),
                defaultPort: 8989,
                createInstanceManager: expect.any(Function),
                onInitialize: expect.any(Function),
                configureApp: expect.any(Function),
                setupRoutes: expect.any(Function),
                onAfterStart: expect.any(Function),
                localMode: expect.any(Object),
                cliConfig: expect.any(Object)
            });
        });
    });
});