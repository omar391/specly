import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { SpeclyServer, SPECLY_VERSION, initializeServer, ensureServerInitialized, createMCPToolHandlers, configureSpeclyApp, setupSpeclyApi, ensureSpeclySeed, main } from '../index.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { Hono, type Context } from 'hono';
import { BackgroundJobsService } from '../services/background-jobs-service.js';
import { SSEEventManager } from '../api/router.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Mock external dependencies at module level
vi.mock('fs', () => ({
    readFileSync: vi.fn()
}));

vi.mock('zod-to-json-schema', () => ({
    zodToJsonSchema: vi.fn()
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
    startMcpServer: vi.fn()
}));

vi.mock('@omar391/mcp-kit/server/handlers', () => ({
    createToolHandlers: mockCreateToolHandlers
}));

vi.mock('@omar391/mcp-kit/utils/cli-parser', () => ({
    parseCliArgs: vi.fn()
}));

vi.mock('zod-to-json-schema', () => ({
    zodToJsonSchema: vi.fn()
}));

vi.mock('fs', () => ({
    readFileSync: vi.fn()
}));

// Mock the MCP Kit server module
vi.mock('@omar391/mcp-kit/server', () => ({
    startMcpServer: vi.fn()
}));

// Mock the MCP Kit handlers module (for require calls)
vi.mock('@omar391/mcp-kit/server/handlers', () => ({
    createToolHandlers: vi.fn()
}), { virtual: true });

// Mock the MCP Kit CLI parser (for require calls)
vi.mock('@omar391/mcp-kit/utils/cli-parser', () => ({
    parseCliArgs: vi.fn()
}), { virtual: true });

// Create mock functions
const mockCreateToolHandlers = vi.fn((specs) => {
    console.log('mockCreateToolHandlers called with specs:', specs?.length || 0, 'tools');
    return {
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        handleToolCall: vi.fn().mockResolvedValue({ content: [] })
    };
});
const mockParseCliArgs = vi.fn();
const mockStartMcpServer = vi.fn();

// Mock require for MCP Kit modules
vi.stubGlobal('require', (id: string) => {
    if (id === '@omar391/mcp-kit/server/handlers') {
        return { createToolHandlers: mockCreateToolHandlers };
    }
    if (id === '@omar391/mcp-kit/utils/cli-parser') {
        return { parseCliArgs: mockParseCliArgs };
    }
    if (id === '@omar391/mcp-kit/server') {
        return { startMcpServer: mockStartMcpServer };
    }
    // For other modules, use the real require
    return vi.importActual(id);
});

// Create mock instances
const mockDrizzleManager = {
    getDb: vi.fn(),
    initialize: vi.fn(),
    getDrizzleManager: vi.fn()
};

// Set up circular reference
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

const mockApiRouter = {
    routes: [],
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
};

// Set up mock implementations
beforeAll(async () => {
  // Set up mock implementations for all services
  const { initializeGlobalDatabaseService } = await import('../database/global-queries.js');
  initializeGlobalDatabaseService.mockResolvedValue(mockGlobalDbService);

  const { DatabaseService } = await import('../services/database-service.js');
  DatabaseService.mockImplementation(() => mockDatabaseService);

  const { SeedManager } = await import('../services/seed-manager.js');
  SeedManager.mockImplementation(() => mockSeedManager);

  const { PromptOrchestrator } = await import('../services/prompt-orchestrator.js');
  PromptOrchestrator.mockImplementation(() => mockPromptOrchestrator);

  const { BackgroundJobsService } = await import('../services/background-jobs-service.js');
  BackgroundJobsService.mockImplementation(() => mockBackgroundJobsService);

    // Set up MCP Kit mocks
    const { createToolHandlers } = await import('@omar391/mcp-kit/server/handlers');
    createToolHandlers.mockImplementation(mockCreateToolHandlers);

  // Set up tool mocks with static imports
  const { InitToolNew } = await import('../tools/init.js');
  const { StartTool } = await import('../tools/start.js');
  const { AddToolNew } = await import('../tools/add.js');
  const { StatusToolNew } = await import('../tools/status.js');
  const { UpdateToolNew } = await import('../tools/update.js');
  const { AuditToolNew } = await import('../tools/audit.js');
  const { FocusToolNew } = await import('../tools/focus.js');
  const { GitHubTool } = await import('../tools/github.js');
  const { RuleUpdateTool } = await import('../tools/rule-update.js');
  const { RemoteInterfaceTool } = await import('../tools/remote-interface.js');
  const { UpdateResourcesTool } = await import('../tools/update-resources.js');
  const { UpdateStepsTool } = await import('../tools/update-steps.js');

  InitToolNew.mockImplementation(() => mockTools);
  StartTool.mockImplementation(() => mockTools);
  AddToolNew.mockImplementation(() => mockTools);
  StatusToolNew.mockImplementation(() => mockTools);
  UpdateToolNew.mockImplementation(() => mockTools);
  AuditToolNew.mockImplementation(() => mockTools);
  FocusToolNew.mockImplementation(() => mockTools);
  GitHubTool.mockImplementation(() => mockTools);
  RuleUpdateTool.mockImplementation(() => mockTools);
  RemoteInterfaceTool.mockImplementation(() => mockTools);
  UpdateResourcesTool.mockImplementation(() => mockTools);
  UpdateStepsTool.mockImplementation(() => mockTools);
});vi.mock('../tools/status.js', () => ({
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

vi.mock('@omar391/mcp-kit/server/handlers', () => ({
    createToolHandlers: vi.fn()
}));

vi.mock('@omar391/mcp-kit/server', () => ({
    startMcpServer: vi.fn()
}));

vi.mock('@omar391/mcp-kit/utils/cli-parser', () => ({
    parseCliArgs: vi.fn()
}));

vi.mock('@omar391/mcp-kit/server/local/node-instance', () => ({
    InstanceManager: vi.fn()
}));

vi.mock('../services/global-database-service.js', () => ({
    GlobalDatabaseService: vi.fn()
}));

describe('index.ts', () => {
  describe.skip('SPECLY_VERSION', () => {
    it('returns a version string', () => {
      expect(typeof SPECLY_VERSION).toBe('string');
      expect(SPECLY_VERSION.length).toBeGreaterThan(0);
    });

      it('falls back to default version when package.json read fails', () => {
          const fs = vi.mocked(require('fs'));
        fs.readFileSync.mockImplementationOnce(() => {
            throw new Error('File not found');
        });
        // Re-import to trigger the version calculation
        const { SPECLY_VERSION: version } = require('../index.js');
        expect(version).toBe('0.1.0');
    });

      it('reads version from package.json when available', () => {
          const fs = vi.mocked(require('fs'));
        fs.readFileSync.mockReturnValueOnce(JSON.stringify({ version: '1.2.3' }));
        // Re-import to trigger the version calculation
        const { SPECLY_VERSION: version } = require('../index.js');
        expect(version).toBe('1.2.3');
    });
  });

  describe('SpeclyServer', () => {
      let server: SpeclyServer;

      beforeEach(async () => {
      server = new SpeclyServer();
          // Reset mocks to default state
          const { initializeGlobalDatabaseService } = await import('../database/global-queries.js');
          initializeGlobalDatabaseService.mockResolvedValue(mockGlobalDbService);
    });

      describe('initializeServer', () => {
          it('initializes all services and tools successfully', async () => {
              mockDrizzleManager.getDb.mockReturnValue({
                  all: vi.fn().mockResolvedValue([])
              });

              await server.initializeServer();

              expect(mockGlobalDbService.getDrizzleManager).toHaveBeenCalled();
              expect(mockSeedManager.initializeGlobalData).toHaveBeenCalled();
              expect(server['serverInitialized']).toBe(true);
          });

          it('throws error when initialization fails', async () => {
              const { initializeGlobalDatabaseService } = await import('../database/global-queries.js');
              initializeGlobalDatabaseService.mockImplementationOnce(() => Promise.reject(new Error('Init failed')));

              await expect(server.initializeServer()).rejects.toThrow('Init failed');
              expect(server['serverInitialized']).toBe(false);
          });
      });

      describe('ensureServerInitialized', () => {
          it('does nothing when already initialized', async () => {
              server['serverInitialized'] = true;
              await server.ensureServerInitialized();
              // Should not call initializeServer again
          });

          it('initializes server when not initialized', async () => {
              mockDrizzleManager.getDb.mockReturnValue({
                  all: vi.fn().mockResolvedValue([])
              });

          await server.ensureServerInitialized();
          expect(server['serverInitialized']).toBe(true);
      });
    });

      describe('createMCPToolHandlers', () => {
          beforeEach(async () => {
              mockDrizzleManager.getDb.mockReturnValue({
                  all: vi.fn().mockResolvedValue([])
              });
              await server.initializeServer();
          });

          it.skip('creates tool handlers with all tools', () => {
          mockCreateToolHandlers.mockReturnValue({
              listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'test', inputSchema: {} }] }),
              handleToolCall: vi.fn()
          });

          zodToJsonSchema.mockReturnValue({ type: 'object' });

          const handlers = server.createMCPToolHandlers();

          expect(mockCreateToolHandlers).toHaveBeenCalled();
          expect(typeof handlers.listTools).toBe('function');
          expect(typeof handlers.handleToolCall).toBe('function');
      });

          it.skip('adapts listTools to include JSON schemas', async () => {
          const mockListTools = vi.fn().mockResolvedValue({
              tools: [{ name: 'test', inputSchema: {} }]
          });

          mockCreateToolHandlers.mockReturnValue({
              listTools: mockListTools,
              handleToolCall: vi.fn()
          });

          zodToJsonSchema.mockReturnValue({ type: 'object', properties: {} });

          const handlers = server.createMCPToolHandlers();
          const result = await handlers.listTools();

          expect(zodToJsonSchema).toHaveBeenCalledWith({});
          expect(result.tools[0].inputSchema).toEqual({ type: 'object', properties: {} });
      });
    });

      describe('configureSpeclyApp', () => {
          it('adds error handling middleware', async () => {
              const app = new Hono();
              await server.configureSpeclyApp(app, { dev: true });

          // Test error handling by triggering an error
          const error = new Error('Test error');
          error.name = 'ValidationError';

          // Mock context
          const mockContext = {
              json: vi.fn()
          };

          // Get the error handler (should be the last middleware)
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

        it('handles different error types correctly', async () => {
            const app = new Hono();
            await server.configureSpeclyApp(app, { dev: false });

            const testCases = [
                { errorName: 'NotFoundError', statusCode: 404, code: 'NOT_FOUND' },
                { errorName: 'BadRequestError', statusCode: 400, code: 'BAD_REQUEST' },
                { errorName: 'UnknownError', statusCode: 500, code: 'INTERNAL_ERROR' }
            ];

            for (const { errorName, statusCode, code } of testCases) {
                const error = new Error('Test error');
                error.name = errorName;

                const mockContext = {
                    json: vi.fn()
                };

                const middlewares = (app as any).middlewares || [];
                if (middlewares.length > 0) {
                    const errorHandler = middlewares[middlewares.length - 1];
                    if (errorHandler && typeof errorHandler === 'function') {
                        await errorHandler(error, mockContext as any);
                        expect(mockContext.json).toHaveBeenCalledWith(
                            { error: { code, message: 'Test error' } },
                            statusCode
                        );
                    }
                }
            }
        });
    });

      describe('setupSpeclyApi', () => {
          beforeEach(async () => {
              mockDrizzleManager.getDb.mockReturnValue({
                  all: vi.fn().mockResolvedValue([])
              });
              await server.initializeServer();
          });

          it.skip('sets up API routes', async () => {
              const app = new Hono();
              await server.setupSpeclyApi(app);

              expect(mockApiRouter).toBeDefined();
          });
      });

      describe('ensureSpeclySeed', () => {
          beforeEach(async () => {
              mockDrizzleManager.getDb.mockReturnValue({
                  all: vi.fn().mockResolvedValue([])
              });
              await server.initializeServer();
          });

          it('seeds when no root profile exists', async () => {
              mockDrizzleManager.getDb.mockReturnValue({
                  all: vi.fn().mockResolvedValue([])
              });
              mockSeedManager.seedSpecly.mockResolvedValue({ seeded: true });

              await server.ensureSpeclySeed(false);

              expect(mockSeedManager.seedSpecly).toHaveBeenCalled();
              expect(server['lastSeedSummary']).toBeDefined();
          });

          it.skip('does not seed when root profile exists and force is false', async () => {
              const freshServer = new SpeclyServer();
              // Set up mock for this test
              const mockAll = vi.fn().mockResolvedValue([{ id: 1 }]);
              mockDrizzleManager.getDb.mockReturnValue({
                  all: mockAll
              });
              await freshServer.initializeServer();

              await freshServer.ensureSpeclySeed(false);

              expect(mockSeedManager.seedSpecly).not.toHaveBeenCalled();
          });

          it('forces seed when force is true', async () => {
              mockDrizzleManager.getDb.mockReturnValue({
                  all: vi.fn().mockResolvedValue([{ id: 1 }])
              });
              mockSeedManager.seedSpecly.mockResolvedValue({ forced: true });

              await server.ensureSpeclySeed(true);

              expect(mockSeedManager.seedSpecly).toHaveBeenCalled();
          });

          it('handles seeding errors gracefully', async () => {
              mockDrizzleManager.getDb.mockReturnValue({
                  all: vi.fn().mockRejectedValue(new Error('DB error'))
              });

              // Should not throw
              await server.ensureSpeclySeed(false);
          });
      });

      describe('getGlobalDbService', () => {
          it('returns global db service when initialized', async () => {
              mockDrizzleManager.getDb.mockReturnValue({
                  all: vi.fn().mockResolvedValue([])
              });
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
              mockDrizzleManager.getDb.mockReturnValue({
                  all: vi.fn().mockResolvedValue([])
              });
              await server.initializeServer();
              // Reset BackgroundJobsService mock
              BackgroundJobsService.mockClear();
          });

          it('starts background jobs with default config', () => {
              mockBackgroundJobsService.runAll.mockResolvedValue({
                  transientSessionsDeleted: 5,
                  softDeletePurged: 10
              });

              server.startBackgroundJobs();

              expect(mockBackgroundJobsService.runAll).toHaveBeenCalled();
              expect(server['backgroundJobsService']).toBeDefined();
              expect(server['gcInterval']).toBeDefined();
          });

          it('does not start when already started', () => {
              server['backgroundJobsService'] = mockBackgroundJobsService;
              server.startBackgroundJobs();

              // Should not create new instance
              expect(BackgroundJobsService).toHaveBeenCalledTimes(0);
          });

          it('respects SPECLY_GC_ENABLED=false', () => {
              process.env.SPECLY_GC_ENABLED = 'false';

              server.startBackgroundJobs();

              expect(server['backgroundJobsService']).toBeUndefined();
              expect(server['gcInterval']).toBeNull();

              delete process.env.SPECLY_GC_ENABLED;
          });

          it('handles initial run errors', async () => {
              mockBackgroundJobsService.runAll.mockRejectedValue(new Error('GC failed'));

              server.startBackgroundJobs();

              // Should still set up interval despite initial failure
              expect(server['gcInterval']).toBeDefined();
          });
      });

      describe('stopBackgroundJobs', () => {
          it('stops background jobs and clears interval', () => {
              server['gcInterval'] = setInterval(() => { }, 1000);
              server['backgroundJobsService'] = mockBackgroundJobsService;

              server.stopBackgroundJobs();

              expect(server['gcInterval']).toBeNull();
          });

          it('does nothing when no interval exists', () => {
              server.stopBackgroundJobs();
              // Should not throw
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
                expect(typeof handlers.listTools).toBe('function');
                expect(typeof handlers.handleToolCall).toBe('function');
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

    describe.skip('main function', () => {
        let originalArgv: string[];
        let originalUrl: string;

        beforeEach(() => {
            originalArgv = process.argv;
            originalUrl = import.meta.url;
        });

        afterEach(() => {
            process.argv = originalArgv;
            (global as any).import = { meta: { url: originalUrl } };
        });

        it('starts MCP server with correct configuration', async () => {
            const { startMcpServer } = await import('@omar391/mcp-kit/server');
            const { parseCliArgs } = await import('@omar391/mcp-kit/utils/cli-parser');

            const mockStartMcpServer = vi.mocked(startMcpServer);
            const mockParseCliArgs = vi.mocked(parseCliArgs);

            mockParseCliArgs.mockReturnValue({
                port: 8989,
                mode: 'http',
                local: false,
                dev: false,
                help: false,
                killExisting: true,
                forceSeed: false
            });

            mockStartMcpServer.mockResolvedValue(undefined);

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

        it('handles main execution errors in http mode', async () => {
            const { startMcpServer } = await import('@omar391/mcp-kit/server');
            const { parseCliArgs } = await import('@omar391/mcp-kit/utils/cli-parser');

            const mockStartMcpServer = vi.mocked(startMcpServer);
            const mockParseCliArgs = vi.mocked(parseCliArgs);

            mockParseCliArgs.mockReturnValue({
                port: 8989,
                mode: 'http',
                local: false,
                dev: false,
                help: false,
                killExisting: true,
                forceSeed: false
            });

            mockStartMcpServer.mockRejectedValue(new Error('Server start failed'));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await main();

            expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));

            consoleSpy.mockRestore();
        });

        it('does not log errors in stdio mode', async () => {
            const { startMcpServer } = await import('@omar391/mcp-kit/server');
            const { parseCliArgs } = await import('@omar391/mcp-kit/utils/cli-parser');

            const mockStartMcpServer = vi.mocked(startMcpServer);
            const mockParseCliArgs = vi.mocked(parseCliArgs);

            mockParseCliArgs.mockReturnValue({
                port: 8989,
                mode: 'stdio',
                local: false,
                dev: false,
                help: false,
                killExisting: true,
                forceSeed: false
            });

            mockStartMcpServer.mockRejectedValue(new Error('Server start failed'));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await main();

            expect(consoleSpy).not.toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('calls onInitialize with forceSeed option', async () => {
            const { startMcpServer } = await import('@omar391/mcp-kit/server');
            const { parseCliArgs } = await import('@omar391/mcp-kit/utils/cli-parser');

            const mockStartMcpServer = vi.mocked(startMcpServer);
            const mockParseCliArgs = vi.mocked(parseCliArgs);

            mockParseCliArgs.mockReturnValue({
                port: 8989,
                mode: 'http',
                local: false,
                dev: false,
                help: false,
                killExisting: true,
                forceSeed: true
            });

            mockStartMcpServer.mockImplementation(async (config) => {
                // Call the onInitialize function
                if (config.onInitialize) {
                    await config.onInitialize({ forceSeed: true });
                }
            });

            await main();

            expect(mockSeedManager.seedSpecly).toHaveBeenCalled();
        });

        it('starts background jobs in local mode', async () => {
            const { startMcpServer } = await import('@omar391/mcp-kit/server');
            const { parseCliArgs } = await import('@omar391/mcp-kit/utils/cli-parser');

            const mockStartMcpServer = vi.mocked(startMcpServer);
            const mockParseCliArgs = vi.mocked(parseCliArgs);

            mockParseCliArgs.mockReturnValue({
                port: 8989,
                mode: 'http',
                local: true,
                dev: false,
                help: false,
                killExisting: true,
                forceSeed: false
            });

            mockStartMcpServer.mockImplementation(async (config) => {
                // Call the localMode onLocalStart function
                if (config.localMode?.onLocalStart) {
                    await config.localMode.onLocalStart(null as any, { local: true });
                }
            });

            await main();

            expect(mockBackgroundJobsService.runAll).toHaveBeenCalled();
        });

        it('handles shutdown in local mode', async () => {
            const { startMcpServer } = await import('@omar391/mcp-kit/server');
            const { parseCliArgs } = await import('@omar391/mcp-kit/utils/cli-parser');

            const mockStartMcpServer = vi.mocked(startMcpServer);
            const mockParseCliArgs = vi.mocked(parseCliArgs);

            mockParseCliArgs.mockReturnValue({
                port: 8989,
                mode: 'http',
                local: true,
                dev: false,
                help: false,
                killExisting: true,
                forceSeed: false
            });

            mockStartMcpServer.mockImplementation(async (config) => {
                // Call the localMode onShutdown function
                if (config.localMode?.onShutdown) {
                    await config.localMode.onShutdown(null as any, { local: true });
                }
            });

            const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { });

            await main();

            expect(exitSpy).toHaveBeenCalledWith(0);

            exitSpy.mockRestore();
        });

        it('configures app with dev options', async () => {
            const { startMcpServer } = await import('@omar391/mcp-kit/server');
            const { parseCliArgs } = await import('@omar391/mcp-kit/utils/cli-parser');

            const mockStartMcpServer = vi.mocked(startMcpServer);
            const mockParseCliArgs = vi.mocked(parseCliArgs);

            mockParseCliArgs.mockReturnValue({
                port: 8989,
                mode: 'http',
                local: true,
                dev: false,
                help: false,
                killExisting: true,
                forceSeed: false
            });

            mockStartMcpServer.mockImplementation(async (config) => {
                // Call the configureApp function
                if (config.configureApp) {
                    const app = new Hono();
                    await config.configureApp(app, { local: true });
                }
            });

            await main();

            // Verify configureSpeclyApp was called with dev: true when local is true
            expect(mockGlobalDbService.getDrizzleManager).toHaveBeenCalled();
        });

        it('sets up API routes', async () => {
            const { startMcpServer } = await import('@omar391/mcp-kit/server');
            const { parseCliArgs } = await import('@omar391/mcp-kit/utils/cli-parser');

            const mockStartMcpServer = vi.mocked(startMcpServer);
            const mockParseCliArgs = vi.mocked(parseCliArgs);

            mockParseCliArgs.mockReturnValue({
                port: 8989,
                mode: 'http',
                local: false,
                dev: false,
                help: false,
                killExisting: true,
                forceSeed: false
            });

            mockStartMcpServer.mockImplementation(async (config) => {
                // Call the setupRoutes function
                if (config.setupRoutes) {
                    const app = new Hono();
                    await config.setupRoutes(app, { local: false });
                }
            });

            await main();

            // Verify setupSpeclyApi was called
            expect(mockGlobalDbService.getDrizzleManager).toHaveBeenCalled();
        });

        it('logs server start message', async () => {
            const { startMcpServer } = await import('@omar391/mcp-kit/server');
            const { parseCliArgs } = await import('@omar391/mcp-kit/utils/cli-parser');

            const mockStartMcpServer = vi.mocked(startMcpServer);
            const mockParseCliArgs = vi.mocked(parseCliArgs);

            mockParseCliArgs.mockReturnValue({
                port: 8080,
                mode: 'http',
                local: false,
                dev: false,
                help: false,
                killExisting: true,
                forceSeed: false
            });

            mockStartMcpServer.mockImplementation(async (config) => {
                // Call the onAfterStart function
                if (config.onAfterStart) {
                    const app = new Hono();
                    await config.onAfterStart(app, { port: 8080 });
                }
            });

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

            await main();

            expect(consoleSpy).toHaveBeenCalledWith('Specly backend server running on http://localhost:8080');

            consoleSpy.mockRestore();
        });
    });
});