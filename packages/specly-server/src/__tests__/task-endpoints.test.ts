import { describe, it, expect } from 'vitest';
import express from 'express';
import bodyParser from 'body-parser';
import request from 'supertest';
import { createApiRouter } from '../api/router.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { workspaces } from '../database/schema/global-schema.js';

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

describe('Task Endpoints (SP-016 minimal slice)', () => {
    it('creates a task, fetches it, and performs valid/invalid status transitions', async () => {
        const { app, globalDbService } = await makeApp();
        await globalDbService.initialize();
        const db = globalDbService.getDrizzleManager().getDb();

        // Seed a workspace
        await db.insert(workspaces).values({ id: 'w1', path: '/tmp/w1', name: 'W1', status: 'active' } as any);

        // Create task
        const createRes = await request(app)
            .post('/api/workspaces/w1/tasks')
            .send({ title: 'T1', description: 'Do something', priority: 'high' });
        expect(createRes.status).toBe(201);
        const task = createRes.body.data.task;
        expect(task).toBeTruthy();
        expect(task.id).toMatch(/^TP-/);
        expect(task.status).toBe('queued');
        expect(task.priority).toBe('high');

        // GET single task
        const getRes = await request(app).get(`/api/workspaces/w1/tasks/${task.id}`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.data.task.id).toBe(task.id);

        // Invalid transition: backlog -> done
        const badTransition = await request(app)
            .patch(`/api/workspaces/w1/tasks/${task.id}/status`)
            .send({ status: 'completed' });
        expect(badTransition.status).toBe(422);

        // Valid transition: backlog -> in-progress
        const toInProgress = await request(app)
            .patch(`/api/workspaces/w1/tasks/${task.id}/status`)
            .send({ status: 'in_progress' });
        expect(toInProgress.status).toBe(200);
        expect(toInProgress.body.data.task.status).toBe('in_progress');

        // Valid transition: in-progress -> done (sets completed_at)
        const toDone = await request(app)
            .patch(`/api/workspaces/w1/tasks/${task.id}/status`)
            .send({ status: 'completed' });
        expect(toDone.status).toBe(200);
        expect(toDone.body.data.task.status).toBe('completed');
        expect(toDone.body.data.task.completed_at).toBeTruthy();

        // 404 for unknown task
        const notFound = await request(app)
            .get(`/api/workspaces/w1/tasks/TP-unknown`);
        expect(notFound.status).toBe(404);
    });
});
