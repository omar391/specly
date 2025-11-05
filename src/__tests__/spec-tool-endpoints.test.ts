import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { createApiRouter } from '../api/router.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';

async function makeApp() {
    const app = express();
    app.use(bodyParser.json());
    const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    const globalDbService = new GlobalDatabaseService(globalMgr as any);
    (app as any).locals.dbService = globalDbService; // used by specs/tools controllers
    const dbServiceWrapper = new DatabaseService(globalMgr as any); // satisfies router signature
    app.use('/api', await createApiRouter(dbServiceWrapper));
    return app;
}

describe('Spec & Tool Endpoints (SP-014)', () => {
    it('creates tool, spec, and tool version then idempotently re-posts', async () => {
        const app = await makeApp();
        const toolRes = await request(app).post('/api/tools').send({ name: 'demo_tool_case1', description: 'Demo' });
        expect([200, 201]).toContain(toolRes.status);

        const specBody = {
            executor_type: 'noop',
            executor_version: '1',
            intent: 'autonomous',
            side_effect: true,
            content_template: 'Hello',
            metadata: { label: 'A' }
        };
        const specRes = await request(app).post('/api/specs').send(specBody);
        expect([200, 201]).toContain(specRes.status);
        const specHash = specRes.body.hash;
        expect(specHash).toBeTruthy();

        // Idempotent create
        const specRes2 = await request(app).post('/api/specs').send(specBody);
        expect(specRes2.body.created).toBe(false);
        expect(specRes2.body.hash).toBe(specHash);

        const versionRes = await request(app).post('/api/tools/demo_tool_case1/versions').send({
            ordered_specs: [specHash],
            entry_spec: specHash,
            edges: []
        });
        expect([200, 201]).toContain(versionRes.status);
        const versionHash = versionRes.body.hash;
        expect(versionHash).toBeTruthy();

        // Repost idempotent
        const versionRes2 = await request(app).post('/api/tools/demo_tool_case1/versions').send({
            ordered_specs: [specHash],
            entry_spec: specHash,
            edges: []
        });
        expect(versionRes2.body.created).toBe(false);
        expect(versionRes2.body.hash).toBe(versionHash);
    });

    it('rejects creating tool version referencing missing spec', async () => {
        const app = await makeApp();
        await request(app).post('/api/tools').send({ name: 't2_case2' });
        const res = await request(app).post('/api/tools/t2_case2/versions').send({ ordered_specs: ['missing'], entry_spec: 'missing', edges: [] });
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('GRAPH_MISSING_NODE');
    });

    it('rejects invalid cyclic graph', async () => {
        const app = await makeApp();
        // create specs
        const s1 = await request(app).post('/api/specs').send({ executor_type: 'noop', executor_version: '1', intent: 'autonomous' });
        const s2 = await request(app).post('/api/specs').send({ executor_type: 'noop', executor_version: '1', intent: 'human' });
        const h1 = s1.body.hash; const h2 = s2.body.hash;
        await request(app).post('/api/tools').send({ name: 'cyc_case3' });
        const res = await request(app).post('/api/tools/cyc_case3/versions').send({
            ordered_specs: [h1, h2],
            entry_spec: h1,
            edges: [{ from: h1, to: h2, condition_type: 'always' }, { from: h2, to: h1, condition_type: 'always' }]
        });
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('GRAPH_CYCLE');
    });

    it('rejects spec creation with missing required fields', async () => {
        const app = await makeApp();

        // Missing executor_type
        const res1 = await request(app).post('/api/specs').send({ executor_version: '1', intent: 'autonomous' });
        expect(res1.status).toBe(400);
        expect(res1.body.error).toMatch(/Missing required spec fields/);

        // Missing executor_version
        const res2 = await request(app).post('/api/specs').send({ executor_type: 'noop', intent: 'autonomous' });
        expect(res2.status).toBe(400);
        expect(res2.body.error).toMatch(/Missing required spec fields/);

        // Missing intent
        const res3 = await request(app).post('/api/specs').send({ executor_type: 'noop', executor_version: '1' });
        expect(res3.status).toBe(400);
        expect(res3.body.error).toMatch(/Missing required spec fields/);
    });

    it('rejects spec creation with invalid executor_type', async () => {
        const app = await makeApp();
        const res = await request(app).post('/api/specs').send({
            executor_type: 'invalid_executor',
            executor_version: '1',
            intent: 'autonomous'
        });
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('ERR_INVALID_EXECUTOR_TYPE');
    });

    it('rejects tool creation with missing name', async () => {
        const app = await makeApp();
        const res = await request(app).post('/api/tools').send({ description: 'Test tool' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('name required');
    });

    it('rejects tool creation with duplicate name', async () => {
        const app = await makeApp();
        await request(app).post('/api/tools').send({ name: 'duplicate_tool' });
        const res = await request(app).post('/api/tools').send({ name: 'duplicate_tool' });
        expect(res.status).toBe(409);
        expect(res.body.error).toBe('tool exists');
    });

    it('rejects tool creation with duplicate command_alias', async () => {
        const app = await makeApp();
        await request(app).post('/api/tools').send({ name: 'tool1', command_alias: 'alias1' });
        const res = await request(app).post('/api/tools').send({ name: 'tool2', command_alias: 'alias1' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ERR_COMMAND_ALIAS_CONFLICT');
    });

    it('rejects tool version creation with missing ordered_specs', async () => {
        const app = await makeApp();
        await request(app).post('/api/tools').send({ name: 'test_tool' });
        const res = await request(app).post('/api/tools/test_tool/versions').send({ entry_spec: 'hash' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/ordered_specs.*entry_spec required/);
    });

    it('rejects tool version creation with missing entry_spec', async () => {
        const app = await makeApp();
        await request(app).post('/api/tools').send({ name: 'test_tool' });
        const res = await request(app).post('/api/tools/test_tool/versions').send({ ordered_specs: ['hash'] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/ordered_specs.*entry_spec required/);
    });

    it('rejects tool version creation for non-existent tool', async () => {
        const app = await makeApp();
        const res = await request(app).post('/api/tools/nonexistent/versions').send({
            ordered_specs: ['hash'],
            entry_spec: 'hash',
            edges: []
        });
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('tool not found');
    });
});
