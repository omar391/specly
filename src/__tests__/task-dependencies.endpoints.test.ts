import { describe, it, expect } from 'vitest';
import express from 'express';
import bodyParser from 'body-parser';
import request from 'supertest';
import { createApiRouter } from '../api/router.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { workspaces } from '../database/schema/global-schema.js';

function makeApp() {
  const app = express();
  app.use(bodyParser.json());
  const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
  const globalDbService = new GlobalDatabaseService(globalMgr as any);
  (app as any).locals.dbService = globalDbService;
  const dbServiceWrapper = new DatabaseService(globalMgr as any);
  app.use('/api', createApiRouter(dbServiceWrapper));
  return { app, globalDbService };
}

describe('Task Dependency Endpoints (SP-016)', () => {
  it('adds/removes/lists dependencies and enforces transition guard', async () => {
    const { app, globalDbService } = makeApp();
    await globalDbService.initialize();
    const db = globalDbService.getDrizzleManager().getDb();
    // Seed workspace
    await db.insert(workspaces).values({ id: 'wdep', path: '/tmp/wdep', name: 'WDEP', status: 'active' } as any);

    // Create three tasks: A, B, C
    const create = async (title: string) => {
      const res = await request(app).post('/api/workspaces/wdep/tasks').send({ title, description: title, priority: 'medium' });
      expect(res.status).toBe(201);
      return res.body.data.task.id as string;
    };
    const A = await create('A');
    const B = await create('B');
    const C = await create('C');

    // Add deps: A depends on B, B depends on C
    let r = await request(app).post(`/api/workspaces/wdep/tasks/${A}/dependencies`).send({ depends_on: B });
    expect(r.status).toBe(201);
    r = await request(app).post(`/api/workspaces/wdep/tasks/${B}/dependencies`).send({ depends_on: C });
    expect(r.status).toBe(201);

    // Self-dependency rejected
    r = await request(app).post(`/api/workspaces/wdep/tasks/${A}/dependencies`).send({ depends_on: A });
    expect(r.status).toBe(422);

    // Cycle detection: C cannot depend on A
    r = await request(app).post(`/api/workspaces/wdep/tasks/${C}/dependencies`).send({ depends_on: A });
    expect(r.status).toBe(422);

    // List A deps => [B]
    r = await request(app).get(`/api/workspaces/wdep/tasks/${A}/dependencies`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.dependencies)).toBe(true);
    expect(r.body.data.dependencies.find((d: any) => d.depends_on_task_id === B)).toBeTruthy();

    // Guard: A cannot move to in_progress while B incomplete
    let s = await request(app).patch(`/api/workspaces/wdep/tasks/${A}/status`).send({ status: 'in_progress' });
    expect(s.status).toBe(422);

    // Complete C then B then A should be allowed progressively
    s = await request(app).patch(`/api/workspaces/wdep/tasks/${C}/status`).send({ status: 'in_progress' });
    expect(s.status).toBe(200);
    s = await request(app).patch(`/api/workspaces/wdep/tasks/${C}/status`).send({ status: 'completed' });
    expect(s.status).toBe(200);

    // B still blocked by C? Now should be unblocked
    s = await request(app).patch(`/api/workspaces/wdep/tasks/${B}/status`).send({ status: 'in_progress' });
    expect(s.status).toBe(200);
    s = await request(app).patch(`/api/workspaces/wdep/tasks/${B}/status`).send({ status: 'completed' });
    expect(s.status).toBe(200);

    // Now A can start
    s = await request(app).patch(`/api/workspaces/wdep/tasks/${A}/status`).send({ status: 'in_progress' });
    expect(s.status).toBe(200);

    // Remove dependency and list
    r = await request(app).delete(`/api/workspaces/wdep/tasks/${A}/dependencies/${B}`);
    expect(r.status).toBe(204);
    r = await request(app).get(`/api/workspaces/wdep/tasks/${A}/dependencies`);
    expect(r.status).toBe(200);
  });
});
