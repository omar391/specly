import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { createApiRouter } from '../api/router.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';

function makeApp() {
    const app = express();
    app.use(bodyParser.json());
    const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    const globalDbService = new GlobalDatabaseService(globalMgr as any);
    (app as any).locals.dbService = globalDbService; // used by specs/tools controllers
    const dbServiceWrapper = new DatabaseService(globalMgr as any); // satisfies router signature
    app.use('/api', createApiRouter(dbServiceWrapper));
    return app;
}

describe('Spec & Tool Endpoints (SP-014)', () => {
    it('creates tool, spec, and tool version then idempotently re-posts', async () => {
        const app = makeApp();
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
        const app = makeApp();
        await request(app).post('/api/tools').send({ name: 't2_case2' });
        const res = await request(app).post('/api/tools/t2_case2/versions').send({ ordered_specs: ['missing'], entry_spec: 'missing', edges: [] });
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('GRAPH_MISSING_NODE');
    });

    it('rejects invalid cyclic graph', async () => {
        const app = makeApp();
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
});
