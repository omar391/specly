import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from '../seed-specly.js';

// Mock dependencies
vi.mock('../../database/global-queries.js', () => ({
    initializeGlobalDatabaseService: vi.fn(),
}));

vi.mock('../../services/seed-manager.js', () => ({
    SeedManager: vi.fn(),
}));

import { initializeGlobalDatabaseService } from '../../database/global-queries.js';
import { SeedManager } from '../../services/seed-manager.js';

describe('seed-specly', () => {
    const mockInitializeGlobalDatabaseService = vi.mocked(initializeGlobalDatabaseService);
    const mockSeedManager = vi.mocked(SeedManager);

    let mockGlobalDb: any;
    let mockDrizzleManager: any;
    let mockSeedManagerInstance: any;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation(() => {});

        mockGlobalDb = {
            getDrizzleManager: vi.fn(),
        };
        mockDrizzleManager = {};
        mockSeedManagerInstance = {
            initializeGlobalData: vi.fn(),
            seedSpecly: vi.fn(),
        };

        mockInitializeGlobalDatabaseService.mockResolvedValue(mockGlobalDb);
        mockGlobalDb.getDrizzleManager.mockReturnValue(mockDrizzleManager);
        mockSeedManager.mockReturnValue(mockSeedManagerInstance);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('main', () => {
        it('should seed successfully without pretty flag', async () => {
            const mockResult = {
                specsCreated: 5,
                toolVersionsCreated: 3,
                profileCreated: true,
                profileVersionsCreated: 2,
                toolsAttached: 4,
                workspaceBindings: 1,
                createdSpecHashes: ['hash1', 'hash2'],
                createdToolVersionHashes: ['thash1'],
            };
            mockSeedManagerInstance.seedSpecly.mockResolvedValue(mockResult);

            await main();

            expect(mockInitializeGlobalDatabaseService).toHaveBeenCalledTimes(1);
            expect(mockGlobalDb.getDrizzleManager).toHaveBeenCalledTimes(1);
            expect(mockSeedManager).toHaveBeenCalledWith(mockDrizzleManager);
            expect(mockSeedManagerInstance.initializeGlobalData).toHaveBeenCalledTimes(1);
            expect(mockSeedManagerInstance.seedSpecly).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledTimes(1);
            const logged = JSON.parse((console.log as any).mock.calls[0][0]);
            expect(logged.event).toBe('specly_seed_summary');
            expect(logged.specsCreated).toBe(5);
            expect(logged.timestamp).toBeDefined();
            expect(console.log).toHaveBeenCalledTimes(1); // Only the summary line
        });

        it('should seed successfully with pretty flag', async () => {
            const originalArgv = process.argv;
            process.argv = ['node', 'seed-specly.ts', '--pretty'];

            const mockResult = {
                specsCreated: 2,
                toolVersionsCreated: 1,
                profileCreated: false,
                profileVersionsCreated: 0,
                toolsAttached: 2,
                workspaceBindings: 0,
                createdSpecHashes: [],
                createdToolVersionHashes: [],
            };
            mockSeedManagerInstance.seedSpecly.mockResolvedValue(mockResult);

            await main();

            expect(console.log).toHaveBeenCalledTimes(2); // Summary and pretty
            const summaryLogged = JSON.parse((console.log as any).mock.calls[0][0]);
            expect(summaryLogged.event).toBe('specly_seed_summary');
            const prettyLogged = (console.log as any).mock.calls[1][0];
            expect(prettyLogged).toContain('"ok": true');
            expect(prettyLogged).toContain('"specsCreated": 2');

            process.argv = originalArgv;
        });

        it('should handle seed failure', async () => {
            const error = new Error('Seed failed');
            mockSeedManagerInstance.seedSpecly.mockRejectedValue(error);

            await main();

            expect(console.error).toHaveBeenCalledWith('Seed failed', error);
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        it('should handle database initialization failure', async () => {
            const error = new Error('DB init failed');
            mockInitializeGlobalDatabaseService.mockRejectedValue(error);

            await main();

            expect(console.error).toHaveBeenCalledWith('Seed failed', error);
            expect(process.exit).toHaveBeenCalledWith(1);
        });
    });
});