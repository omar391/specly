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

  it('attaches tool versions to a profile version and handles duplicates', async () => {
    const { app } = makeApp();
    // Create tool + spec + version
    const specBody = {
      executor_type: 'node',
      executor_version: '1',
      intent: 'autonomous',
      side_effect: false,
      content_template: 'run',
      static_params: {},
      input_schema: null,
      output_schema: null,
      idempotency_key_template: null,
      retry_policy: null,
      show_output: true,
      security: null,
      metadata: {}
    };
    const spec = await request(app).post('/api/specs').send(specBody);
    expect([200,201]).toContain(spec.status);
    const specHash = spec.body.hash;
    const toolMake = await request(app).post('/api/tools').send({ name: 'echo', description: 'Echo tool' });
    expect([200,201,409]).toContain(toolMake.status);
    const tv = await request(app).post('/api/tools/echo/versions').send({ ordered_specs: [specHash], entry_spec: specHash, edges: [] });
    expect([200,201]).toContain(tv.status);
    const toolVersionHash = tv.body.hash;

    // Create profile + version
    await request(app).post('/api/profiles').send({ name: 'pubprof' });
    const v1 = await request(app).post('/api/profiles/pubprof/versions').send({});
    expect(v1.status).toBe(201);
    expect(v1.body.version).toBe(1);

    // Attach tool version
    const attach1 = await request(app)
      .post('/api/profiles/pubprof/versions/1/attachments')
      .send({ attachments: [{ tool_name: 'echo', tool_version_hash: toolVersionHash }] });
    expect(attach1.status).toBe(201);
    expect(attach1.body.attachments.length).toBe(1);
    expect(attach1.body.attachments[0].toolName).toBe('echo');

    // Duplicate attach is a no-op and returns created=false in per-item
    const attach2 = await request(app)
      .post('/api/profiles/pubprof/versions/1/attachments')
      .send({ attachments: [{ tool_name: 'echo', tool_version_hash: toolVersionHash }] });
    expect(attach2.status).toBe(201);
    const createdFlags = attach2.body.attached.map((a: any) => a.created);
    expect(createdFlags).toEqual([false]);
    // GET attachments
    const getAtt = await request(app).get('/api/profiles/pubprof/versions/1/attachments');
    expect(getAtt.status).toBe(200);
    expect(Array.isArray(getAtt.body.attachments)).toBe(true);
    expect(getAtt.body.attachments.length).toBe(1);
    expect(getAtt.body.attachments[0].toolName).toBe('echo');
  });

  it('rejects creating a profile version with missing parent_profile_version_id', async () => {
    const { app } = makeApp();
    await request(app).post('/api/profiles').send({ name: 'p1' });
    const v1 = await request(app).post('/api/profiles/p1/versions').send({});
    expect(v1.status).toBe(201);
    const bad = await request(app).post('/api/profiles/p1/versions').send({ parent_profile_version_id: 'does-not-exist' });
    expect(bad.status).toBe(422);
  });

  it('rejects parent_profile_version_id from a different profile', async () => {
    const { app } = makeApp();
    await request(app).post('/api/profiles').send({ name: 'a' });
    await request(app).post('/api/profiles').send({ name: 'b' });
    const a1 = await request(app).post('/api/profiles/a/versions').send({});
    expect(a1.status).toBe(201);
    const bad = await request(app).post('/api/profiles/b/versions').send({ parent_profile_version_id: a1.body.id });
    expect(bad.status).toBe(422);
  });
});
