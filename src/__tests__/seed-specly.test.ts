import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('seed-specly script', () => {
    const originalArgv = process.argv.slice();
    let logs: string[] = [];
    let errors: string[] = [];
    let exitSpy: any;

    beforeEach(() => {
        vi.resetModules();
        logs = [];
        errors = [];
        // capture console output
        vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
            logs.push(args.join(' '));
        });
        vi.spyOn(console, 'error').mockImplementation((...args: any[]) => {
            errors.push(args.join(' '));
        });
        // Prevent process.exit from terminating the test runner; allow assertions on calls
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: any) => {
            return undefined as any;
        }) as any);
    });

    afterEach(() => {
        process.argv = originalArgv.slice();
        vi.restoreAllMocks();
    });

    it('prints a one-line summary JSON on success', async () => {
        // Arrange: mock the database initializer and SeedManager class
        const fakeResult = {
            specsCreated: 1,
            toolVersionsCreated: 2,
            profileCreated: true,
            profileVersionsCreated: 1,
            toolsAttached: 3,
            workspaceBindings: 0,
            createdSpecHashes: ['a'],
            createdToolVersionHashes: ['b']
        };

        vi.doMock('/Volumes/Projects/business/AstronLab/omar391/mcp-servers/specly-mcp/src/database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({
                getDrizzleManager: () => ({ /* fake manager */ })
            })
        }));

        vi.doMock('/Volumes/Projects/business/AstronLab/omar391/mcp-servers/specly-mcp/src/services/seed-manager.js', () => ({
            SeedManager: class {
                constructor(_m: any) { }
                async initializeGlobalData() { return; }
                async seedSpecly() { return fakeResult; }
            }
        }));

        // Act: import the script and call main() explicitly (safer for tests)
        const mod = await import('../scripts/seed-specly.js');
        await mod.main();

        // Assert: the first console.log line is JSON with event and fields
        expect(logs.length).toBeGreaterThanOrEqual(1);
        const summary = JSON.parse(logs[0]);
        expect(summary.event).toBe('specly_seed_summary');
        expect(summary.specsCreated).toBe(1);
        expect(summary.createdSpecHashes).toEqual(['a']);
    });

    it('prints pretty JSON when --pretty is passed', async () => {
        // Arrange
        const fakeResult = {
            specsCreated: 0,
            toolVersionsCreated: 0,
            profileCreated: false,
            profileVersionsCreated: 0,
            toolsAttached: 0,
            workspaceBindings: 0,
            createdSpecHashes: [],
            createdToolVersionHashes: []
        };

        process.argv = [...originalArgv.slice(0, 2), '--pretty'];

        vi.doMock('/Volumes/Projects/business/AstronLab/omar391/mcp-servers/specly-mcp/src/database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({
                getDrizzleManager: () => ({})
            })
        }));
        vi.doMock('/Volumes/Projects/business/AstronLab/omar391/mcp-servers/specly-mcp/src/services/seed-manager.js', () => ({
            SeedManager: class {
                constructor(_m: any) { }
                async initializeGlobalData() { return; }
                async seedSpecly() { return fakeResult; }
            }
        }));

        // Act
        const mod = await import('../scripts/seed-specly.js');
        await mod.main();

        // Assert: there should be at least two logs (one-line JSON + pretty JSON)
        expect(logs.length).toBeGreaterThanOrEqual(2);
        const first = JSON.parse(logs[0]);
        expect(first.event).toBe('specly_seed_summary');
        // pretty output appears as a separate line starting with a newline char
        expect(logs[1].startsWith('\n')).toBe(true);
    });

    it('logs error and calls process.exit(1) on failure', async () => {
        // Arrange
        vi.doMock('/Volumes/Projects/business/AstronLab/omar391/mcp-servers/specly-mcp/src/database/global-queries.js', () => ({
            initializeGlobalDatabaseService: async () => ({
                getDrizzleManager: () => ({})
            })
        }));
        vi.doMock('/Volumes/Projects/business/AstronLab/omar391/mcp-servers/specly-mcp/src/services/seed-manager.js', () => ({
            SeedManager: class {
                constructor(_m: any) { }
                async initializeGlobalData() { return; }
                async seedSpecly() { throw new Error('boom'); }
            }
        }));

        // exitSpy was created in beforeEach; clear previous calls so this test can assert
        exitSpy.mockClear();

        // Act
        const mod = await import('../scripts/seed-specly.js');
        await mod.main();

        // Assert
        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(errors[0].includes('Seed failed')).toBe(true);
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});
