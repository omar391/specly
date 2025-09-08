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

describe('Profile & Workspace Binding Endpoints (SP-015)', () => {
  it('creates a profile and rejects duplicate name (409)', async () => {
    const { app } = makeApp();
    const res1 = await request(app).post('/api/profiles').send({ name: 'dev', description: 'Dev Profile' });
    expect([200, 201]).toContain(res1.status);
    const res2 = await request(app).post('/api/profiles').send({ name: 'dev' });
    expect(res2.status).toBe(409);
  });

  it('increments profile version on creation', async () => {
    const { app } = makeApp();
    await request(app).post('/api/profiles').send({ name: 'verprof' });
    const v1 = await request(app).post('/api/profiles/verprof/versions').send({});
    expect(v1.status).toBe(201);
    expect(v1.body.version).toBe(1);
    const v2 = await request(app).post('/api/profiles/verprof/versions').send({});
    expect(v2.status).toBe(201);
    expect(v2.body.version).toBe(2);
  });

  it('upgrades workspace binding to latest version and GET returns it', async () => {
    const { app, globalDbService } = makeApp();
    await globalDbService.initialize();
    const db = globalDbService.getDrizzleManager().getDb();
    // create a workspace row to allow upgrade
    await db.insert(workspaces).values({ id: 'w1', path: '/tmp/w1', name: 'W1', status: 'active' } as any);

    await request(app).post('/api/profiles').send({ name: 'bindprof' });
    await request(app).post('/api/profiles/bindprof/versions').send({});
    await request(app).post('/api/profiles/bindprof/versions').send({}); // latest is version 2

    const up = await request(app).post('/api/workspaces/w1/profile/upgrade').send({ profile: 'bindprof' });
    expect(up.status).toBe(200);
    expect(up.body.workspace_id).toBe('w1');
    expect(up.body.profile_version_id).toBeTruthy();

    const getb = await request(app).get('/api/workspaces/w1/profile');
    expect(getb.status).toBe(200);
    expect(getb.body.workspace_id).toBe('w1');
    expect(getb.body.profile_version_id).toBe(up.body.profile_version_id);
  });
});
