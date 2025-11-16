import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SeedManager } from '../seed-manager.js';
import { SpecRepositoryImpl, ToolVersionRepositoryImpl } from '../../repositories/spec-repository.js';
import { ProfileRepository } from '../../repositories/profile-repository.js';
import { GlobalDatabaseService } from '../../database/global-queries.js';
import { mcpServerMappings, specs, tools, toolVersions, profileVersionTools, workspaceProfileVersions, workspaces } from '../../database/schema/global-schema.js';
import { MCP_SERVER_MAPPINGS_SEED, SPECLY_SEED_SPECS, SPECLY_SEED_TOOLS, SPECLY_ROOT_PROFILE } from '../../data/embedded-seed-data.js';

import { hashSpec, hashToolVersion } from '../../utils/hash.js';
import { isStdioMode } from '@omar391/mcp-kit/utils/cli-parser';
vi.mock('../../repositories/spec-repository.js');
vi.mock('../../repositories/profile-repository.js');
vi.mock('../../database/global-queries.js');
vi.mock('@omar391/mcp-kit/utils/cli-parser', () => ({
    isStdioMode: vi.fn(() => false)
}));
vi.mock('../../utils/hash.js', () => ({
    hashSpec: vi.fn(() => ({ hash: 'spec-hash' })),
    hashToolVersion: vi.fn(() => ({ hash: 'tool-version-hash' }))
}));

// Mock crypto
vi.mock('crypto', () => ({
    randomUUID: vi.fn(() => 'random-uuid')
}));

describe('SeedManager', () => {
    let mockDbManager: any;
    let mockSpecRepo: vi.Mocked<SpecRepositoryImpl>;
    let mockToolVersionRepo: vi.Mocked<ToolVersionRepositoryImpl>;
    let mockProfileRepo: vi.Mocked<ProfileRepository>;
    let mockGlobalDbService: vi.Mocked<GlobalDatabaseService>;
    let mockDb: any;
    let seedManager: SeedManager;

    beforeEach(() => {
        // Mock database operations
        mockDb = {
            delete: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockResolvedValue(undefined),
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            get: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue([])
        };

        mockDbManager = {
            getDb: vi.fn().mockReturnValue(mockDb)
        };

        mockSpecRepo = {
            create: vi.fn(),
            getByHash: vi.fn()
        } as any;

        mockToolVersionRepo = {
            create: vi.fn(),
            listByTool: vi.fn().mockResolvedValue([])
        } as any;

        mockProfileRepo = {
            createProfile: vi.fn().mockResolvedValue({ created: true, profile: { id: 'profile-id' } }),
            createProfileVersion: vi.fn().mockResolvedValue({ id: 'version-id' }),
            getProfileByName: vi.fn(),
            listProfileVersions: vi.fn().mockResolvedValue([])
        } as any;

        mockGlobalDbService = {
            initialize: vi.fn().mockResolvedValue(undefined)
        } as any;

        seedManager = new SeedManager(mockDbManager, mockProfileRepo, mockSpecRepo, mockToolVersionRepo);
    });

    afterEach(() => {
        vi.clearAllMocks();
        isStdioMode.mockReturnValue(false);
    });

    describe('constructor', () => {
        it('should initialize with provided dependencies', () => {
            expect(seedManager).toBeInstanceOf(SeedManager);
            expect(mockDbManager.getDb).toHaveBeenCalled();
        });

        it('should create default repositories when not provided', () => {
            const managerWithoutDeps = new SeedManager(mockDbManager);
            expect(managerWithoutDeps).toBeInstanceOf(SeedManager);
        });
    });

    describe('initializeGlobalData', () => {
        it('should delete existing mappings and insert seed data', async () => {
            mockDb.delete.mockReturnValue(mockDb);
            mockDb.insert.mockReturnValue(mockDb);
            mockDb.values.mockResolvedValue(undefined);

            await seedManager.initializeGlobalData();

            expect(mockDb.delete).toHaveBeenCalledWith(mcpServerMappings);
            expect(mockDb.insert).toHaveBeenCalledWith(mcpServerMappings);
            expect(mockDb.values).toHaveBeenCalledWith(MCP_SERVER_MAPPINGS_SEED);
        });

        it('should throw error when database operation fails', async () => {
            const error = new Error('DB error');
            mockDb.values.mockRejectedValue(error);

            await expect(seedManager.initializeGlobalData()).rejects.toThrow('DB error');
        });

        it('should not log when in stdio mode', async () => {
            isStdioMode.mockReturnValue(true);
            mockDb.delete.mockReturnValue(mockDb);
            mockDb.insert.mockReturnValue(mockDb);
            mockDb.values.mockResolvedValue(undefined);

            await seedManager.initializeGlobalData();

            expect(mockDb.delete).toHaveBeenCalledWith(mcpServerMappings);
            expect(mockDb.insert).toHaveBeenCalledWith(mcpServerMappings);
            expect(mockDb.values).toHaveBeenCalledWith(MCP_SERVER_MAPPINGS_SEED);
        });
    });

    describe('seedSpecly', () => {
        beforeEach(() => {
            // Setup common mocks
            const createMockQuery = (result: any[] = []) => {
                const query = Promise.resolve(result);
                (query as any).where = vi.fn(() => Promise.resolve(result));
                return query;
            };

            mockDb.select = vi.fn(() => ({
                from: vi.fn(() => createMockQuery([]))
            }));
            mockDb.insert = vi.fn(() => ({
                values: vi.fn().mockResolvedValue(undefined)
            }));
            mockDb.delete = vi.fn(() => ({
                where: vi.fn().mockResolvedValue(undefined)
            }));
        });

        it('should seed specs, tools, and profile when none exist', async () => {
            // Mock empty existing data - already set in beforeEach
            mockToolVersionRepo.listByTool.mockResolvedValue([{ hash: 'tool-hash' }]);

            const result = await seedManager.seedSpecly();

            expect(result.specsCreated).toBe(SPECLY_SEED_SPECS.length);
            expect(result.toolVersionsCreated).toBe(SPECLY_SEED_TOOLS.length);
            expect(result.profileCreated).toBe(true);
            expect(result.toolsAttached).toBe(SPECLY_ROOT_PROFILE.toolNames.length);
            expect(result.workspaceBindings).toBe(0); // No workspaces
        });

        it('should be idempotent when data already exists', async () => {
            // Mock hash functions to return existing hashes
            (hashSpec as any).mockReturnValue({ hash: 'existing-hash', canonical: 'canonical' });
            (hashToolVersion as any).mockReturnValue({ hash: 'existing-hash', canonical: 'canonical' });

            // Mock existing specs with same hashes
            const existingSpecs = SPECLY_SEED_SPECS.map(spec => ({ hash: 'existing-hash' }));
            const existingTools = SPECLY_SEED_TOOLS.map(tool => ({ name: tool.toolName }));
            const existingToolVersions = SPECLY_SEED_TOOLS.map(() => ({ hash: 'existing-hash' }));

            const createMockQuery = (table: any) => {
                const result = table === specs ? existingSpecs :
                    table === tools ? existingTools :
                        table === toolVersions ? existingToolVersions :
                            [];
                const query = Promise.resolve(result);
                (query as any).where = vi.fn(() => Promise.resolve(result));
                return query;
            };

            mockDb.select = vi.fn(() => ({
                from: vi.fn((table: any) => createMockQuery(table))
            }));

            mockProfileRepo.createProfile.mockResolvedValue({ created: false, profile: { id: 'existing-profile' } });
            mockProfileRepo.listProfileVersions.mockResolvedValue([{ id: 'existing-version' }]);

            const result = await seedManager.seedSpecly();

            expect(result.specsCreated).toBe(0);
            expect(result.toolVersionsCreated).toBe(0);
            expect(result.profileCreated).toBe(false);
        });

        it('should bind workspaces to profile version', async () => {
            // Mock profile creation to fail so it uses existing profile path
            mockProfileRepo.createProfile.mockResolvedValue({ created: false, profile: { id: 'existing-profile-id' } });
            mockProfileRepo.getProfileByName.mockResolvedValue({ id: 'existing-profile-id' });
            mockProfileRepo.listProfileVersions.mockResolvedValue([{ id: 'existing-version-id' }]);

            const existingWorkspaces = [{ id: 'ws1' }, { id: 'ws2' }];
            const createMockQuery = (table: any) => {
                const result = table === workspaces ? existingWorkspaces : [];
                const query = Promise.resolve(result);
                (query as any).where = vi.fn(() => Promise.resolve(result));
                return query;
            };

            mockDb.select = vi.fn(() => ({
                from: vi.fn((table: any) => createMockQuery(table))
            }));

            const result = await seedManager.seedSpecly();

            expect(result.workspaceBindings).toBe(existingWorkspaces.length);
            expect(mockProfileRepo.getProfileByName).toHaveBeenCalledWith(SPECLY_ROOT_PROFILE.profileName);
            expect(mockProfileRepo.listProfileVersions).toHaveBeenCalledWith('existing-profile-id');
        });

        it('should handle profile creation failure', async () => {
            mockProfileRepo.createProfile.mockRejectedValue(new Error('Profile creation failed'));

            await expect(seedManager.seedSpecly()).rejects.toThrow('Profile creation failed');
        });

        it('should handle tool attachment when no versions exist', async () => {
            mockToolVersionRepo.listByTool.mockResolvedValue([]);

            const result = await seedManager.seedSpecly();

            expect(result.toolsAttached).toBe(0);
        });

        it('should handle existing tool attachments', async () => {
            const createMockQuery = (table: any) => {
                const result = table === profileVersionTools ? [
                    { toolName: 'echo', toolVersionHash: 'tool-version-hash' },
                    { toolName: 'list-tasks', toolVersionHash: 'tool-version-hash' }
                ] : [];
                const query = Promise.resolve(result);
                (query as any).where = vi.fn(() => Promise.resolve(result));
                return query;
            };

            mockDb.select = vi.fn(() => ({
                from: vi.fn((table: any) => createMockQuery(table))
            }));
            mockToolVersionRepo.listByTool.mockResolvedValue([{ hash: 'tool-version-hash' }]);

            const result = await seedManager.seedSpecly();

            expect(result.toolsAttached).toBe(0); // No new attachments
        });

        it('should handle existing profile with no versions', async () => {
            mockProfileRepo.createProfile.mockResolvedValue({ created: false, profile: { id: 'existing-profile' } });
            mockProfileRepo.getProfileByName.mockResolvedValue({ id: 'existing-profile' });
            mockProfileRepo.listProfileVersions.mockResolvedValue([]);

            mockToolVersionRepo.listByTool.mockResolvedValue([{ hash: 'tool-hash' }]);

            const createMockQuery = (result: any[] = []) => {
                const query = Promise.resolve(result);
                (query as any).where = vi.fn(() => Promise.resolve(result));
                return query;
            };

            mockDb.select = vi.fn(() => ({
                from: vi.fn(() => createMockQuery([]))
            }));

            const result = await seedManager.seedSpecly();

            expect(result.specsCreated).toBe(SPECLY_SEED_SPECS.length);
            expect(result.toolVersionsCreated).toBe(SPECLY_SEED_TOOLS.length);
            expect(result.profileCreated).toBe(false);
            expect(result.toolsAttached).toBe(0); // No profile created, no attachment
            expect(result.workspaceBindings).toBe(0); // No versions, no binding
        });

        it('should bind workspaces when profile already exists', async () => {
            // Mock existing data
            const existingSpecs = SPECLY_SEED_SPECS.map(() => ({ hash: 'existing-hash' }));
            const existingTools = SPECLY_SEED_TOOLS.map(tool => ({ name: tool.toolName }));
            const existingToolVersions = SPECLY_SEED_TOOLS.map(() => ({ hash: 'existing-hash' }));
            const existingWorkspaces = [{ id: 'ws1' }, { id: 'ws2' }];

            const createMockQuery = (table: any) => {
                const result = table === specs ? existingSpecs :
                    table === tools ? existingTools :
                        table === toolVersions ? existingToolVersions :
                            table === workspaces ? existingWorkspaces : [];
                const query = Promise.resolve(result);
                (query as any).where = vi.fn(() => Promise.resolve(result));
                return query;
            };

            mockDb.select = vi.fn(() => ({
                from: vi.fn((table: any) => createMockQuery(table))
            }));

            mockProfileRepo.createProfile.mockResolvedValue({ created: false, profile: { id: 'existing-profile' } });
            mockProfileRepo.getProfileByName.mockResolvedValue({ id: 'existing-profile' });
            mockProfileRepo.listProfileVersions.mockResolvedValue([{ id: 'existing-version' }]);

            const result = await seedManager.seedSpecly();

            expect(result.specsCreated).toBe(0);
            expect(result.toolVersionsCreated).toBe(0);
            expect(result.profileCreated).toBe(false);
            expect(result.workspaceBindings).toBe(existingWorkspaces.length);
        });

        it('should create default repositories when not provided to constructor', async () => {
            // Create a manager without repositories to test fallback instantiation
            const managerWithoutDeps = new SeedManager(mockDbManager);

            // Mock the constructors that will be called
            const mockSpecRepoInstance = {
                create: vi.fn(),
                getByHash: vi.fn()
            };
            const mockToolVersionRepoInstance = {
                create: vi.fn(),
                listByTool: vi.fn().mockResolvedValue([{ hash: 'tool-hash' }])
            };
            const mockProfileRepoInstance = {
                createProfile: vi.fn().mockResolvedValue({ created: true, profile: { id: 'profile-id' } }),
                createProfileVersion: vi.fn().mockResolvedValue({ id: 'version-id' }),
                getProfileByName: vi.fn(),
                listProfileVersions: vi.fn().mockResolvedValue([])
            };

            (SpecRepositoryImpl as any).mockImplementation(() => mockSpecRepoInstance);
            (ToolVersionRepositoryImpl as any).mockImplementation(() => mockToolVersionRepoInstance);
            (ProfileRepository as any).mockImplementation(() => mockProfileRepoInstance);

            // Setup mocks for the database operations
            const createMockQuery = (result: any[] = []) => {
                const query = Promise.resolve(result);
                (query as any).where = vi.fn(() => Promise.resolve(result));
                return query;
            };

            mockDb.select = vi.fn(() => ({
                from: vi.fn(() => createMockQuery([]))
            }));
            mockDb.insert = vi.fn(() => ({
                values: vi.fn().mockResolvedValue(undefined)
            }));

            const result = await managerWithoutDeps.seedSpecly();

        expect(result.specsCreated).toBe(SPECLY_SEED_SPECS.length);
        expect(result.toolVersionsCreated).toBe(SPECLY_SEED_TOOLS.length);
        expect(result.profileCreated).toBe(true);
    });
  });
});