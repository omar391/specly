import { describe, it, expect } from 'vitest';
import { testClient } from 'hono/testing';
import { createApiRouter } from '../api/router.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { workspaces } from '../database/schema/global-schema.js';

async function makeApp() {
    const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    const globalDbService = new GlobalDatabaseService(globalMgr as any);
    const dbServiceWrapper = new DatabaseService(globalMgr as any);
    const app = await createApiRouter(dbServiceWrapper);
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
        const createRes = await app.request('/workspaces/w1/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'T1', description: 'Do something', priority: 'high' })
        });
        expect(createRes.status).toBe(201);
        const responseBody = await createRes.json();
        const task = responseBody.data.task;
        expect(task).toBeTruthy();
        expect(task.id).toMatch(/^TP-/);
        expect(task.status).toBe('queued');
        expect(task.priority).toBe('high');

        // GET single task
        const getRes = await app.request(`/workspaces/w1/tasks/${task.id}`);
        expect(getRes.status).toBe(200);
        const getBody = await getRes.json();
        expect(getBody.data.task.id).toBe(task.id);

        // Invalid transition: queued -> done
        const badTransition = await app.request(`/workspaces/w1/tasks/${task.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' })
        });
        expect(badTransition.status).toBe(422);

        // Valid transition: queued -> in-progress
        const toInProgress = await app.request(`/workspaces/w1/tasks/${task.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'in_progress' })
        });
        expect(toInProgress.status).toBe(200);
        const inProgressBody = await toInProgress.json();
        expect(inProgressBody.data.task.status).toBe('in_progress');

        // Valid transition: in-progress -> done (sets completed_at)
        const toDone = await app.request(`/workspaces/w1/tasks/${task.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' })
        });
        expect(toDone.status).toBe(200);
        const doneBody = await toDone.json();
        expect(doneBody.data.task.status).toBe('completed');
        expect(doneBody.data.task.completed_at).toBeTruthy();

        // 404 for unknown task
        const notFound = await app.request('/workspaces/w1/tasks/TP-unknown');
        expect(notFound.status).toBe(404);
    });
});
