import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { SeedManager } from '../services/seed-manager.js';
import { profiles, profileVersions, workspaces, workspaceProfileVersions, mcpServerMappings, specs, toolVersions, profileVersionTools, tools } from '../database/schema/global-schema.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { SPECLY_SEED_SPECS, SPECLY_SEED_TOOLS, MCP_SERVER_MAPPINGS_SEED } from '../data/embedded-seed-data.js';
import { eq, desc } from 'drizzle-orm';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { ProfileRepository } from '../repositories/profile-repository.js';

const overrideInsertError = (manager: SeedManager, table: unknown, errorMessage: string) => {
    const originalDb = (manager as any).drizzleDb;
    const proxy = new Proxy(originalDb, {
        get(target, prop) {
            if (prop === 'insert') {
                return (tableName: unknown) => {
                    if (tableName === table) {
                        return {
                            values: () => Promise.reject(new Error(errorMessage))
                        };
                    }
                    return target.insert(tableName);
                };
            }
            const value = Reflect.get(target, prop);
            if (typeof value === 'function') {
                return value.bind(target);
            }
            return value;
        }
    });
    (manager as any).drizzleDb = proxy;
    return () => {
        (manager as any).drizzleDb = originalDb;
    };
};

describe('SeedManager Specly seeding (SP-004)', () => {
    let drizzleDb: DrizzleDatabaseManager;
    let seedManager: SeedManager;

    beforeEach(async () => {
        // Reset module imports/mocks so test runs are isolated (some other tests mock
        // the ProfileRepository module) — this prevents leaking module mocks.
        vi.resetModules();
        // Use concrete in-memory database for reliable testing
        drizzleDb = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        await drizzleDb.initialize();

        // Initialize global database service to set up schema
        const globalDbService = new GlobalDatabaseService(drizzleDb);
        await globalDbService.initialize();

        // Provide an in-test ProfileRepository-like object that uses the real DB
        // underneath; this avoids depending on the module import which other
        // tests may mock.
        const profileRepo = {
            createProfile: async (input: any) => {
                const db = drizzleDb.getDb();
                const existing = await db.select().from(profiles).where(eq(profiles.name, input.name)).limit(1);
                if (existing.length > 0) return { profile: existing[0], created: false } as any;
                const id = crypto.randomUUID();
                const [row] = await db.insert(profiles).values({ id, name: input.name, description: input.description ?? null, parentProfileId: input.parentProfileId ?? null }).returning();
                return { profile: row, created: true } as any;
            },
            createProfileVersion: async (input: any) => {
                const db = drizzleDb.getDb();
                const rows = await db.select().from(profileVersions).where(eq(profileVersions.profileId, input.profileId)).orderBy(desc(profileVersions.version)).limit(1);
                const nextVersion = rows.length === 0 ? 1 : (rows[0].version as number) + 1;
                const id = crypto.randomUUID();
                const [row] = await db.insert(profileVersions).values({ id, profileId: input.profileId, parentProfileVersionId: input.parentProfileVersionId ?? null, version: nextVersion }).returning();
                return { id: row.id, version: row.version, created: true } as any;
            },
            attachToolToProfileVersion: async (input: any) => {
                const db = drizzleDb.getDb();
                const id = crypto.randomUUID();
                const [row] = await db.insert(profileVersionTools).values({ id, profileVersionId: input.profileVersionId, toolName: input.toolName, toolVersionHash: input.toolVersionHash, commandAlias: input.commandAlias ?? null }).returning();
                return { id: row.id, created: true } as any;
            },
            bindWorkspaceProfile: async (workspaceId: string, profileVersionId: string) => {
                const db = drizzleDb.getDb();
                await db.delete(workspaceProfileVersions).where(eq(workspaceProfileVersions.workspaceId, workspaceId));
                const [row] = await db.insert(workspaceProfileVersions).values({ workspaceId, profileVersionId }).returning();
                return row as any;
            },
            getProfileByName: async (name: string) => {
                const db = drizzleDb.getDb();
                const [row] = await db.select().from(profiles).where(eq(profiles.name, name)).limit(1);
                return row || null;
            },
            listProfileVersions: async (profileId: string) => {
                const db = drizzleDb.getDb();
                return db.select().from(profileVersions).where(eq(profileVersions.profileId, profileId)).orderBy(desc(profileVersions.version));
            }
        } as any;

        // Create seed manager with concrete database + in-test repo
        seedManager = new SeedManager(drizzleDb, profileRepo);
    });

    it('initializes global MCP server mappings', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

        await seedManager.initializeGlobalData();

        const db = drizzleDb.getDb();
        const mappings = await db.select().from(mcpServerMappings);
        expect(mappings.length).toBe(MCP_SERVER_MAPPINGS_SEED.length);

        consoleSpy.mockRestore();
    });

    it('handles initialization errors gracefully', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock the db to throw an error; the SeedManager stores the db instance at
        // construction time, so override the private property directly here.
        const originalDb = drizzleDb.getDb();
        const fakeDb = {
            ...originalDb,
            delete: vi.fn().mockRejectedValue(new Error('DB error')),
        } as any;
        // directly replace the private drizzle db instance on the manager
        (seedManager as any).drizzleDb = fakeDb;

        await expect(seedManager.initializeGlobalData()).rejects.toThrow('DB error');
        consoleSpy.mockRestore();
    });

    it('is idempotent (second run creates zero new)', async () => {
        const first = await seedManager.seedSpecly();
        const second = await seedManager.seedSpecly();
        // First run should create all seed specs & tool versions & a profile version
        expect(first.specsCreated).toBe(SPECLY_SEED_SPECS.length);
        expect(first.toolVersionsCreated).toBe(SPECLY_SEED_TOOLS.length);
        expect(first.profileCreated).toBe(true);
        expect(first.profileVersionsCreated).toBe(1);
        // Second run should be a no-op for creations
        expect(second.specsCreated).toBe(0);
        expect(second.toolVersionsCreated).toBe(0);
        expect(second.profileCreated).toBe(false);
        expect(second.profileVersionsCreated).toBe(0);
    });

    it('creates root profile version and binds workspaces (if any)', async () => {
        // Run seeding
        await seedManager.seedSpecly();

        // Check that profile was created
        const db = drizzleDb.getDb();
        const profileRows = await db.select().from(profiles).where(eq(profiles.name, 'root-profile'));
        expect(profileRows.length).toBe(1);
        const versions = await db.select().from(profileVersions).where(eq(profileVersions.profileId, profileRows[0].id));
        expect(versions.length).toBeGreaterThanOrEqual(1);
    });

    it('binds newly created workspace to existing root profile version on first seed after workspace creation', async () => {
        // Create a workspace AFTER initial seed so binding path is exercised separately
        const globalDbService = new GlobalDatabaseService(drizzleDb);
        const wsId = 'ws-test-1';
        await globalDbService.createWorkspace({ id: wsId, path: '/tmp/ws-test-1', name: 'WS Test 1' } as any);

        // Run seed again (should not recreate specs but should bind workspace if profile already exists)
        await seedManager.seedSpecly();
        const db = drizzleDb.getDb();
        const bindings = await db.select().from(workspaceProfileVersions).where(eq(workspaceProfileVersions.workspaceId, wsId));
        expect(bindings.length).toBe(1);
    });

    it('handles database errors during spec seeding', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock the database operations to fail during spec seeding
        const originalDb = drizzleDb.getDb();
        const fakeDb = {
            ...originalDb,
            insert: vi.fn().mockImplementation((table) => {
                if (table === specs) {
                    return {
                        values: vi.fn().mockRejectedValue(new Error('Spec insert error'))
                    };
                }
                return {
                    values: vi.fn().mockResolvedValue(undefined)
                };
            }),
            select: vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue([])
            }),
            delete: vi.fn().mockResolvedValue(undefined)
        } as any;

        // Use the fake db directly on the instance (SeedManager caches the db reference)
        (seedManager as any).drizzleDb = fakeDb;

        await expect(seedManager.seedSpecly()).rejects.toThrow('Spec insert error');
        consoleSpy.mockRestore();
    });

    it('handles database errors during tool creation', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock the database operations to fail during tool creation
        const originalDb = drizzleDb.getDb();
        const fakeDb = {
            ...originalDb,
            insert: vi.fn().mockImplementation((table) => {
                if (table === toolVersions) {
                    return {
                        values: vi.fn().mockRejectedValue(new Error('Tool creation error'))
                    };
                }
                return {
                    values: vi.fn().mockResolvedValue(undefined)
                };
            }),
            select: vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue([])
            }),
            delete: vi.fn().mockResolvedValue(undefined)
        } as any;

        (seedManager as any).drizzleDb = fakeDb;

        await expect(seedManager.seedSpecly()).rejects.toThrow('Tool creation error');
        consoleSpy.mockRestore();
    });

    it('handles database errors during profile creation', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Provide a mocked ProfileRepository implementation directly; avoid mocking the
        // module to prevent mocking leaks across tests.
        const mockProfileRepo = {
            createProfile: vi.fn().mockRejectedValue(new Error('Profile creation error')),
            createProfileVersion: vi.fn(),
            attachToolToProfileVersion: vi.fn(),
            bindWorkspaceProfile: vi.fn(),
            getProfileByName: vi.fn(),
            listProfileVersions: vi.fn()
        } as any;

        // Create a new seedManager instance with mocked ProfileRepository
        const newSeedManager = new SeedManager(drizzleDb, mockProfileRepo);

        await expect(newSeedManager.seedSpecly()).rejects.toThrow('Profile creation error');

        consoleSpy.mockRestore();
        // No module mock to restore since we pass a mocked repo directly
    });

    it('handles empty workspace list gracefully', async () => {
        // Clear all workspaces
        const db = drizzleDb.getDb();
        await db.delete(workspaces);

        const result = await seedManager.seedSpecly();
        expect(result.workspaceBindings).toBe(0);
        expect(result.specsCreated).toBe(SPECLY_SEED_SPECS.length);
        expect(result.toolVersionsCreated).toBe(SPECLY_SEED_TOOLS.length);
    });

    it('handles profile version creation errors', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Provide a mocked ProfileRepository implementation directly; avoid mocking the
        // module to prevent mocking leaks across tests.
        const mockProfileRepo = {
            createProfile: vi.fn().mockResolvedValue({
                profile: { id: 'test-profile-id', name: 'root-profile', description: null, parentProfileId: null, createdAt: null },
                created: true
            }),
            createProfileVersion: vi.fn().mockRejectedValue(new Error('Profile version creation error')),
            attachToolToProfileVersion: vi.fn(),
            bindWorkspaceProfile: vi.fn(),
            getProfileByName: vi.fn(),
            listProfileVersions: vi.fn()
        };
        const newSeedManager = new SeedManager(drizzleDb, mockProfileRepo);

        await expect(newSeedManager.seedSpecly()).rejects.toThrow('Profile version creation error');

        consoleSpy.mockRestore();
        // No module mock to restore since we pass a mocked repo directly
    });

    it('handles tool attachment errors', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock the ProfileRepository
        vi.mock('../repositories/profile-repository.js', () => {
            const mockProfileRepository = vi.fn();
            return {
                ProfileRepository: mockProfileRepository
            };
        });
        const { ProfileRepository } = await import('../repositories/profile-repository.js');

        const mockProfileRepo = {
            createProfile: vi.fn().mockResolvedValue({
                profile: { id: 'test-profile-id', name: 'root-profile', description: null, parentProfileId: null, createdAt: null },
                created: true
            }),
            createProfileVersion: vi.fn().mockResolvedValue({
                id: 'test-profile-version-id',
                version: 1,
                created: true
            }),
            attachToolToProfileVersion: vi.fn().mockRejectedValue(new Error('Tool attachment error')),
            bindWorkspaceProfile: vi.fn(),
            getProfileByName: vi.fn().mockResolvedValue(null),
            listProfileVersions: vi.fn().mockResolvedValue([])
        };

        const MockProfileRepository = vi.mocked(ProfileRepository);
        MockProfileRepository.mockImplementation(() => mockProfileRepo);

        // Create a new seedManager instance with mocked ProfileRepository
        const newSeedManager = new SeedManager(drizzleDb, mockProfileRepo, undefined, {
            listByTool: vi.fn((toolName: string) => {
                return [{ hash: 'test-hash', toolName, graphManifest: '{}' }];
            })
        });

        const restoreDb = overrideInsertError(newSeedManager, profileVersionTools, 'Tool attachment error');
        try {
            await expect(newSeedManager.seedSpecly()).rejects.toThrow('Tool attachment error');
        } finally {
            restoreDb();
        }

        consoleSpy.mockRestore();
        // No module mock to restore since we pass a mocked repo directly
    });

    it('handles workspace binding errors', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Create a workspace to trigger binding
        const globalDbService = new GlobalDatabaseService(drizzleDb);
        await globalDbService.createWorkspace({ id: 'test-workspace', path: '/test', name: 'Test Workspace' } as any);

        // Provide a mocked ProfileRepository implementation directly; avoid mocking the
        // module to prevent mocking leaks across tests.
        const mockProfileRepo = {
            createProfile: vi.fn().mockResolvedValue({
                profile: { id: 'test-profile-id', name: 'root-profile', description: null, parentProfileId: null, createdAt: null },
                created: true
            }),
            createProfileVersion: vi.fn().mockResolvedValue({
                id: 'test-profile-version-id',
                version: 1,
                created: true
            }),
            attachToolToProfileVersion: vi.fn().mockResolvedValue({
                id: 'test-attachment-id',
                created: true
            }),
            bindWorkspaceProfile: vi.fn().mockRejectedValue(new Error('Workspace binding error')),
            getProfileByName: vi.fn().mockResolvedValue(null),
            listProfileVersions: vi.fn().mockResolvedValue([])
        };
        const newSeedManager = new SeedManager(drizzleDb, mockProfileRepo, undefined, {
            listByTool: vi.fn((toolName: string) => {
                return [{ hash: 'test-hash', toolName, graphManifest: '{}' }];
            })
        });

        // Replace db on manager to throw on workspace binding insert
        const originalDb = drizzleDb.getDb();
        const restoreDb = overrideInsertError(newSeedManager, workspaceProfileVersions, 'Workspace binding error');
        try {
            await expect(newSeedManager.seedSpecly()).rejects.toThrow(/Workspace binding error|FOREIGN KEY constraint failed/);
        } finally {
            restoreDb();
        }

        consoleSpy.mockRestore();
        // No module mock to restore since we pass a mocked repo directly
    });

    it('covers branches when specs already exist', async () => {
        // First run to create specs
        await seedManager.seedSpecly();

        // Second run should skip existing specs (testing the existingSpecHashes.has(hash) branch)
        const result = await seedManager.seedSpecly();

        // Verify no new specs were created
        expect(result.specsCreated).toBe(0);
        expect(result.createdSpecHashes).toEqual([]);
    });

    it('covers branches when tool versions already exist', async () => {
        // First run to create tool versions
        await seedManager.seedSpecly();

        // Second run should skip existing tool versions (testing the existingToolVersionHashes.has(hash) branch)
        const result = await seedManager.seedSpecly();

        // Verify no new tool versions were created
        expect(result.toolVersionsCreated).toBe(0);
        expect(result.createdToolVersionHashes).toEqual([]);
    });

    it('covers branches when tools already exist', async () => {
        // First run to create tools
        await seedManager.seedSpecly();

        // Second run should skip existing tools (testing the existingToolNames.has(name) branch)
        const result = await seedManager.seedSpecly();

        // Verify no new tools were created (this is implicit in the tool versions creation being 0)
        expect(result.toolVersionsCreated).toBe(0);
    });

    it('covers profile version retrieval when profile already exists', async () => {
        // First run to create profile
        await seedManager.seedSpecly();

        // Create a new workspace to trigger binding
        const globalDbService = new GlobalDatabaseService(drizzleDb);
        await globalDbService.createWorkspace({ id: 'test-workspace-2', path: '/test2', name: 'Test Workspace 2' } as any);

        // Second run should find existing profile and bind new workspace
        const result = await seedManager.seedSpecly();

        // Verify profile was not created again
        expect(result.profileCreated).toBe(false);
        expect(result.profileVersionsCreated).toBe(0);

        // Verify workspace was bound
        const db = drizzleDb.getDb();
        const bindings = await db.select().from(workspaceProfileVersions).where(eq(workspaceProfileVersions.workspaceId, 'test-workspace-2'));
        expect(bindings.length).toBe(1);
    });

    it('covers tool attachment deduplication', async () => {
        // First run to create profile and attach tools
        await seedManager.seedSpecly();

        // Second run should skip duplicate tool attachments
        const result = await seedManager.seedSpecly();

        // Verify no new profile version was created
        expect(result.profileVersionsCreated).toBe(0);
        expect(result.toolsAttached).toBe(0);
    });

    it('covers workspace binding deduplication', async () => {
        // Create a workspace
        const globalDbService = new GlobalDatabaseService(drizzleDb);
        await globalDbService.createWorkspace({ id: 'test-workspace-3', path: '/test3', name: 'Test Workspace 3' } as any);

        // First run to bind workspace
        await seedManager.seedSpecly();

        // Second run should skip duplicate workspace bindings
        const result = await seedManager.seedSpecly();

        // Verify no new workspace bindings
        expect(result.workspaceBindings).toBe(0);
    });

    it('covers error handling in tool version creation when specs fail', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock database to fail on spec insertion
        const originalDb = drizzleDb.getDb();
        const fakeDb = {
            ...originalDb,
            insert: vi.fn().mockImplementation((table) => {
                if (table === specs) {
                    return {
                        values: vi.fn().mockRejectedValue(new Error('Spec creation failed'))
                    };
                }
                return originalDb.insert(table);
            }),
            select: originalDb.select,
            delete: originalDb.delete
        } as any;

        (seedManager as any).drizzleDb = fakeDb;

        await expect(seedManager.seedSpecly()).rejects.toThrow('Spec creation failed');

        consoleSpy.mockRestore();
    });

    it('covers error handling in tool insertion', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock database to fail on tool insertion
        const originalDb = drizzleDb.getDb();
        const fakeDb = {
            ...originalDb,
            insert: vi.fn().mockImplementation((table) => {
                if (table === tools) {
                    return {
                        values: vi.fn().mockRejectedValue(new Error('Tool creation failed'))
                    };
                }
                return originalDb.insert(table);
            }),
            select: originalDb.select,
            delete: originalDb.delete
        } as any;

        (seedManager as any).drizzleDb = fakeDb;

        await expect(seedManager.seedSpecly()).rejects.toThrow('Tool creation failed');

        consoleSpy.mockRestore();
    });

    it('covers error handling in tool version insertion', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock database to fail on tool version insertion
        const originalDb = drizzleDb.getDb();
        const fakeDb = {
            ...originalDb,
            insert: vi.fn().mockImplementation((table) => {
                if (table === toolVersions) {
                    return {
                        values: vi.fn().mockRejectedValue(new Error('Tool version creation failed'))
                    };
                }
                return originalDb.insert(table);
            }),
            select: originalDb.select,
            delete: originalDb.delete
        } as any;

        (seedManager as any).drizzleDb = fakeDb;

        await expect(seedManager.seedSpecly()).rejects.toThrow('Tool version creation failed');

        consoleSpy.mockRestore();
    });

    it('covers error handling in workspace profile version insertion', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Create a workspace first
        const globalDbService = new GlobalDatabaseService(drizzleDb);
        await globalDbService.createWorkspace({ id: 'test-workspace-4', path: '/test4', name: 'Test Workspace 4' } as any);

        // Mock database to fail on workspace profile version insertion
        const originalDb = drizzleDb.getDb();
        const fakeDb = {
            ...originalDb,
            insert: vi.fn().mockImplementation((table) => {
                if (table === workspaceProfileVersions) {
                    return {
                        values: vi.fn().mockRejectedValue(new Error('Workspace binding failed'))
                    };
                }
                return originalDb.insert(table);
            }),
            select: originalDb.select,
            delete: originalDb.delete
        } as any;

        (seedManager as any).drizzleDb = fakeDb;

        await expect(seedManager.seedSpecly()).rejects.toThrow('Workspace binding failed');

        consoleSpy.mockRestore();
    });

    it('covers stdio mode logging suppression', async () => {
        // Mock isStdioMode to return true
        vi.mock('@omar391/mcp-kit/utils/cli-parser', () => ({
            isStdioMode: vi.fn().mockReturnValue(true)
        }));

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

        await seedManager.initializeGlobalData();

        // Verify no console.log was called
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();

        // Restore the mock
        vi.restoreAllMocks();
    });

    it('covers successful tool version creation with all branches', async () => {
        const result = await seedManager.seedSpecly();

        // Verify all expected items were created
        expect(result.specsCreated).toBeGreaterThan(0);
        expect(result.toolVersionsCreated).toBeGreaterThan(0);
        expect(result.profileCreated).toBe(true);
        expect(result.toolsAttached).toBeGreaterThan(0);

        // Verify database state
        const db = drizzleDb.getDb();
        const dbSpecs = await db.select().from(specs);
        const dbToolVersions = await db.select().from(toolVersions);
        const dbTools = await db.select().from(tools);

        expect(dbSpecs.length).toBe(result.specsCreated);
        expect(dbToolVersions.length).toBe(result.toolVersionsCreated);
        expect(dbTools.length).toBeGreaterThan(0);
    });

    it('covers profile version creation when profile exists but no versions', async () => {
        // Create profile manually without versions
        const db = drizzleDb.getDb();
        const profileId = crypto.randomUUID();
        await db.insert(profiles).values({
            id: profileId,
            name: 'root-profile',
            description: 'Test profile',
            parentProfileId: null
        });

        // Mock profile repo to return existing profile
        const mockProfileRepo = {
            createProfile: vi.fn().mockResolvedValue({
                profile: { id: profileId, name: 'root-profile' },
                created: false
            }),
            createProfileVersion: vi.fn().mockResolvedValue({
                id: crypto.randomUUID(),
                version: 1,
                created: true
            }),
            attachToolToProfileVersion: vi.fn().mockResolvedValue({
                id: crypto.randomUUID(),
                created: true
            }),
            bindWorkspaceProfile: vi.fn(),
            getProfileByName: vi.fn().mockResolvedValue({ id: profileId, name: 'root-profile' }),
            listProfileVersions: vi.fn().mockResolvedValue([]) // No existing versions
        };

        const newSeedManager = new SeedManager(drizzleDb, mockProfileRepo, undefined, {
            listByTool: vi.fn().mockReturnValue([{ hash: 'test-hash', toolName: 'test-tool', graphManifest: '{}' }])
        });

        const result = await newSeedManager.seedSpecly();

        // When profile exists but has no versions, no new profile version is created
        // The logic only creates a profile version when the profile itself is newly created
        expect(result.profileCreated).toBe(false);
        expect(result.profileVersionsCreated).toBe(0); // Should not create version for existing profile
    });

    it('covers workspace binding when no profile version exists', async () => {
        // Create a workspace
        const globalDbService = new GlobalDatabaseService(drizzleDb);
        await globalDbService.createWorkspace({ id: 'test-workspace-5', path: '/test5', name: 'Test Workspace 5' } as any);

        // Create a profile version manually
        const db = drizzleDb.getDb();
        const profileId = crypto.randomUUID();
        const profileVersionId = crypto.randomUUID();
        await db.insert(profiles).values({
            id: profileId,
            name: 'root-profile',
            description: 'Test profile',
            parentProfileId: null
        });
        await db.insert(profileVersions).values({
            id: profileVersionId,
            profileId: profileId,
            parentProfileVersionId: null,
            version: 1
        });

        const mockProfileRepo = {
            createProfile: vi.fn().mockResolvedValue({
                profile: { id: profileId, name: 'root-profile' },
                created: false // Profile already exists
            }),
            createProfileVersion: vi.fn(), // Won't be called
            attachToolToProfileVersion: vi.fn(), // Won't be called
            bindWorkspaceProfile: vi.fn(),
            getProfileByName: vi.fn().mockResolvedValue({ id: profileId, name: 'root-profile' }),
            listProfileVersions: vi.fn().mockResolvedValue([{ id: profileVersionId, version: 1 }])
        };

        const newSeedManager = new SeedManager(drizzleDb, mockProfileRepo, undefined, {
            listByTool: vi.fn().mockReturnValue([]) // No tool versions, so no attachments
        });

        const result = await newSeedManager.seedSpecly();

        expect(result.workspaceBindings).toBe(1); // Should bind workspace to existing profile version
        expect(result.profileCreated).toBe(false); // Profile already existed
        expect(result.profileVersionsCreated).toBe(0); // No new profile version created
    });

    it('covers tool attachment when no tool versions exist', async () => {
        const mockProfileRepo = {
            createProfile: vi.fn().mockResolvedValue({
                profile: { id: 'test-profile-id', name: 'root-profile' },
                created: true
            }),
            createProfileVersion: vi.fn().mockResolvedValue({
                id: 'test-version-id',
                version: 1,
                created: true
            }),
            attachToolToProfileVersion: vi.fn().mockResolvedValue({
                id: crypto.randomUUID(),
                created: true
            }),
            bindWorkspaceProfile: vi.fn(),
            getProfileByName: vi.fn(),
            listProfileVersions: vi.fn()
        };

        const mockToolVersionRepo = {
            listByTool: vi.fn().mockReturnValue([]) // No tool versions available
        };

        const newSeedManager = new SeedManager(drizzleDb, mockProfileRepo, undefined, mockToolVersionRepo);

        const result = await newSeedManager.seedSpecly();

        // Should create profile version but no tools attached
        expect(result.profileVersionsCreated).toBe(1);
        expect(result.toolsAttached).toBe(0);
    });
});
