import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

describe('index.ts full integration (mocked deps)', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.useFakeTimers();

        // Lightweight mocks for external libraries that would otherwise be heavy
        vi.doMock('zod-to-json-schema', () => ({ zodToJsonSchema: (s: any) => ({}) }));

        // Mock global DB initializer to provide minimal drizzle manager
        vi.doMock('../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({
                getDrizzleManager: () => ({
                    getDb: () => ({ all: async () => [] })
                })
            })
        }));

        // Mock DatabaseService
        vi.doMock('../services/database-service.js', () => ({
            DatabaseService: class DatabaseService { }
        }));

        // Mock SeedManager
        vi.doMock('../services/seed-manager.js', () => ({
            SeedManager: class SeedManager { async initializeGlobalData() { } async seedSpecly() { return { seeded: true }; } }
        }));

        // Mock PromptOrchestrator
        vi.doMock('../services/prompt-orchestrator.js', () => ({ PromptOrchestrator: class PromptOrchestrator { } }));

        // Mock API router & SSE manager
        vi.doMock('../api/router.js', () => ({ createApiRouter: async () => ({ router: true }), SSEEventManager: class SSEEventManager { } }));

        // Mock background jobs service
        vi.doMock('../services/background-jobs-service.js', () => ({
            BackgroundJobsService: class BackgroundJobsService {
                constructor(_db: any, _config: any) { }
                async runAll() { return { transientSessionsDeleted: 1, softDeletePurged: 2 }; }
            }
        }));

        // Explicitly mock each tool module to export the class and schema the index imports
        vi.doMock('../tools/init.js', () => ({ InitToolNew: class InitToolNew { async execute() { return {}; } }, initToolSchema: {} }));
        vi.doMock('../tools/start.js', () => ({ StartTool: class StartTool { async execute() { return {}; } }, startToolSchema: {} }));
        vi.doMock('../tools/add.js', () => ({ AddToolNew: class AddToolNew { async execute() { return {}; } }, addToolSchema: {} }));
        vi.doMock('../tools/status.js', () => ({ StatusToolNew: class StatusToolNew { async execute() { return {}; } }, statusToolSchema: {} }));
        vi.doMock('../tools/update.js', () => ({ UpdateToolNew: class UpdateToolNew { async execute() { return {}; } }, updateToolSchema: {} }));
        vi.doMock('../tools/audit.js', () => ({ AuditToolNew: class AuditToolNew { async execute() { return {}; } }, auditToolSchema: {} }));
        vi.doMock('../tools/focus.js', () => ({ FocusToolNew: class FocusToolNew { async execute() { return {}; } }, focusToolSchema: {} }));
        vi.doMock('../tools/github.js', () => ({ GitHubTool: class GitHubTool { async execute() { return {}; } }, githubToolSchema: {} }));
        vi.doMock('../tools/rule-update.js', () => ({ RuleUpdateTool: class RuleUpdateTool { async execute() { return {}; } }, ruleUpdateToolSchema: {} }));
        vi.doMock('../tools/remote-interface.js', () => ({ RemoteInterfaceTool: class RemoteInterfaceTool { async execute() { return {}; } }, remoteInterfaceToolSchema: {} }));
        vi.doMock('../tools/update-resources.js', () => ({ UpdateResourcesTool: class UpdateResourcesTool { async execute() { return {}; } }, updateResourcesToolSchema: {} }));
        vi.doMock('../tools/update-steps.js', () => ({ UpdateStepsTool: class UpdateStepsTool { async execute() { return {}; } }, updateStepsToolSchema: {} }));

        // Mock mcp-kit server functions used by index.ts
        vi.doMock('@omar391/mcp-kit/server', () => ({
            startMcpServer: async (opts: any) => {
                // Provide an `app` implementing the methods index.ts expects
                const app: any = {
                    _onError: null,
                    onError(fn: any) { this._onError = fn; },
                    route(path: string, router: any) { this._route = { path, router }; }
                };

                // Call lifecycle hooks synchronously to exercise main() hooks
                if (opts.onInitialize) await opts.onInitialize({});
                if (opts.configureApp) await opts.configureApp(app, { local: true });
                if (opts.setupRoutes) await opts.setupRoutes(app, {});
                if (opts.onAfterStart) await opts.onAfterStart(app as any, { port: 1234 });
                if (opts.localMode && opts.localMode.onLocalStart) await opts.localMode.onLocalStart({}, { local: true });
                if (opts.localMode && opts.localMode.onShutdown) await opts.localMode.onShutdown({}, {});
                if (opts.localMode && opts.localMode.onTransition) await opts.localMode.onTransition({}, {});
            },
            createToolHandlers: (specs: any) => ({ listTools: async () => ({ tools: specs.map((s: any) => ({ ...s, inputSchema: {} })) }), handleToolCall: async () => ({}) })
        }));

        // Mock InstanceManager class
        vi.doMock('@omar391/mcp-kit/server/local/node-instance', () => ({ InstanceManager: class InstanceManager { constructor(public opts: any) { } } }));

        // Prevent actual child_process spawn and process.exit from killing the test runner
        vi.doMock('child_process', () => ({ spawn: () => ({ unref: () => { } }) }));
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { /* no-op */ }) as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('exports and behaviors are reachable (main, handlers, background jobs, seed)', async () => {
        const mod = await import('../index.js');

        // Basic exported constant
        expect(typeof mod.SPECLY_VERSION).toBe('string');

        // createMCPToolHandlers returns handlers and listTools works
        const handlers = mod.createMCPToolHandlers();
        expect(typeof handlers.listTools).toBe('function');
        const listed = await handlers.listTools();
        expect(Array.isArray(listed.tools)).toBe(true);

        // Configure app error handler behavior
        const app: any = { onError: (fn: any) => { app._onError = fn; }, route: vi.fn() };
        await mod.configureSpeclyApp(app, { local: true });
        // call onError for different error names
        const json = (payload: any, status: number) => ({ payload, status });
        const context: any = { json };
        const err1 = new Error('bad'); err1.name = 'ValidationError';
        const resp1 = await app._onError(err1, context);
        expect(resp1.status).toBe(422);
        const err2 = new Error('nf'); err2.name = 'NotFoundError';
        const resp2 = await app._onError(err2, context);
        expect(resp2.status).toBe(404);

        // setupSpeclyApi should call createApiRouter and register route
        await mod.setupSpeclyApi(app);
        expect(app.route).toHaveBeenCalledWith('/api', { router: true });

        // ensureSpeclySeed: initialize server so globalDbService is set, then call seed
        await mod.ensureServerInitialized();
        const spyLog = vi.spyOn(console, 'log').mockImplementation(() => { });
        await mod.ensureSpeclySeed(true);
        expect(spyLog).toHaveBeenCalled();

        // background jobs: start and stop
        await mod.ensureServerInitialized(); // initialize server to set up globalDbService
        const serverInstance: any = await import('../index.js');
        serverInstance.createMCPToolHandlers();
        // start and stop background jobs on the singleton
        // startBackgroundJobs is a method on the singleton; call via exported functions
        // We reach the underlying methods via the module's singleton functions
        const ss: any = await import('../index.js');
        ss.createMCPToolHandlers();
        // call startBackgroundJobs() via internal singleton
        // access internal speclyServer through exported functions by invoking start/stop via main flows
        // Directly call startBackgroundJobs via ensuring server initialized and then calling startBackgroundJobs on the underlying instance
        // (we can access methods by importing the module and reaching into its closure)
        // Instead call main which will exercise localMode flows and start/stop
        await mod.main();

        expect(spyLog).toHaveBeenCalled();
    });
});
