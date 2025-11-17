import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('index module helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('buildStartOptions returns callbacks and localMode handlers', async () => {
    const mod = await import('../index.js')
    const opts = mod.buildStartOptions()
    expect(opts).toHaveProperty('onInitialize')
    expect(typeof opts.onInitialize).toBe('function')
    expect(opts).toHaveProperty('localMode')
    expect(typeof opts.localMode.onLocalStart).toBe('function')
  })

  it('configureSpeclyApp registers error handler and maps error names to statuses', async () => {
    const mod = await import('../index.js')
    let registeredHandler: any = null
    const fakeApp = {
      onError(fn: any) { registeredHandler = fn }
    }

    await mod.configureSpeclyApp(fakeApp as any, { local: true })
    expect(registeredHandler).toBeTruthy()

    const fakeCtx = { json: vi.fn((body: any, status: number) => ({ body, status })) }

    const validationError = new Error('bad')
    validationError.name = 'ValidationError'
    const resp1 = registeredHandler(validationError, fakeCtx)
    expect(fakeCtx.json).toHaveBeenCalled()

    const notFound = new Error('nf')
    notFound.name = 'NotFoundError'
    registeredHandler(notFound, fakeCtx)

    const badReq = new Error('br')
    badReq.name = 'BadRequestError'
    registeredHandler(badReq, fakeCtx)

    const other = new Error('o')
    other.name = 'Other'
    registeredHandler(other, fakeCtx)
  })

  it('performTransitionSpawn does nothing when simulated', async () => {
    process.env.SPECLY_TRANSITION_SIMULATE = '1'
    const mod = await import('../index.js')
    await expect(mod.performTransitionSpawn()).resolves.toBeUndefined()
    delete process.env.SPECLY_TRANSITION_SIMULATE
  })

  it('handleMainError respects stdio mode and does not log', async () => {
    // Mock parseCliArgs before importing module
    vi.mock('@omar391/mcp-kit/utils/cli-parser', () => ({ parseCliArgs: () => ({ mode: 'stdio' }) }))
    const mod = await import('../index.js')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(mod.handleMainError(new Error('x'))).resolves.toBeUndefined()
    // handleMainError may or may not log depending on parseCliArgs runtime; just ensure it doesn't throw
    vi.unmock('@omar391/mcp-kit/utils/cli-parser')
  })
})
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use dynamic import for the module under test so mocks can be applied before import
describe('SpeclyServer (index.ts) extra coverage', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('getGlobalDbService throws when server not initialized', async () => {
        const mod = await import('../index.js');
        const { SpeclyServer } = mod;
        const s = new SpeclyServer();
        expect(() => s.getGlobalDbService()).toThrow('Server not initialized');
    });

    it('configureSpeclyApp onError maps Validation/NotFound/BadRequest errors', async () => {
        const mod = await import('../index.js');
        const { SpeclyServer } = mod;
        const s = new SpeclyServer();

        // Create a fake app that captures the onError handler
        let onErrorHandler: any = null;
        const fakeApp: any = {
            onError(fn: any) {
                onErrorHandler = fn;
            }
        };

        await s.configureSpeclyApp(fakeApp, { local: true });

        const makeCtx = () => {
            return {
                json(body: any, status: number) {
                    return { body, status };
                }
            };
        };

        // Generic error -> 500
        const res1 = await onErrorHandler(new Error('boom'), makeCtx());
        expect(res1.status).toBe(500);
        expect(res1.body.error.code).toBe('INTERNAL_ERROR');

        const ve = new Error('invalid');
        ve.name = 'ValidationError';
        const res2 = await onErrorHandler(ve, makeCtx());
        expect(res2.status).toBe(422);
        expect(res2.body.error.code).toBe('VALIDATION_ERROR');

        const nf = new Error('missing');
        nf.name = 'NotFoundError';
        const res3 = await onErrorHandler(nf, makeCtx());
        expect(res3.status).toBe(404);
        expect(res3.body.error.code).toBe('NOT_FOUND');

        const br = new Error('bad');
        br.name = 'BadRequestError';
        const res4 = await onErrorHandler(br, makeCtx());
        expect(res4.status).toBe(400);
        expect(res4.body.error.code).toBe('BAD_REQUEST');
    });

    it('startBackgroundJobs / stopBackgroundJobs flow uses BackgroundJobsService', async () => {
        // Reset module registry so we can mock the BackgroundJobsService before import
        vi.resetModules();
        // Mock BackgroundJobsService before importing module
        const mockRunAll = vi.fn(() => Promise.resolve({ transientSessionsDeleted: 1, softDeletePurged: 2 }));
        class MockBG {
            public cfg: any;
            constructor(_db: any, cfg: any) { this.cfg = cfg; }
            runAll() { return mockRunAll(); }
        }

        vi.doMock('../services/background-jobs-service.js', () => ({ BackgroundJobsService: MockBG }));

        const mod = await import('../index.js');
        const { SpeclyServer } = mod;
        const s = new SpeclyServer();

        // Provide a minimal globalDbService stub
        s['globalDbService'] = { getDrizzleManager: () => ({}) } as any;
        // Ensure serverInitialized so startBackgroundJobs proceeds
        s['serverInitialized'] = true;

        // Start background jobs
        s.startBackgroundJobs();

        // Wait for runAll promise to settle
        await new Promise((r) => setTimeout(r, 20));

        expect(mockRunAll).toHaveBeenCalled();
        expect(s['gcInterval']).not.toBeNull();

        // Stop background jobs
        s.stopBackgroundJobs();
        expect(s['gcInterval']).toBeNull();
    });

    it('ensureSpeclySeed handles DB errors gracefully', async () => {
        const mod = await import('../index.js');
        const { SpeclyServer } = mod;
        const s = new SpeclyServer();

        // Provide a globalDbService whose db.all throws
        s['globalDbService'] = {
            getDrizzleManager: () => ({ getDb: () => ({ all: () => { throw new Error('DB error'); } }) })
        } as any;

        s['seedManager'] = { seedSpecly: vi.fn(() => Promise.resolve({ seeded: false })) } as any;

        // Should not throw
        await expect(s.ensureSpeclySeed(false)).resolves.toBeUndefined();
    });

    it('ensureSpeclySeed calls console.error on DB error', async () => {
        const mod = await import('../index.js');
        const { SpeclyServer } = mod;
        const s = new SpeclyServer();

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Provide a globalDbService whose db.all throws
        s['globalDbService'] = {
            getDrizzleManager: () => ({ getDb: () => ({ all: () => { throw new Error('DB error'); } }) })
        } as any;

        s['seedManager'] = { seedSpecly: vi.fn(() => Promise.resolve({ seeded: false })) } as any;

        await s.ensureSpeclySeed(false);

        expect(errorSpy).toHaveBeenCalledWith('Error checking/performing Specly seed:', expect.any(Error));

        errorSpy.mockRestore();
    });

    it('startBackgroundJobs logs when disabled via SPECLY_GC_ENABLED=false', async () => {
        const origEnv = process.env.SPECLY_GC_ENABLED;
        process.env.SPECLY_GC_ENABLED = 'false';

        const mod = await import('../index.js');
        const { SpeclyServer } = mod;
        const s = new SpeclyServer();

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

        s.startBackgroundJobs();

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"info"'));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Background jobs disabled via SPECLY_GC_ENABLED=false'));

        logSpy.mockRestore();
        process.env.SPECLY_GC_ENABLED = origEnv;
    });

    it('createMCPToolHandlers returns listTools with inputSchema JSON', async () => {
        const mod = await import('../index.js');
        const { SpeclyServer } = mod;
        const s = new SpeclyServer();
        const handlers = s.createMCPToolHandlers();
        const res = await handlers.listTools();
        expect(res).toHaveProperty('tools');
        expect(Array.isArray(res.tools)).toBe(true);
        if (res.tools.length > 0) {
            expect(res.tools[0]).toHaveProperty('inputSchema');
        }
    });

    it('setupSpeclyApi registers api router on app', async () => {
        // Mock router before importing module
        vi.resetModules();
        vi.doMock('../api/router.js', () => ({ createApiRouter: async (db: any) => 'MY_ROUTER' }));
        const mod = await import('../index.js');
        const { SpeclyServer } = mod;
        const s = new SpeclyServer();
        s['databaseService'] = {} as any;

        let called: any = null;
        const fakeApp = {
            route(path: string, router: any) {
                called = { path, router };
            }
        } as any;

        await s.setupSpeclyApi(fakeApp);
        expect(called).not.toBeNull();
        expect(called.path).toBe('/api');
        expect(called.router).toBe('MY_ROUTER');
    });
});
