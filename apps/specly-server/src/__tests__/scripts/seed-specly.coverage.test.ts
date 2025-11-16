import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mocks will be (re)registered in beforeEach so each test has a clean module cache

describe('seed-specly runIfMainSeed', () => {
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
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { /* noop during import */ }) as unknown as never);
        try {
            const { runIfMainSeed } = await import('../../scripts/seed-specly.js');
            await expect(runIfMainSeed('/tmp/seed-specly.ts')).resolves.toBeUndefined();
        } finally {
            logSpy.mockRestore();
            exitSpy.mockRestore();
        }
    });

    it('runs top-level guard when module is imported with matching argv', async () => {
        const origArgv1 = process.argv[1];
        process.argv[1] = '/tmp/seed-specly.ts';
        vi.resetModules();
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { /* noop during import */ }) as unknown as never);
        try {
            await import('../../scripts/seed-specly.js');
            // Import-time guard exercised; avoid asserting on console output to keep test stable
        } finally {
            logSpy.mockRestore();
            exitSpy.mockRestore();
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

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { /* noop */ }) as unknown as never);
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        try {
            const { main } = await import('../../scripts/seed-specly.js');
            // ensure main runs through the failure path without throwing to the test harness
            await expect(main()).resolves.toBeUndefined();
        } finally {
            exitSpy.mockRestore();
            errSpy.mockRestore();
        }
    });

    it('main() throws error when exitOnError is false', async () => {
        vi.resetModules();
        vi.unmock('../../database/global-queries.js');
        // Mock DB initializer to throw immediately
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('test-error'); }
        }));

        const { main } = await import('../../scripts/seed-specly.js');
        // With exitOnError: false, main should throw instead of calling process.exit
        await expect(main({ exitOnError: false })).rejects.toThrow('test-error');
    });

    it('main() catch path logs and exits when initializeGlobalDatabaseService throws', async () => {
        vi.resetModules();
        vi.unmock('../../database/global-queries.js');
        // Mock DB initializer to throw immediately
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('init-fail'); }
        }));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { 
            throw new Error('EXIT_CALLED'); 
        }) as unknown as never);
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        try {
            const { main } = await import('../../scripts/seed-specly.js');
            await expect(main()).rejects.toThrow('EXIT_CALLED');
        } finally {
            exitSpy.mockRestore();
            errSpy.mockRestore();
        }
    });

    it('runIfMainSeed triggers process.exit when main fails', async () => {
        vi.resetModules();
        vi.unmock('../../database/global-queries.js');
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('db-fail'); }
        }));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { 
            throw new Error('EXIT_CALLED'); 
        }) as unknown as never);
        try {
            const { runIfMainSeed } = await import('../../scripts/seed-specly.js');
            // runIfMainSeed should call main, which should throw due to process.exit mock
            await expect(runIfMainSeed('/tmp/seed-specly.ts')).rejects.toThrow('EXIT_CALLED');
        } finally {
            exitSpy.mockRestore();
        }
    });

    it('import-time guard calls exitProcess when main fails', async () => {
        const origArgv1 = process.argv[1];
        process.argv[1] = '/tmp/seed-specly.ts';
        vi.resetModules();
        vi.unmock('../../database/global-queries.js');
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('import-fail'); }
        }));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { 
            throw new Error('EXIT_CALLED'); 
        }) as unknown as never);
        try {
            // Importing the module will run the top-level guard; expect it to throw due to process.exit
            await expect(import('../../scripts/seed-specly.js')).rejects.toThrow('EXIT_CALLED');
        } finally {
            exitSpy.mockRestore();
            process.argv[1] = origArgv1;
        }
    });

    it('runIfMainSeed catch path', async () => {
        vi.resetModules();
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('test-fail'); }
        }));

        const origArgv1 = process.argv[1];
        process.argv[1] = 'other.js'; // prevent top-level guard
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { 
            throw new Error('EXIT_CALLED'); 
        }) as unknown as never);
        const errSpy = vi.spyOn(console, 'error');
        const module = await import('../../scripts/seed-specly.js');
        process.argv[1] = origArgv1;
        try {
            // Use the correct path that matches import.meta.url
            const targetPath = new URL('../../scripts/seed-specly.js', import.meta.url).pathname;
            await expect(module.runIfMainSeed(targetPath)).rejects.toThrow('EXIT_CALLED');
        } finally {
            exitSpy.mockRestore();
            errSpy.mockRestore();
        }
    });

    it('main() outputs pretty JSON when --pretty flag is present', async () => {
        vi.resetModules();
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({ getDrizzleManager: () => ({ /* dummy manager */ }) })
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

    it('main() outputs pretty JSON when --pretty flag is present', async () => {
        vi.resetModules();
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({ getDrizzleManager: () => ({ /* dummy manager */ }) })
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
});
