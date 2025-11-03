import { describe, it, expect } from 'vitest';
import express from 'express';
import bodyParser from 'body-parser';
import request from 'supertest';
import { createApiRouter } from '../api/router.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { v4 as uuid } from 'uuid';
import { sessions, workspaces } from '../database/schema/global-schema.js';
import { eq } from 'drizzle-orm';

async function makeApp() {
    const app = express();
    app.use(bodyParser.json());
    const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    const globalDbService = new GlobalDatabaseService(globalMgr as any);
    const dbServiceWrapper = new DatabaseService(globalMgr as any);
    // Initialize DB
    // @ts-ignore
    app.locals.dbService = globalDbService;
    app.use('/api', await createApiRouter(dbServiceWrapper));
    return { app, globalDbService };
}

describe('GET /api/sessions', () => {
    it('returns empty list when no sessions', async () => {
        const { app } = await makeApp();
        const res = await request(app).get('/api/sessions');
        expect(res.status).toBe(200);
        expect(res.body?.data?.sessions).toEqual([]);
    });

    it('lists sessions filtered by workspace_id', async () => {
        const { app, globalDbService } = await makeApp();
        await globalDbService.initialize();
        const db = globalDbService.getDrizzleManager().getDb();
        const w1 = { id: uuid(), path: '/tmp/ws1', name: 'WS1', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const w2 = { id: uuid(), path: '/tmp/ws2', name: 'WS2', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await db.insert(workspaces).values([w1 as any, w2 as any]);
        const s1 = { id: uuid(), workspaceId: w1.id, isActive: 1, createdAt: new Date().toISOString(), lastActivity: new Date().toISOString() };
        const s2 = { id: uuid(), workspaceId: w2.id, isActive: 0, createdAt: new Date().toISOString(), lastActivity: new Date().toISOString() };
        await db.insert(sessions).values([s1 as any, s2 as any]);

        const all = await request(app).get('/api/sessions');
        expect(all.status).toBe(200);
        expect(all.body.data.sessions.length).toBe(2);

        const onlyW1 = await request(app).get('/api/sessions').query({ workspace_id: w1.id });
        expect(onlyW1.status).toBe(200);
        expect(onlyW1.body.data.sessions.length).toBe(1);
        expect(onlyW1.body.data.sessions[0].workspace_id).toBe(w1.id);
        expect(typeof onlyW1.body.data.sessions[0].is_active).toBe('boolean');
    });
});
