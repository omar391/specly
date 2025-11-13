import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SeedManager } from '../seed-manager.js';

// Mock dependencies
vi.mock('../../database/drizzle-connection.js');
vi.mock('../../database/global-queries.js');
vi.mock('../../repositories/spec-repository.js');
vi.mock('../../repositories/profile-repository.js');
vi.mock('../../utils/hash.js');
vi.mock('../../data/embedded-seed-data.js', () => ({
    MCP_SERVER_MAPPINGS_SEED: [],
    SPECLY_SEED_SPECS: [],
    SPECLY_SEED_TOOLS: [],
    SPECLY_ROOT_PROFILE: { profileName: 'root', description: 'desc', toolNames: [] },
}));

import type { DrizzleDatabaseManager } from '../../database/drizzle-connection.js';

describe('SeedManager', () => {
    let mockDbManager: DrizzleDatabaseManager;
    let mockDb: any;
    let seedManager: SeedManager;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        mockDb = {
            delete: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
        };

        mockDbManager = {
            getDb: vi.fn().mockReturnValue(mockDb),
        } as any;

        seedManager = new SeedManager(mockDbManager);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with dbManager and getDb', () => {
            expect(mockDbManager.getDb).toHaveBeenCalledTimes(1);
            expect(seedManager).toBeInstanceOf(SeedManager);
        });
    });

    describe('initializeGlobalData', () => {
        it('should seed MCP server mappings in non-stdio mode', async () => {
            mockDb.insert.mockReturnValue(mockDb);
            mockDb.values.mockReturnValue(mockDb);

            await seedManager.initializeGlobalData();

            expect(mockDb.delete).toHaveBeenCalledWith(expect.any(Object)); // mcpServerMappings
            expect(mockDb.insert).toHaveBeenCalledWith(expect.any(Object)); // mcpServerMappings
            expect(mockDb.values).toHaveBeenCalledWith([]);
            expect(console.log).toHaveBeenCalledWith('Global MCP server mappings seeded (Specly mode)');
        });

        it('should throw error on database failure', async () => {
            const error = new Error('DB error');
            mockDb.delete.mockRejectedValue(error);

            await expect(seedManager.initializeGlobalData()).rejects.toThrow('DB error');
            expect(console.error).toHaveBeenCalledWith('Error initializing global data:', error);
        });
    });
});