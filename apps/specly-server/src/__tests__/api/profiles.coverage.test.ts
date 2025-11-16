import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ProfilesController (coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('createProfile returns 400 when name missing', async () => {
    const { ProfilesController } = await import('../../api/profiles.js');
    const controller = new ProfilesController({ initialize: async () => {} } as any);
    const ctx: any = { req: { json: async () => ({ description: 'x' }) }, json: (body: any, status?: number) => ({ body, status }) };
    const res = await controller.createProfile(ctx as any);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name required');
  });

  it('createProfile uses injected GlobalDatabaseService instance', async () => {
    // Mock modules to provide classes/functions used by the controller
    vi.doMock('../../database/global-queries.js', () => {
      class GlobalDatabaseService {
        initialized = false;
        async initialize() { this.initialized = true; }
        getDrizzleManager() { return { getDb: () => ({}) }; }
        async getWorkspace() { return null; }
      }
      return { GlobalDatabaseService, getGlobalDatabaseService: () => new GlobalDatabaseService() };
    });

    const createProfileResult = { created: true, profile: { id: 'p1', name: 'P1' } };
    vi.doMock('../../repositories/profile-repository.js', () => {
      return {
        ProfileRepository: class ProfileRepository {
          db: any;
          constructor(db: any) { this.db = db; }
          async createProfile() { return createProfileResult; }
        }
      };
    });

    const { ProfilesController } = await import('../../api/profiles.js');

    // Provide a context where env.dbService is an instance of GlobalDatabaseService
    const { GlobalDatabaseService } = await import('../../database/global-queries.js');
    const injected = new GlobalDatabaseService();

    const controller = new ProfilesController();
    const ctx: any = {
      env: { dbService: injected },
      req: { json: async () => ({ name: 'MyProfile', description: 'd' }) },
      json: (body: any, status?: number) => ({ body, status })
    };

    const res = await controller.createProfile(ctx as any);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('p1');
  });

  it('createProfile handles repository throw and returns 422', async () => {
    vi.doMock('../../database/global-queries.js', () => {
      class GlobalDatabaseService { async initialize() {} getDrizzleManager(){ return { getDb: () => ({}) }; } async getWorkspace(){return null;} }
      return { GlobalDatabaseService, getGlobalDatabaseService: () => new GlobalDatabaseService() };
    });

    vi.doMock('../../repositories/profile-repository.js', () => {
      return {
        ProfileRepository: class ProfileRepository {
          constructor(db: any) {}
          async createProfile() { throw new Error('validation failed'); }
        }
      };
    });

    const { ProfilesController } = await import('../../api/profiles.js');
    const controller = new ProfilesController();
    const ctx: any = { env: {}, req: { json: async () => ({ name: 'x' }) }, json: (b: any, s?: number) => ({ body: b, status: s }) };
    const res = await controller.createProfile(ctx as any);
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('validation');
  });
});
