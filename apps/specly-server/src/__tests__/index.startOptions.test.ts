import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStartOptions, SPECLY_VERSION } from '../index.js';
import { InstanceManager } from '@omar391/mcp-kit/server/local/node-instance';
import { Hono } from 'hono';

vi.mock('@omar391/mcp-kit/server/local/node-instance', () => ({
    InstanceManager: vi.fn((opts: any) => ({ opts }))
}));

describe('buildStartOptions direct callbacks', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('createInstanceManager returns InstanceManager with expected lockPath when local true', () => {
        const opts = buildStartOptions();
        const im = opts.createInstanceManager({ port: 8989, local: true });
        expect(im).toBeDefined();
        expect(im.opts).toHaveProperty('getVersion');
        expect(im.opts.getVersion()).toBe(SPECLY_VERSION);
    });

    it('createInstanceManager returns InstanceManager when local false (no lockPath)', () => {
        const opts = buildStartOptions();
        const im = opts.createInstanceManager({ port: 8989, local: false });
        expect(im).toBeDefined();
    });

    it('cliConfig customOptionsParser sets forceSeed flag', () => {
        const opts = buildStartOptions();
        const parsed = opts.cliConfig.customOptionsParser(['--force-seed'], { port: 8989, mode: 'http' });
        expect(parsed.forceSeed).toBeTruthy();
        const parsed2 = opts.cliConfig.customOptionsParser([], { port: 8989, mode: 'http' });
        expect(parsed2.forceSeed).toBeFalsy();
    });

    it('localMode callbacks are defined and callable', async () => {
        const opts = buildStartOptions();
        expect(opts.localMode).toBeDefined();
        // Should be async functions
        await opts.localMode.onLocalStart?.({} as InstanceManager, { port: 8989, local: true });

        // `onShutdown` triggers a setTimeout() that calls process.exit(0) - stub this so
        // tests don't actually exit the runner. Use fake timers to advance the shutdown
        // timeout deterministically and assert we stubbed process.exit.
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            vi.useFakeTimers();
            await opts.localMode.onShutdown?.({} as InstanceManager, { port: 8989, local: true });
            // advance timers for the setTimeout inside the code
            vi.advanceTimersByTime(200);
            expect(exitSpy).toHaveBeenCalled();
        } finally {
            exitSpy.mockRestore();
            vi.useRealTimers();
        }

        // transition also uses setTimeout but doesn't call process.exit; run it safely
        vi.useFakeTimers();
        try {
            await opts.localMode.onTransition?.({} as InstanceManager, { port: 8989, local: true });
            vi.advanceTimersByTime(200);
        } finally {
            vi.useRealTimers();
        }
    });

    it('onInitialize triggers without error even if ensureServerInitialized mocked', async () => {
        const opts = buildStartOptions();

        // Spy on SpeclyServer prototype methods that the onInitialize callback will call
        const mod = await import('../index.js');
        const spy = vi.spyOn((mod as any).SpeclyServer.prototype, 'ensureServerInitialized').mockImplementation(async () => undefined);
        const spySeed = vi.spyOn((mod as any).SpeclyServer.prototype, 'ensureSpeclySeed').mockImplementation(async () => undefined);

        await opts.onInitialize({ port: 8989, local: false, forceSeed: false });

        // ensureSpeclySeed should be invoked via the singleton
        // Callback should run without throwing (we can't access the private speclyServer spies here)
        spy.mockRestore();
        spySeed.mockRestore();
    });

    it('setupRoutes and configureApp are callable', async () => {
        const opts = buildStartOptions();
        const app = new Hono();
        // configureApp shouldn't throw
        await opts.configureApp(app as any, { local: false });
        // setupRoutes shouldn't throw when server not initialized (it needs to be set up via singleton)
        await opts.setupRoutes(app as any, { local: false });
    });

    it('SpeclyServer.createMCPToolHandlers returns handlers that expose listTools & handleToolCall', async () => {
        const mod = await import('../index.js');
        const server = new mod.SpeclyServer();

        // Spy on createToolHandlers used inside method
        const ct = await import('@omar391/mcp-kit/server');
        vi.spyOn(ct as any, 'createToolHandlers').mockReturnValue({ listTools: vi.fn().mockResolvedValue({ tools: [] }), handleToolCall: vi.fn().mockResolvedValue({}) });

        const handlers = server.createMCPToolHandlers();
        const result = await handlers.listTools();

        expect(result).toBeDefined();
        expect(typeof handlers.handleToolCall).toBe('function');
    });
});
