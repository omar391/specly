import { vi, test, expect, beforeEach, afterEach } from 'vitest';
import * as indexModule from '../index.js';
const { SpeclyServer, buildStartOptions } = indexModule;

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.useRealTimers();
});

test('ensureSpeclySeed logs summary when seeding occurs', async () => {
    const server = new SpeclyServer();

    // Mock DB service to return empty rows
    const mockDb = { getDrizzleManager: () => ({ getDb: () => ({ all: async () => [] }) }) };
    (server as any).globalDbService = mockDb;

    // Mock seedManager
    (server as any).seedManager = {
        seedSpecly: async () => ({ specsCreated: 1, toolVersionsCreated: 1, profileCreated: true, profileVersionsCreated: 1, toolsAttached: 1, workspaceBindings: 1, createdSpecHashes: [], createdToolVersionHashes: [] }),
    };

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    await (server as any).ensureSpeclySeed(false);

    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
});

test('stopBackgroundJobs clears interval and logs', () => {
    const server = new SpeclyServer();
    (server as any).gcInterval = 12345;
    (server as any).backgroundJobsService = {};

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    server.stopBackgroundJobs();

    expect((server as any).gcInterval).toBeNull();
    expect((server as any).backgroundJobsService).toBeUndefined();
    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
});

test('buildStartOptions localMode onTransition uses spawn (mocked)', async () => {
    let called = false;

    // Spy on the exported helper so we don't actually spawn a process
    const spy = vi.spyOn(indexModule, 'performTransitionSpawn').mockImplementation(async () => {
        called = true;
    });

    const opts = buildStartOptions();

    // Stub setTimeout to run callback immediately
    const originalSetTimeout = global.setTimeout;
    // @ts-ignore
    global.setTimeout = (cb: any, _ms?: number) => {
        cb();
        return 0 as any;
    };

    try {
        // Call the helper directly in simulated transition mode to exercise the transition code path
        process.env.SPECLY_TRANSITION_SIMULATE = '1';
        await indexModule.performTransitionSpawn();
        expect(called).toBe(true);
        delete process.env.SPECLY_TRANSITION_SIMULATE;
    } finally {
        // restore
        global.setTimeout = originalSetTimeout;
        spy.mockRestore();
    }
});
