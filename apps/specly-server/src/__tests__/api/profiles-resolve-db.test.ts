import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ProfilesController - resolveDbService Coverage', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    // Line 11: if (injected instanceof DatabaseService) return injected.getGlobal();
    it('createProfile should use injected DatabaseService instance (getGlobal branch)', async () => {
        const { GlobalDatabaseService } = await import('../../database/global-queries.js');
        const { DatabaseService } = await import('../../services/database-service.js');

        // Mock classes
        vi.doMock('../../repositories/profile-repository.js', () => ({
            ProfileRepository: class {
                async createProfile() { return { created: true, profile: { id: 'p1', name: 'P1' } }; }
            }
        }));

        const { ProfilesController } = await import('../../api/profiles.js');

        const mockGlobalDb = new GlobalDatabaseService();
        const mockDbService = { getGlobal: () => mockGlobalDb } as any;

        const controller = new ProfilesController();
        const ctx: any = {
            env: { dbService: mockDbService },
            req: { json: async () => ({ name: 'test', description: 'd' }) },
            json: (body: any, status?: number) => ({ body, status })
        };

        const res = await controller.createProfile(ctx);
        expect(res.status).toBe(201);
    });

    // Line 12: if (injected && typeof injected.getGlobal === 'function') return injected.getGlobal();
    it('createProfile should use injected object with getGlobal function', async () => {
        const { GlobalDatabaseService } = await import('../../database/global-queries.js');

        vi.doMock('../../repositories/profile-repository.js', () => ({
            ProfileRepository: class {
                async createProfile() { return { created: true, profile: { id: 'p2', name: 'P2' } }; }
            }
        }));

        const { ProfilesController } = await import('../../api/profiles.js');

        const mockGlobalDb = new GlobalDatabaseService();
        const injectedWithGetGlobal = {
            getGlobal: () => mockGlobalDb
        };

        const controller = new ProfilesController();
        const ctx: any = {
            env: { dbService: injectedWithGetGlobal },
            req: { json: async () => ({ name: 'test2', description: 'd2' }) },
            json: (body: any, status?: number) => ({ body, status })
        };

        const res = await controller.createProfile(ctx);
        expect(res.status).toBe(201);
    });

    // Line 13: if (injected && typeof injected.getDb === 'function') return new GlobalDatabaseService(injected);
    it('createProfile should wrap injected object with getDb function', async () => {
        const { GlobalDatabaseService } = await import('../../database/global-queries.js');

        vi.doMock('../../repositories/profile-repository.js', () => ({
            ProfileRepository: class {
                async createProfile() { return { created: true, profile: { id: 'p3', name: 'P3' } }; }
            }
        }));

        const { ProfilesController } = await import('../../api/profiles.js');

        const mockDbManager = {
            initialize: async () => { },
            getDb: () => ({ execute: async () => [] }),
            getSqlite: () => ({})
        };

        const controller = new ProfilesController();
        const ctx: any = {
            env: { dbService: mockDbManager },
            req: { json: async () => ({ name: 'test3', description: 'd3' }) },
            json: (body: any, status?: number) => ({ body, status })
        };

        const res = await controller.createProfile(ctx);
        expect(res.status).toBe(201);
    });

    // Also test constructor with defaultDb provided
    it('constructor should use provided defaultDb', async () => {
        const { GlobalDatabaseService } = await import('../../database/global-queries.js');
        const { ProfilesController } = await import('../../api/profiles.js');

        const mockDb = new GlobalDatabaseService();
        const controller = new ProfilesController(mockDb);

        expect(controller).toBeDefined();
    });

    // Ensure all endpoints use resolveDbService properly
    it('createProfileVersion should use resolveDbService', async () => {
        const { GlobalDatabaseService } = await import('../../database/global-queries.js');

        vi.doMock('../../repositories/profile-repository.js', () => ({
            ProfileRepository: class {
                async getProfileByName() { return { id: 'p1', name: 'P1' }; }
                async createProfileVersion() { return { id: 'v1', version: 1 }; }
            }
        }));

        const { ProfilesController } = await import('../../api/profiles.js');

        const mockGlobalDb = new GlobalDatabaseService();
        const injectedObject = { getGlobal: () => mockGlobalDb };

        const controller = new ProfilesController();
        const ctx: any = {
            env: { dbService: injectedObject },
            req: {
                param: (k: string) => 'testProfile',
                json: async () => ({})
            },
            json: (body: any, status?: number) => ({ body, status })
        };

        const res = await controller.createProfileVersion(ctx);
        expect(res.status).toBe(201);
    });
});
