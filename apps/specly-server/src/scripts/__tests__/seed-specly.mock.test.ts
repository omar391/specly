import { vi, test, expect, beforeEach, afterEach } from 'vitest';

// Mock the DB initializer and SeedManager to avoid real DB operations
vi.mock('../../database/global-queries.js', () => ({
    initializeGlobalDatabaseService: async () => ({
        getDrizzleManager: () => ({ getDb: () => ({ all: async () => [] }) })
    })
}));

vi.mock('../../services/seed-manager.js', () => {
    return {
        SeedManager: class {
            constructor(_dm: any) { }
            async initializeGlobalData() { return; }
            async seedSpecly() {
                return {
                    specsCreated: 1,
                    toolVersionsCreated: 1,
                    profileCreated: true,
                    profileVersionsCreated: 1,
                    toolsAttached: 1,
                    workspaceBindings: 1,
                    createdSpecHashes: [],
                    createdToolVersionHashes: []
                };
            }
        }
    };
});

// Import the real main after mocks are registered
import { main } from '../seed-specly.js';

let logSpy: any;

beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
});

afterEach(() => {
    logSpy.mockRestore();
    vi.resetModules();
});

test('seed main logs a summary JSON line', async () => {
    await main();
    expect(logSpy).toHaveBeenCalled();
    const firstCall = logSpy.mock.calls[0][0];
    expect(typeof firstCall).toBe('string');
    const parsed = JSON.parse(firstCall);
    expect(parsed.event).toBe('specly_seed_summary');
});
