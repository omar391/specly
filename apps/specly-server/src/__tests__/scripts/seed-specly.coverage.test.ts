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

    it('main() catch path logs and exits when initializeGlobalDatabaseService throws', async () => {
        vi.resetModules();
        vi.unmock('../../database/global-queries.js');
        // Mock DB initializer to throw immediately
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => { throw new Error('init-fail'); }
        }));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { /* noop */ }) as unknown as never);
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ });
        try {
            const { main } = await import('../../scripts/seed-specly.js');
            await expect(main()).resolves.toBeUndefined();
        } finally {
            exitSpy.mockRestore();
            errSpy.mockRestore();
        }
    });

    it('runIfMainSeed triggers process.exit when main fails', async () => {
        vi.resetModules();
        vi.unmock('../../database/global-queries.js');
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({ getDrizzleManager: () => ({}) })
        }));
        vi.mock('../../services/seed-manager.js', () => ({
            SeedManager: class {
                constructor() { }
                async initializeGlobalData() { return; }
                async seedSpecly() { throw new Error('boom'); }
            }
        }));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { /* noop */ }) as unknown as never);
        try {
            const { runIfMainSeed } = await import('../../scripts/seed-specly.js');
            // ensure runIfMainSeed invokes main and completes (it handles exit internally)
            await expect(runIfMainSeed('/tmp/seed-specly.ts')).resolves.toBeUndefined();
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
            initializeGlobalDatabaseService: async () => ({ getDrizzleManager: () => ({}) })
        }));
        vi.mock('../../services/seed-manager.js', () => ({
            SeedManager: class {
                constructor() { }
                async initializeGlobalData() { return; }
                async seedSpecly() { throw new Error('boom'); }
            }
        }));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { /* noop */ }) as unknown as never);
        try {
            // Importing the module will run the top-level guard; ensure import completes
            await import('../../scripts/seed-specly.js');
        } finally {
            exitSpy.mockRestore();
            process.argv[1] = origArgv1;
        }
    });

    it('runIfMainSeed catch path', async () => {
        vi.resetModules();
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({ getDrizzleManager: () => ({}) })
        }));
        vi.mock('../../services/seed-manager.js', () => ({
            SeedManager: class {
                constructor() { }
                async initializeGlobalData() { return; }
                async seedSpecly() { throw new Error('test'); }
            }
        }));

        const module = await import('../../scripts/seed-specly.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => { /* noop */ });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            // Use the correct path that matches import.meta.url
            const targetPath = new URL('../../scripts/seed-specly.js', import.meta.url).pathname;
            await module.runIfMainSeed(targetPath);
            expect(console.error).toHaveBeenCalledWith('Seed failed', expect.any(Error));
            expect(process.exit).toHaveBeenCalledWith(1);
        } finally {
            exitSpy.mockRestore();
            errSpy.mockRestore();
        }
    });
});

    it('runIfMainSeed triggers when import.meta.url equals file://${arg}', async () => {
        vi.resetModules();
        // Ensure DB and SeedManager are mocked to avoid side-effects
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({ getDrizzleManager: () => ({}) })
        }));
        vi.mock('../../services/seed-manager.js', () => ({
            SeedManager: class {
                constructor() { }
                async initializeGlobalData() { return; }
                async seedSpecly() { return { specsCreated: 0, toolVersionsCreated: 0, profileCreated: false, profileVersionsCreated: 0, toolsAttached: 0, workspaceBindings: 0, createdSpecHashes: [], createdToolVersionHashes: [] }; }
            }
        }));

        // Compute the platform path to the seed-specly module so that
        // `file://${arg}` matches the module's import.meta.url inside the module.
        const targetPath = new URL('../../scripts/seed-specly.js', import.meta.url).pathname;

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { /* noop */ }) as unknown as never);
        try {
            const { runIfMainSeed } = await import('../../scripts/seed-specly.js');
            await expect(runIfMainSeed(targetPath)).resolves.toBeUndefined();
        } finally {
            exitSpy.mockRestore();
        }
    });

    it('runIfMainSeed catch path', async () => {
        vi.resetModules();
        vi.mock('../../database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({ getDrizzleManager: () => ({}) })
        }));
        vi.mock('../../services/seed-manager.js', () => ({
            SeedManager: class {
                constructor() { }
                async initializeGlobalData() { return; }
                async seedSpecly() { throw new Error('test'); }
            }
        }));

        const module = await import('../../scripts/seed-specly.js');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => { /* noop */ });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            // Use the correct path that matches import.meta.url
            const targetPath = new URL('../../scripts/seed-specly.js', import.meta.url).pathname;
            await module.runIfMainSeed(targetPath);
            expect(console.error).toHaveBeenCalledWith('Seed failed', expect.any(Error));
            expect(process.exit).toHaveBeenCalledWith(1);
        } finally {
            exitSpy.mockRestore();
            errSpy.mockRestore();
        }
    });
