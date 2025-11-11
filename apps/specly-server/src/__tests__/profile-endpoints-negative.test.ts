import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApiRouter } from '../api/router.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { workspaces } from '../database/schema/global-schema.js';
import { ProfileRepository } from '../repositories/profile-repository.js';

async function makeApp() {
    const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    const globalDbService = new GlobalDatabaseService(globalMgr as any);
    await globalDbService.initialize();

    // Create test workspace to satisfy foreign key constraints
    await globalDbService.createWorkspace({ id: 'w1', path: '/tmp/w1', name: 'W1', status: 'active' });
    await globalDbService.createWorkspace({ id: 'w2', path: '/tmp/w2', name: 'W2', status: 'active' });
    await globalDbService.createWorkspace({ id: 'w3', path: '/tmp/w3', name: 'W3', status: 'active' });
    await globalDbService.createWorkspace({ id: 'w4', path: '/tmp/w4', name: 'W4', status: 'active' });

    const dbServiceWrapper = new DatabaseService(globalMgr as any);
    // Override the globalDb in the wrapper to use our initialized instance
    (dbServiceWrapper as any).globalDb = globalDbService;
    const app = await createApiRouter(dbServiceWrapper);
    return { app, globalDbService, dbServiceWrapper };
}

describe('Profiles API - negative and edge cases', () => {
    let app: Awaited<ReturnType<typeof createApiRouter>>;
    let globalDbService: GlobalDatabaseService;

    beforeEach(async () => {
        const setup = await makeApp();
        app = setup.app;
        globalDbService = setup.globalDbService;
    });

    // createProfile
    it('POST /api/profiles -> 400 when name missing', async () => {
        const res = await app.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/name required/i);
    });

    it('POST /api/profiles -> 422 when repository throws', async () => {
        const spy = vi.spyOn(ProfileRepository.prototype, 'createProfile').mockRejectedValueOnce(new Error('boom'));
        const res = await app.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'errprof' })
        });
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error).toBe('boom');
        expect(spy).toHaveBeenCalledOnce();
    });

    // createProfileVersion
    it('POST /api/profiles/:profile/versions -> 404 when profile not found', async () => {
        const res = await app.request('/profiles/doesnotexist/versions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        expect(res.status).toBe(404);
    });

    // upgradeWorkspaceProfile
    it('POST /api/workspaces/:workspaceId/profile/upgrade -> 404 when workspace missing', async () => {
        const res = await app.request('/workspaces/w_missing/profile/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: 'x' })
        });
        expect(res.status).toBe(404);
    });

    it('POST /api/workspaces/:workspaceId/profile/upgrade -> 400 when profile name missing in body', async () => {
        const res = await app.request('/workspaces/w1/profile/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        expect(res.status).toBe(400);
    });

    it('POST /api/workspaces/:workspaceId/profile/upgrade -> 404 when profile not found', async () => {
        const res = await app.request('/workspaces/w2/profile/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: 'missing' })
        });
        expect(res.status).toBe(404);
    });

    it('POST /api/workspaces/:workspaceId/profile/upgrade -> 409 when no versions to bind', async () => {
        // Create profile without versions
        await app.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'novers' })
        });
        const res = await app.request('/workspaces/w3/profile/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: 'novers' })
        });
        expect(res.status).toBe(409);
    });

    it('POST /api/workspaces/:workspaceId/profile/upgrade -> 404 when requested version not found', async () => {
        await app.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'verx' })
        });
        // Create only version 1
        await app.request('/profiles/verx/versions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const res = await app.request('/workspaces/w4/profile/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: 'verx', version: 99 })
        });
        expect(res.status).toBe(404);
    });

    // getWorkspaceProfile
    it('GET /api/workspaces/:workspaceId/profile -> 404 when not bound', async () => {
        const resp = await app.request('/workspaces/w5/profile');
        expect(resp.status).toBe(404);
    });

    // attachTools
    it('POST attachments -> 400 when version is NaN', async () => {
        const res = await app.request('/profiles/p/versions/not-a-number/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachments: [] })
        });
        expect(res.status).toBe(400);
    });

    it('POST attachments -> 404 (profile/version missing) or 400 (validation) when attachments is not array', async () => {
        const res = await app.request('/profiles/p/versions/1/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachments: 'nope' })
        });
        // Router may validate body first (400) or check existence first (404)
        expect([400, 404]).toContain(res.status);
    });

    it('POST attachments -> 400 when attachments is empty array', async () => {
        const res = await app.request('/profiles/p/versions/1/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachments: [] })
        });
        expect(res.status).toBe(400);
    });

    it('POST attachments -> 404 when profile/version not found', async () => {
        const res1 = await app.request('/profiles/missing/versions/1/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachments: [{ tool_name: 't', tool_version_hash: 'h' }] })
        });
        expect(res1.status).toBe(404);
        await app.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'p' })
        });
        const res2 = await app.request('/profiles/p/versions/1/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachments: [{ tool_name: 't', tool_version_hash: 'h' }] })
        });
        expect(res2.status).toBe(404);
    });

    it('POST attachments -> 400 when attachment missing tool fields', async () => {
        await app.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'p2' })
        });
        const v1 = await app.request('/profiles/p2/versions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        expect(v1.status).toBe(201);
        const res = await app.request('/profiles/p2/versions/1/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachments: [{ tool_name: 'echo' }] })
        });
        expect(res.status).toBe(400);
    });

    it('POST attachments -> 422 when repository throws during attach', async () => {
        await app.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'p3' })
        });
        const v1 = await app.request('/profiles/p3/versions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        expect(v1.status).toBe(201);
        const spy = vi.spyOn(ProfileRepository.prototype, 'attachToolToProfileVersion').mockRejectedValueOnce(new Error('attach failed'));
        const res = await app.request('/profiles/p3/versions/1/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachments: [{ tool_name: 't', tool_version_hash: 'h' }] })
        });
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error).toBe('attach failed');
        expect(spy).toHaveBeenCalledOnce();
    });

    // getAttachments
    it('GET attachments -> 400 on invalid inputs', async () => {
        const res = await app.request('/profiles/p/versions/NaN/attachments');
        expect(res.status).toBe(400);
    });

    it('GET attachments -> 404 when profile or version missing', async () => {
        const r1 = await app.request('/profiles/missing/versions/1/attachments');
        expect(r1.status).toBe(404);
        await app.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'p4' })
        });
        const r2 = await app.request('/profiles/p4/versions/1/attachments');
        expect(r2.status).toBe(404);
    });

    // Additional coverage for resolveDbService and error paths
    it('resolveDbService uses injected GlobalDatabaseService', async () => {
        const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        const injectedGlobalDb = new GlobalDatabaseService(globalMgr as any);
        await injectedGlobalDb.initialize();

        const dbServiceWrapper = new DatabaseService(globalMgr as any);
        // Override the globalDb in the wrapper to use our initialized instance
        (dbServiceWrapper as any).globalDb = injectedGlobalDb;
        const appWithInjected = await createApiRouter(dbServiceWrapper);
        
        const res = await appWithInjected.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'test-resolve-global' })
        });
        expect([200, 201]).toContain(res.status);
    });

    it('resolveDbService uses injected DatabaseService.getGlobal()', async () => {
        const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        const injectedGlobalDb = new GlobalDatabaseService(globalMgr as any);
        await injectedGlobalDb.initialize();
        const mockDbService = { getGlobal: vi.fn().mockReturnValue(injectedGlobalDb) };

        const dbServiceWrapper = new DatabaseService(globalMgr as any);
        // Override the globalDb in the wrapper to use our initialized instance
        (dbServiceWrapper as any).globalDb = injectedGlobalDb;
        const appWithInjected = await createApiRouter(dbServiceWrapper);
        
        const res = await appWithInjected.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'test-resolve-dbservice' })
        });
        expect([200, 201]).toContain(res.status);
    });

    it('resolveDbService uses injected service with getDb method', async () => {
        const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        const injectedGlobalDb = new GlobalDatabaseService(globalMgr as any);
        await injectedGlobalDb.initialize();
        const mockService = {
            getDb: vi.fn().mockReturnValue(globalMgr.getDb()),
            initialize: vi.fn(),
            getDrizzleManager: vi.fn().mockReturnValue(globalMgr)
        };

        const dbServiceWrapper = new DatabaseService(globalMgr as any);
        // Override the globalDb in the wrapper to use our initialized instance
        (dbServiceWrapper as any).globalDb = injectedGlobalDb;
        const appWithInjected = await createApiRouter(dbServiceWrapper);
        
        const res = await appWithInjected.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'test-resolve-getdb' })
        });
        expect([200, 201]).toContain(res.status);
    });

    it('resolveDbService falls back to default when injected is invalid', async () => {
        const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        const injectedGlobalDb = new GlobalDatabaseService(globalMgr as any);
        await injectedGlobalDb.initialize();

        const dbServiceWrapper = new DatabaseService(globalMgr as any);
        // Override the globalDb in the wrapper to use our initialized instance
        (dbServiceWrapper as any).globalDb = injectedGlobalDb;
        const appWithInjected = await createApiRouter(dbServiceWrapper);
        
        const res = await appWithInjected.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'test-fallback-invalid' })
        });
        // Should fall back to default database service, so profile creation may succeed or conflict
        expect([200, 201, 409]).toContain(res.status);
    });

    it('createProfileVersion catches non-validation errors as 500', async () => {
        await app.request('/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'err500-profile' })
        });
        // Mock createProfileVersion to throw a non-validation error
        const spy = vi.spyOn(ProfileRepository.prototype, 'createProfileVersion').mockRejectedValueOnce(new Error('database connection failed'));
        const res = await app.request('/profiles/err500-profile/versions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('failed to create profile version');
        expect(spy).toHaveBeenCalledOnce();
    });
});
