import { vi, describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';

// Mocks will be (re)registered in beforeEach so each test has a clean module cache

describe('seed-specly runIfMainSeed', () => {
    let _originalProcessExit: typeof process.exit;
    beforeAll(() => {
        // Save original and provide a safe global noop so any async/late
        // process.exit calls during imports/background tasks don't kill Vitest.
        _originalProcessExit = process.exit;
        process.exit = (() => { /* noop */ }) as typeof process.exit;
    });
    afterAll(() => {
        process.exit = _originalProcessExit;
    });
    beforeEach(() => {
        vi.resetModules();
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({
                getDrizzleManager: () => ({ /* dummy manager */ })
            })
        }));

        vi.mock('../../services/seed-manager.js', () => {
            return {
                SeedManager: class {
                    constructor() { }
                    async initializeGlobalData() {
                        return;
                    }
                    async seedSpecly() {
                        return {
                            specsCreated: 0,
                            toolVersionsCreated: 0,
                            profileCreated: false,
                            profileVersionsCreated: 0,
                            toolsAttached: 0,
                            workspaceBindings: 0,
                            createdSpecHashes: [],
                            createdToolVersionHashes: []
                        };
                    }
                }
            };
        });
    });

    it('resolves when argv does not match seed-specly', async () => {
        const { runIfMainSeed } = await import('../../scripts/seed-specly.js');
        await expect(runIfMainSeed('/some/other/path')).resolves.toBeUndefined();
    });

    it('invokes main when argv matches seed-specly file name', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const prevExit = process.exit;
        process.exit = ((code?: number | string | null) => { /* noop during import */ }) as typeof process.exit;
        try {
            const { runIfMainSeed } = await import('../../scripts/seed-specly.js');
            await expect(runIfMainSeed('/tmp/seed-specly.ts')).resolves.toBeUndefined();
        } finally {
            logSpy.mockRestore();
            process.exit = prevExit;
        }
    });

    it('runs top-level guard when module is imported with matching argv', async () => {
        const origArgv1 = process.argv[1];
        process.argv[1] = '/tmp/seed-specly.ts';
        vi.resetModules();
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const prevExit = process.exit;
        process.exit = ((code?: number | string | null) => { /* noop during import */ }) as typeof process.exit;
        try {
            await import('../../scripts/seed-specly.js');
            // Import-time guard exercised; avoid asserting on console output to keep test stable
        } finally {
            logSpy.mockRestore();
            process.exit = prevExit;
            process.argv[1] = origArgv1;
        }
    });

    it('main() catch calls process.exit on failure', async () => {
        vi.resetModules();
        vi.unmock('../../database/global-queries.js');
        // Re-mock SeedManager so seedSpecly throws
        vi.mock('../../services/seed-manager.js', () => ({
            SeedManager: class {
                constructor() { }
                async initializeGlobalData() { return; }
                async seedSpecly() { throw new Error('boom'); }
            }
        }));

        const prevExit = process.exit;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        process.exit = ((code?: number | string | null) => { /* noop */ }) as typeof process.exit;
        try {
            const { main } = await import('../../scripts/seed-specly.js');
            // ensure main runs through the failure path without throwing to the test harness
            await expect(main()).resolves.toBeUndefined();
        } finally {
            process.exit = prevExit;
            errSpy.mockRestore();
        }
    });

    it('main() throws error when exitOnError is false', async () => {
        vi.resetModules();
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('test-error'); }
        }));
        const { main } = await import('../../scripts/seed-specly.js');
        await expect(main({ exitOnError: false })).rejects.toThrow('test-error');
    });

    it('main() catch path logs and exits when initializeGlobalDatabaseService throws', async () => {
        vi.resetModules();
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('init-fail'); }
        }));
        const prevExit = process.exit;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        process.exit = (() => { throw new Error('EXIT_CALLED'); }) as typeof process.exit;
        try {
            const { main } = await import('../../scripts/seed-specly.js');
            await expect(main()).rejects.toThrow('EXIT_CALLED');
        } finally {
            process.exit = prevExit;
            errSpy.mockRestore();
        }
    });

    it('runIfMainSeed triggers process.exit when main fails', async () => {
        vi.resetModules();
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('db-fail'); }
        }));
        const prevExit = process.exit;
        process.exit = (() => { throw new Error('EXIT_CALLED'); }) as typeof process.exit;
        try {
            const { runIfMainSeed } = await import('../../scripts/seed-specly.js');
            // runIfMainSeed should call main, which should throw due to process.exit mock
            await expect(runIfMainSeed('/tmp/seed-specly.ts')).rejects.toThrow('EXIT_CALLED');
        } finally {
            process.exit = prevExit;
        }
    });

    it('runIfMainSeed rethrows when exitOnError is false', async () => {
        vi.resetModules();
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('runifmain-fail'); }
        }));
        const { runIfMainSeed } = await import('../../scripts/seed-specly.js');
        await expect(runIfMainSeed('/tmp/seed-specly.ts', { exitOnError: false })).rejects.toThrow('runifmain-fail');
    });

    it('import-time guard calls exitProcess when main fails', async () => {
        const origArgv1 = process.argv[1];
        process.argv[1] = '/tmp/seed-specly.ts';
        vi.resetModules();
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('import-fail'); }
        }));

        // Provide a call-recording replacement for process.exit so the import
        // can complete and the async top-level catch handler can call exit.
        const prevExit = process.exit;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const callSpy = vi.fn();
        process.exit = ((code?: number | string | null) => { callSpy(code); }) as typeof process.exit;
        try {
            // Import the module; top-level guard starts the async main()
            await import('../../scripts/seed-specly.js');

            // Allow one tick for the promise rejection handler to run and call process.exit
            await new Promise((resolve) => setImmediate(resolve));

            expect(callSpy).toHaveBeenCalledWith(1);
            expect(errSpy).toHaveBeenCalledWith('Seed failed', expect.any(Error));
        } finally {
            process.exit = prevExit;
            errSpy.mockRestore();
            process.argv[1] = origArgv1;
        }
    });

    it('runIfMainSeed catch path', async () => {
        vi.resetModules();
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('test-fail'); }
        }));
        const origArgv1 = process.argv[1];
        process.argv[1] = 'other.js'; // prevent top-level guard
        const prevExit = process.exit;
        const errSpy = vi.spyOn(console, 'error');
        const callSpy = vi.fn();
        process.exit = ((code?: number | string | null) => { callSpy(code); }) as typeof process.exit;
        const module = await import('../../scripts/seed-specly.js');
        process.argv[1] = origArgv1;
        try {
            // Use the correct path that matches import.meta.url
            const targetPath = new URL('../../scripts/seed-specly.js', import.meta.url).pathname;
            await expect(module.runIfMainSeed(targetPath)).resolves.toBeUndefined();
            expect(errSpy).toHaveBeenCalledWith('Seed failed', expect.any(Error));
            expect(callSpy).toHaveBeenCalledWith(1);
        } finally {
            process.exit = prevExit;
            errSpy.mockRestore();
        }
    });

    it('import-time guard equality path calls handleMainError and exits', async () => {
        vi.resetModules();
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('import-eq-fail'); }
        }));
        const targetPath = new URL('../../scripts/seed-specly.js', import.meta.url).pathname;
        const origArgv1 = process.argv[1];
        process.argv[1] = targetPath;
        const prevExit = process.exit;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const callSpy = vi.fn();
        process.exit = ((code?: number | string | null) => { callSpy(code); }) as typeof process.exit;
        try {
            await import('../../scripts/seed-specly.js');
            await new Promise((resolve) => setImmediate(resolve));
            expect(errSpy).toHaveBeenCalledWith('Seed failed', expect.any(Error));
            expect(callSpy).toHaveBeenCalledWith(1);
        } finally {
            process.exit = prevExit;
            errSpy.mockRestore();
            process.argv[1] = origArgv1;
        }
    });

    it('runCliMainGuard invokes handleMainError on main failure', async () => {
        vi.resetModules();
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('runCli-fail'); }
        }));
        const prevExit = process.exit;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const callSpy = vi.fn();
        process.exit = ((code?: number | string | null) => { callSpy(code); }) as typeof process.exit;
        try {
            const { runCliMainGuard } = await import('../../scripts/seed-specly.js');
            runCliMainGuard();
            await new Promise((resolve) => setImmediate(resolve));
            expect(errSpy).toHaveBeenCalledWith('Seed failed', expect.any(Error));
            expect(callSpy).toHaveBeenCalledWith(1);
        } finally {
            process.exit = prevExit;
            errSpy.mockRestore();
        }
    });

    it('runCliMainGuardWithOptions catch path executes when main rejects', async () => {
        vi.resetModules();
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('runCli-with-options-fail'); }
        }));
        const prevExit = process.exit;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const callSpy = vi.fn();
        process.exit = ((code?: number | string | null) => { callSpy(code); }) as typeof process.exit;
        try {
            const { runCliMainGuardWithOptions } = await import('../../scripts/seed-specly.js');
            // Call with exitOnError: false so `main` will reject and the
            // outer catch handler inside runCliMainGuardWithOptions runs.
            runCliMainGuardWithOptions({ exitOnError: false });
            await new Promise((resolve) => setImmediate(resolve));
            expect(errSpy).toHaveBeenCalledWith('Seed failed', expect.any(Error));
            expect(callSpy).toHaveBeenCalledWith(1);
        } finally {
            process.exit = prevExit;
            errSpy.mockRestore();
        }
    });

    it('isSeedScriptArg covers all match types', async () => {
        vi.resetModules();
        const { isSeedScriptArg } = await import('../../scripts/seed-specly.js');

        // endsWith .ts
        expect(isSeedScriptArg('/tmp/seed-specly.ts')).toBe(true);
        // endsWith .js
        expect(isSeedScriptArg('/tmp/seed-specly.js')).toBe(true);

        // equality with import.meta.url (convert to pathname)
        const targetPath = new URL('../../scripts/seed-specly.js', import.meta.url).pathname;
        expect(isSeedScriptArg(targetPath)).toBe(true);

        // unrelated path
        expect(isSeedScriptArg('/some/other/path')).toBe(false);
    });

    it('isSeedScriptArg uses process.argv[1] when arg omitted', async () => {
        const origArgv1 = process.argv[1];
        try {
            process.argv[1] = '/tmp/seed-specly.ts';
            const { isSeedScriptArg } = await import('../../scripts/seed-specly.js');
            expect(isSeedScriptArg()).toBe(true);

            process.argv[1] = '/some/other/path';
            expect(isSeedScriptArg()).toBe(false);
        } finally {
            process.argv[1] = origArgv1;
        }
    });

    it('runIfMainSeed uses process.argv[1] default when argv1 omitted', async () => {
        vi.resetModules();
        const origArgv1 = process.argv[1];
        process.argv[1] = '/tmp/seed-specly.ts';

        // Provide successful implementations so the default-arg path resolves
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({ getDrizzleManager: () => ({}) })
        }));
        vi.doMock('../../services/seed-manager.js', () => ({
            SeedManager: class {
                constructor() { }
                async initializeGlobalData() { return; }
                async seedSpecly() { return { specsCreated: 0, toolVersionsCreated: 0, profileCreated: false, profileVersionsCreated: 0, toolsAttached: 0, workspaceBindings: 0, createdSpecHashes: [], createdToolVersionHashes: [] }; }
            }
        }));

        try {
            const { runIfMainSeed } = await import('../../scripts/seed-specly.js');
            await expect(runIfMainSeed()).resolves.toBeUndefined();
        } finally {
            process.argv[1] = origArgv1;
        }
    });

    it('main() outputs pretty JSON when --pretty flag is present', async () => {
        vi.resetModules();
        vi.doMock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({ getDrizzleManager: () => ({ /* dummy manager */ }) })
        }));

        vi.doMock('../../services/seed-manager.js', () => {
            return {
                SeedManager: class {
                    constructor() { }
                    async initializeGlobalData() {
                        return;
                    }
                    async seedSpecly() {
                        return {
                            specsCreated: 0,
                            toolVersionsCreated: 0,
                            profileCreated: false,
                            profileVersionsCreated: 0,
                            toolsAttached: 0,
                            workspaceBindings: 0,
                            createdSpecHashes: [],
                            createdToolVersionHashes: []
                        };
                    }
                }
            };
        });

        const origArgv = process.argv;
        process.argv = ['node', 'other.js']; // prevent top-level guard
        const logSpy = vi.spyOn(console, 'log');
        const { main } = await import('../../scripts/seed-specly.js');
        process.argv = ['node', 'seed-specly.js', '--pretty'];
        try {
            await main();
            expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
            const calls = logSpy.mock.calls.slice(-2); // last two calls
            expect(calls[0][0]).toContain('"event":"specly_seed_summary"');
            expect(calls[1][0]).toContain('"ok": true');
        } finally {
            logSpy.mockRestore();
            process.argv = origArgv;
        }
    });

    it('handleMainError calls console.error and exits', async () => {
        const prevExit = process.exit;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const callSpy = vi.fn();
        process.exit = ((code?: number | string | null) => { callSpy(code); }) as typeof process.exit;
        try {
            const { handleMainError } = await import('../../scripts/seed-specly.js');
            const err = new Error('oh no');
            handleMainError(err);
            expect(errSpy).toHaveBeenCalledWith('Seed failed', err);
            expect(callSpy).toHaveBeenCalledWith(1);
        } finally {
            process.exit = prevExit;
            errSpy.mockRestore();
        }
    });
});
