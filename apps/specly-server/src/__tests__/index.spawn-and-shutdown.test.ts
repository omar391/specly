import { vi, test, expect } from 'vitest';

// Mock child_process.spawn so performTransitionSpawn can exercise the spawn branch.
// Justification: we must avoid launching real child processes in tests; mocking spawn
// lets us assert the code path executes while keeping tests hermetic.
vi.mock('child_process', () => {
    const spawn = vi.fn(() => ({ unref: vi.fn() }));
    return { spawn };
});

test('performTransitionSpawn calls spawn when not simulated', async () => {
    vi.resetModules();
    delete process.env.SPECLY_TRANSITION_SIMULATE;
    const mod = await import('../index.js');
    const child = await import('child_process') as any;
    await mod.performTransitionSpawn();
    expect(child.spawn).toHaveBeenCalled();
});

test('localMode.onShutdown triggers process.exit when environment allows it', async () => {
    vi.resetModules();
    const { buildStartOptions } = await import('../index.js');

    // Force non-test environment so the code path that calls process.exit is reachable.
    const origNodeEnv = process.env.NODE_ENV;
    const origVitest = process.env.VITEST;
    process.env.NODE_ENV = 'production';
    delete process.env.VITEST;

    // Stub setTimeout to run synchronously so we don't wait.
    const originalSetTimeout = global.setTimeout;
    // @ts-ignore
    global.setTimeout = (cb: any, _ms?: number) => { cb(); return 0 as any; };

    // Spy on process.exit and make it throw so the test can observe the call without exiting.
    // Justification: stubbing process.exit is necessary to verify CLI exit behavior without terminating the test runner.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error('EXIT_CALLED'); }) as any);

    const opts = buildStartOptions();

    try {
        await expect(opts.localMode.onShutdown({}, {})).rejects.toThrow('EXIT_CALLED');
        expect(exitSpy).toHaveBeenCalled();
    } finally {
        exitSpy.mockRestore();
        global.setTimeout = originalSetTimeout;
        process.env.NODE_ENV = origNodeEnv ?? '';
        if (origVitest !== undefined) process.env.VITEST = origVitest;
    }
});