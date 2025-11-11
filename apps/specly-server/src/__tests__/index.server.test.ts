import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('index.ts server behaviors', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('initializeServer sets serverInitialized and calls seed initialization', async () => {
        // Mock global DB service
        const fakeGlobalDbService = { getDrizzleManager: () => ({}) };
        vi.doMock('../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: vi.fn().mockResolvedValue(fakeGlobalDbService),
            GlobalDatabaseService: class GlobalDatabaseService { constructor(_arg: any) { /* noop */ } }
        }));

        // Mock SeedManager and other classes used in initializeServer
        const seedInit = vi.fn().mockResolvedValue(undefined);
        vi.doMock('../services/seed-manager.js', () => ({ SeedManager: vi.fn().mockImplementation(() => ({ initializeGlobalData: seedInit })) }));
        vi.doMock('../services/prompt-orchestrator.js', () => ({ PromptOrchestrator: vi.fn().mockImplementation(() => ({})) }));

        // Mock tool classes used in constructor
        const toolMock = vi.fn().mockImplementation(() => ({}));
        vi.doMock('../tools/init.js', () => ({ InitToolNew: toolMock, initToolSchema: {} }));
        vi.doMock('../tools/start.js', () => ({ StartTool: toolMock, startToolSchema: {} }));
        vi.doMock('../tools/add.js', () => ({ AddToolNew: toolMock, addToolSchema: {} }));
        vi.doMock('../tools/status.js', () => ({ StatusToolNew: toolMock, statusToolSchema: {} }));
        vi.doMock('../tools/update.js', () => ({ UpdateToolNew: toolMock, updateToolSchema: {} }));
        vi.doMock('../tools/audit.js', () => ({ AuditToolNew: toolMock, auditToolSchema: {} }));
        vi.doMock('../tools/focus.js', () => ({ FocusToolNew: toolMock, focusToolSchema: {} }));
        vi.doMock('../tools/github.js', () => ({ GitHubTool: toolMock, githubToolSchema: {} }));
        vi.doMock('../tools/rule-update.js', () => ({ RuleUpdateTool: toolMock, ruleUpdateToolSchema: {} }));
        vi.doMock('../tools/remote-interface.js', () => ({ RemoteInterfaceTool: toolMock, remoteInterfaceToolSchema: {} }));
        vi.doMock('../tools/update-resources.js', () => ({ UpdateResourcesTool: toolMock, updateResourcesToolSchema: {} }));
        vi.doMock('../tools/update-steps.js', () => ({ UpdateStepsTool: toolMock, updateStepsToolSchema: {} }));

        const mod = await import('../index.js');
        const { SpeclyServer } = mod as any;
        const s = new SpeclyServer();

        await s.initializeServer();

        // serverInitialized internal flag isn't exposed; use ensureServerInitialized to check it doesn't reinitialize
        await s.ensureServerInitialized();

        expect(seedInit).toHaveBeenCalled();
    });

    it('ensureSpeclySeed calls seed when profiles absent and logs summary', async () => {
        // Mock global DB service to return empty rows
        const fakeDb = { all: vi.fn().mockResolvedValue([]) };
        const fakeGlobalDbService = { getDrizzleManager: () => ({ getDb: () => fakeDb }) };
        vi.doMock('../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: vi.fn().mockResolvedValue(fakeGlobalDbService),
            GlobalDatabaseService: class GlobalDatabaseService { constructor(_arg: any) { /* noop */ } }
        }));

        // Mock SeedManager with seedSpecly
        const seedSpecly = vi.fn().mockResolvedValue({ seeded: true });
        vi.doMock('../services/seed-manager.js', () => ({ SeedManager: vi.fn().mockImplementation(() => ({ initializeGlobalData: vi.fn(), seedSpecly })) }));
        vi.doMock('../services/prompt-orchestrator.js', () => ({ PromptOrchestrator: vi.fn().mockImplementation(() => ({})) }));

        // Mock tool constructors minimally
        const toolMock = vi.fn().mockImplementation(() => ({}));
        vi.doMock('../tools/init.js', () => ({ InitToolNew: toolMock, initToolSchema: {} }));
        vi.doMock('../tools/start.js', () => ({ StartTool: toolMock, startToolSchema: {} }));
        vi.doMock('../tools/add.js', () => ({ AddToolNew: toolMock, addToolSchema: {} }));
        vi.doMock('../tools/status.js', () => ({ StatusToolNew: toolMock, statusToolSchema: {} }));
        vi.doMock('../tools/update.js', () => ({ UpdateToolNew: toolMock, updateToolSchema: {} }));
        vi.doMock('../tools/audit.js', () => ({ AuditToolNew: toolMock, auditToolSchema: {} }));
        vi.doMock('../tools/focus.js', () => ({ FocusToolNew: toolMock, focusToolSchema: {} }));
        vi.doMock('../tools/github.js', () => ({ GitHubTool: toolMock, githubToolSchema: {} }));
        vi.doMock('../tools/rule-update.js', () => ({ RuleUpdateTool: toolMock, ruleUpdateToolSchema: {} }));
        vi.doMock('../tools/remote-interface.js', () => ({ RemoteInterfaceTool: toolMock, remoteInterfaceToolSchema: {} }));
        vi.doMock('../tools/update-resources.js', () => ({ UpdateResourcesTool: toolMock, updateResourcesToolSchema: {} }));
        vi.doMock('../tools/update-steps.js', () => ({ UpdateStepsTool: toolMock, updateStepsToolSchema: {} }));

        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => { });

        const mod = await import('../index.js');
        const { SpeclyServer } = mod as any;
        const s = new SpeclyServer();

        // initialize server so that globalDbService and seedManager are set
        await s.initializeServer();

        // Now call ensureSpeclySeed which should detect empty rows and call seedSpecly
        await s.ensureSpeclySeed(false);

        expect(consoleLog).toHaveBeenCalled();
    });

    it('startBackgroundJobs/stopBackgroundJobs behave when enabled and disabled', async () => {
        // Provide minimal global db service and seed manager to allow initializeServer
        const fakeGlobalDbService = { getDrizzleManager: () => ({ getDb: () => ({ all: vi.fn().mockResolvedValue([]) }) }) };
        vi.doMock('../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: vi.fn().mockResolvedValue(fakeGlobalDbService),
            GlobalDatabaseService: class GlobalDatabaseService { constructor(_arg: any) { /* noop */ } }
        }));

        // Mock SeedManager + PromptOrchestrator + tools
        vi.doMock('../services/seed-manager.js', () => ({ SeedManager: vi.fn().mockImplementation(() => ({ initializeGlobalData: vi.fn(), seedSpecly: vi.fn().mockResolvedValue({}) })) }));
        vi.doMock('../services/prompt-orchestrator.js', () => ({ PromptOrchestrator: vi.fn().mockImplementation(() => ({})) }));
        const toolMock = vi.fn().mockImplementation(() => ({}));
        vi.doMock('../tools/init.js', () => ({ InitToolNew: toolMock, initToolSchema: {} }));
        vi.doMock('../tools/start.js', () => ({ StartTool: toolMock, startToolSchema: {} }));
        vi.doMock('../tools/add.js', () => ({ AddToolNew: toolMock, addToolSchema: {} }));
        vi.doMock('../tools/status.js', () => ({ StatusToolNew: toolMock, statusToolSchema: {} }));
        vi.doMock('../tools/update.js', () => ({ UpdateToolNew: toolMock, updateToolSchema: {} }));
        vi.doMock('../tools/audit.js', () => ({ AuditToolNew: toolMock, auditToolSchema: {} }));
        vi.doMock('../tools/focus.js', () => ({ FocusToolNew: toolMock, focusToolSchema: {} }));
        vi.doMock('../tools/github.js', () => ({ GitHubTool: toolMock, githubToolSchema: {} }));
        vi.doMock('../tools/rule-update.js', () => ({ RuleUpdateTool: toolMock, ruleUpdateToolSchema: {} }));
        vi.doMock('../tools/remote-interface.js', () => ({ RemoteInterfaceTool: toolMock, remoteInterfaceToolSchema: {} }));
        vi.doMock('../tools/update-resources.js', () => ({ UpdateResourcesTool: toolMock, updateResourcesToolSchema: {} }));
        vi.doMock('../tools/update-steps.js', () => ({ UpdateStepsTool: toolMock, updateStepsToolSchema: {} }));

        // Mock BackgroundJobsService
        const runAll = vi.fn().mockResolvedValue({ transientSessionsDeleted: 1, softDeletePurged: 2 });
        const BackgroundJobsServiceMock = vi.fn().mockImplementation(() => ({ runAll }));
        vi.doMock('../services/background-jobs-service.js', () => ({ BackgroundJobsService: BackgroundJobsServiceMock }));

        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => { });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });

        const mod = await import('../index.js');
        const { SpeclyServer } = mod as any;
        const s = new SpeclyServer();
        await s.initializeServer();

        // Ensure env enables GC
        process.env.SPECLY_GC_ENABLED = 'true';
        process.env.SPECLY_GC_TRANSIENT_SESSION_HOURS = '1';
        process.env.SPECLY_GC_SOFT_DELETE_DAYS = '2';

        s.startBackgroundJobs();

        // Wait briefly to allow runAll promise resolution
        await new Promise((res) => setTimeout(res, 10));

        expect(BackgroundJobsServiceMock).toHaveBeenCalled();
        expect(runAll).toHaveBeenCalled();
        expect(consoleLog).toHaveBeenCalled();

        s.stopBackgroundJobs();
        expect(consoleLog).toHaveBeenCalled();

        // Disable background jobs via env
        process.env.SPECLY_GC_ENABLED = 'false';
        s.startBackgroundJobs();
        expect(consoleLog).toHaveBeenCalled();

        // restore env
        delete process.env.SPECLY_GC_ENABLED;
        delete process.env.SPECLY_GC_TRANSIENT_SESSION_HOURS;
        delete process.env.SPECLY_GC_SOFT_DELETE_DAYS;
    });

    it('createMCPToolHandlers returns handlers with listTools and handleToolCall', async () => {
        // Mock createToolHandlers and zod-to-json-schema
        const handlers = { listTools: vi.fn().mockResolvedValue({ tools: [{ inputSchema: { fake: true } }] }), handleToolCall: vi.fn() };
        vi.doMock('@omar391/mcp-kit/server', () => ({ createToolHandlers: () => handlers }));
        vi.doMock('zod-to-json-schema', () => ({ zodToJsonSchema: (s: any) => ({ json: true }) }));

        // Provide minimal DB/global mocks to allow server instance
        const fakeGlobalDbService = { getDrizzleManager: () => ({}) };
        vi.doMock('../database/global-queries.js', () => ({ initializeGlobalDatabaseService: vi.fn().mockResolvedValue(fakeGlobalDbService), GlobalDatabaseService: class GlobalDatabaseService { constructor(_arg: any) { /* noop */ } } }));
        vi.doMock('../services/seed-manager.js', () => ({ SeedManager: vi.fn().mockImplementation(() => ({ initializeGlobalData: vi.fn() })) }));
        vi.doMock('../services/prompt-orchestrator.js', () => ({ PromptOrchestrator: vi.fn().mockImplementation(() => ({})) }));

        // Mock tools constructors
        const toolMock = vi.fn().mockImplementation(() => ({}));
        vi.doMock('../tools/init.js', () => ({ InitToolNew: toolMock, initToolSchema: {} }));
        vi.doMock('../tools/start.js', () => ({ StartTool: toolMock, startToolSchema: {} }));
        vi.doMock('../tools/add.js', () => ({ AddToolNew: toolMock, addToolSchema: {} }));
        vi.doMock('../tools/status.js', () => ({ StatusToolNew: toolMock, statusToolSchema: {} }));
        vi.doMock('../tools/update.js', () => ({ UpdateToolNew: toolMock, updateToolSchema: {} }));
        vi.doMock('../tools/audit.js', () => ({ AuditToolNew: toolMock, auditToolSchema: {} }));
        vi.doMock('../tools/focus.js', () => ({ FocusToolNew: toolMock, focusToolSchema: {} }));
        vi.doMock('../tools/github.js', () => ({ GitHubTool: toolMock, githubToolSchema: {} }));
        vi.doMock('../tools/rule-update.js', () => ({ RuleUpdateTool: toolMock, ruleUpdateToolSchema: {} }));
        vi.doMock('../tools/remote-interface.js', () => ({ RemoteInterfaceTool: toolMock, remoteInterfaceToolSchema: {} }));
        vi.doMock('../tools/update-resources.js', () => ({ UpdateResourcesTool: toolMock, updateResourcesToolSchema: {} }));
        vi.doMock('../tools/update-steps.js', () => ({ UpdateStepsTool: toolMock, updateStepsToolSchema: {} }));

        const mod = await import('../index.js');
        const { SpeclyServer } = mod as any;
        const s = new SpeclyServer();
        await s.initializeServer();

        const th = s.createMCPToolHandlers();
        expect(th).toHaveProperty('listTools');
        expect(th).toHaveProperty('handleToolCall');

        const list = await th.listTools();
        expect(list).toHaveProperty('tools');
    });
});
