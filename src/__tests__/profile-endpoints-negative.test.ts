import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import bodyParser from 'body-parser';
import request from 'supertest';
import { createApiRouter } from '../api/router.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { workspaces } from '../database/schema/global-schema.js';
import { ProfileRepository } from '../repositories/profile-repository.js';

async function makeApp() {
    const app = express();
    app.use(bodyParser.json());
    const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    const globalDbService = new GlobalDatabaseService(globalMgr as any);
    (app as any).locals.dbService = globalDbService;
    const dbServiceWrapper = new DatabaseService(globalMgr as any);
    app.use('/api', await createApiRouter(dbServiceWrapper));
    return { app, globalDbService };
}

describe('Profiles API - negative and edge cases', () => {
    let app: express.Express;
    let globalDbService: GlobalDatabaseService;

    beforeEach(async () => {
        const setup = await makeApp();
        app = setup.app;
        globalDbService = setup.globalDbService;
        await globalDbService.initialize();
    });

    // createProfile
    it('POST /api/profiles -> 400 when name missing', async () => {
        const res = await request(app).post('/api/profiles').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/name required/i);
    });

    it('POST /api/profiles -> 422 when repository throws', async () => {
        const spy = vi.spyOn(ProfileRepository.prototype, 'createProfile').mockRejectedValueOnce(new Error('boom'));
        const res = await request(app).post('/api/profiles').send({ name: 'errprof' });
        expect(res.status).toBe(422);
        expect(res.body.error).toBe('boom');
        expect(spy).toHaveBeenCalledOnce();
    });

    // createProfileVersion
    it('POST /api/profiles/:profile/versions -> 404 when profile not found', async () => {
        const res = await request(app).post('/api/profiles/doesnotexist/versions').send({});
        expect(res.status).toBe(404);
    });

    // upgradeWorkspaceProfile
    it('POST /api/workspaces/:workspaceId/profile/upgrade -> 404 when workspace missing', async () => {
        const res = await request(app).post('/api/workspaces/w_missing/profile/upgrade').send({ profile: 'x' });
        expect(res.status).toBe(404);
    });

    it('POST /api/workspaces/:workspaceId/profile/upgrade -> 400 when profile name missing in body', async () => {
        const db = globalDbService.getDrizzleManager().getDb();
        await db.insert(workspaces).values({ id: 'w1', path: '/tmp/w1', name: 'W1', status: 'active' } as any);
        const res = await request(app).post('/api/workspaces/w1/profile/upgrade').send({});
        expect(res.status).toBe(400);
    });

    it('POST /api/workspaces/:workspaceId/profile/upgrade -> 404 when profile not found', async () => {
        const db = globalDbService.getDrizzleManager().getDb();
        await db.insert(workspaces).values({ id: 'w2', path: '/tmp/w2', name: 'W2', status: 'active' } as any);
        const res = await request(app).post('/api/workspaces/w2/profile/upgrade').send({ profile: 'missing' });
        expect(res.status).toBe(404);
    });

    it('POST /api/workspaces/:workspaceId/profile/upgrade -> 409 when no versions to bind', async () => {
        const db = globalDbService.getDrizzleManager().getDb();
        await db.insert(workspaces).values({ id: 'w3', path: '/tmp/w3', name: 'W3', status: 'active' } as any);
        // Create profile without versions
        await request(app).post('/api/profiles').send({ name: 'novers' });
        const res = await request(app).post('/api/workspaces/w3/profile/upgrade').send({ profile: 'novers' });
        expect(res.status).toBe(409);
    });

    it('POST /api/workspaces/:workspaceId/profile/upgrade -> 404 when requested version not found', async () => {
        const db = globalDbService.getDrizzleManager().getDb();
        await db.insert(workspaces).values({ id: 'w4', path: '/tmp/w4', name: 'W4', status: 'active' } as any);
        await request(app).post('/api/profiles').send({ name: 'verx' });
        // Create only version 1
        await request(app).post('/api/profiles/verx/versions').send({});
        const res = await request(app).post('/api/workspaces/w4/profile/upgrade').send({ profile: 'verx', version: 99 });
        expect(res.status).toBe(404);
    });

    // getWorkspaceProfile
    it('GET /api/workspaces/:workspaceId/profile -> 404 when not bound', async () => {
        const resp = await request(app).get('/api/workspaces/w5/profile');
        expect(resp.status).toBe(404);
    });

    // attachTools
    it('POST attachments -> 400 when version is NaN', async () => {
        const res = await request(app).post('/api/profiles/p/versions/not-a-number/attachments').send({ attachments: [] });
        expect(res.status).toBe(400);
    });

    it('POST attachments -> 404 (profile/version missing) or 400 (validation) when attachments is not array', async () => {
        const res = await request(app).post('/api/profiles/p/versions/1/attachments').send({ attachments: 'nope' });
        // Router may validate body first (400) or check existence first (404)
        expect([400, 404]).toContain(res.status);
    });

    it('POST attachments -> 400 when attachments is empty array', async () => {
        const res = await request(app).post('/api/profiles/p/versions/1/attachments').send({ attachments: [] });
        expect(res.status).toBe(400);
    });

    it('POST attachments -> 404 when profile/version not found', async () => {
        const res1 = await request(app).post('/api/profiles/missing/versions/1/attachments').send({ attachments: [{ tool_name: 't', tool_version_hash: 'h' }] });
        expect(res1.status).toBe(404);
        await request(app).post('/api/profiles').send({ name: 'p' });
        const res2 = await request(app).post('/api/profiles/p/versions/1/attachments').send({ attachments: [{ tool_name: 't', tool_version_hash: 'h' }] });
        expect(res2.status).toBe(404);
    });

    it('POST attachments -> 400 when attachment missing tool fields', async () => {
        await request(app).post('/api/profiles').send({ name: 'p2' });
        const v1 = await request(app).post('/api/profiles/p2/versions').send({});
        expect(v1.status).toBe(201);
        const res = await request(app).post('/api/profiles/p2/versions/1/attachments').send({ attachments: [{ tool_name: 'echo' }] });
        expect(res.status).toBe(400);
    });

    it('POST attachments -> 422 when repository throws during attach', async () => {
        await request(app).post('/api/profiles').send({ name: 'p3' });
        const v1 = await request(app).post('/api/profiles/p3/versions').send({});
        expect(v1.status).toBe(201);
        const spy = vi.spyOn(ProfileRepository.prototype, 'attachToolToProfileVersion').mockRejectedValueOnce(new Error('attach failed'));
        const res = await request(app)
            .post('/api/profiles/p3/versions/1/attachments')
            .send({ attachments: [{ tool_name: 't', tool_version_hash: 'h' }] });
        expect(res.status).toBe(422);
        expect(res.body.error).toBe('attach failed');
        expect(spy).toHaveBeenCalledOnce();
    });

    // getAttachments
    it('GET attachments -> 400 on invalid inputs', async () => {
        const res = await request(app).get('/api/profiles/p/versions/NaN/attachments');
        expect(res.status).toBe(400);
    });

    it('GET attachments -> 404 when profile or version missing', async () => {
        const r1 = await request(app).get('/api/profiles/missing/versions/1/attachments');
        expect(r1.status).toBe(404);
        await request(app).post('/api/profiles').send({ name: 'p4' });
        const r2 = await request(app).get('/api/profiles/p4/versions/1/attachments');
        expect(r2.status).toBe(404);
    });

    // Additional coverage for resolveDbService and error paths
    it('resolveDbService uses injected GlobalDatabaseService', async () => {
        const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        const injectedGlobalDb = new GlobalDatabaseService(globalMgr as any);
        await injectedGlobalDb.initialize();
        
        const appWithInjected = express();
        appWithInjected.use(bodyParser.json());
        (appWithInjected as any).locals.dbService = injectedGlobalDb;
        const dbServiceWrapper = new DatabaseService(globalMgr as any);
        appWithInjected.use('/api', await createApiRouter(dbServiceWrapper));
        
        const res = await request(appWithInjected).post('/api/profiles').send({ name: 'test-resolve-global' });
        expect([200, 201]).toContain(res.status);
    });    it('resolveDbService uses injected DatabaseService.getGlobal()', async () => {
        const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        const injectedGlobalDb = new GlobalDatabaseService(globalMgr as any);
        await injectedGlobalDb.initialize();
        const mockDbService = { getGlobal: vi.fn().mockReturnValue(injectedGlobalDb) };
        
        const appWithInjected = express();
        appWithInjected.use(bodyParser.json());
        (appWithInjected as any).locals.dbService = mockDbService;
        const dbServiceWrapper = new DatabaseService(globalMgr as any);
        appWithInjected.use('/api', await createApiRouter(dbServiceWrapper));
        
        const res = await request(appWithInjected).post('/api/profiles').send({ name: 'test-resolve-dbservice' });
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
        
        const appWithInjected = express();
        appWithInjected.use(bodyParser.json());
        (appWithInjected as any).locals.dbService = mockService;
        const dbServiceWrapper = new DatabaseService(globalMgr as any);
        appWithInjected.use('/api', await createApiRouter(dbServiceWrapper));
        
        const res = await request(appWithInjected).post('/api/profiles').send({ name: 'test-resolve-getdb' });
        expect([200, 201]).toContain(res.status);
    });

    it('resolveDbService falls back to default when injected is invalid', async () => {
        const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        const injectedGlobalDb = new GlobalDatabaseService(globalMgr as any);
        await injectedGlobalDb.initialize();
        
        const appWithInjected = express();
        appWithInjected.use(bodyParser.json());
        (appWithInjected as any).locals.dbService = 'invalid';
        const dbServiceWrapper = new DatabaseService(globalMgr as any);
        appWithInjected.use('/api', await createApiRouter(dbServiceWrapper));
        
        const res = await request(appWithInjected).post('/api/profiles').send({ name: 'test-fallback-invalid' });
        // Should fall back to default database service, so profile creation may succeed or conflict
        expect([200, 201, 409]).toContain(res.status);
    });

    it('createProfileVersion catches non-validation errors as 500', async () => {
        await request(app).post('/api/profiles').send({ name: 'err500-profile' });
        // Mock createProfileVersion to throw a non-validation error
        const spy = vi.spyOn(ProfileRepository.prototype, 'createProfileVersion').mockRejectedValueOnce(new Error('database connection failed'));
        const res = await request(app).post('/api/profiles/err500-profile/versions').send({});
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('failed to create profile version');
        expect(spy).toHaveBeenCalledOnce();
    });
});
