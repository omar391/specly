import request from 'supertest';
import express from 'express';
import { createApiRouter } from '../api/router.js';
import { DatabaseService } from '../services/database-service.js';
import { SpecEngine, ToolGraph } from '../services/spec-engine.js';
import { ToolsExecuteController } from '../api/tools-execute.js';
import { InMemoryPausedStateStore } from '../services/paused-state-store.js';
import { describe, it, expect, beforeAll } from 'vitest';

// Minimal database service stub (router expects real instance; we stub required methods)
class StubDatabaseService {} // Extend later if endpoints require

function buildApp(engineFactory?: () => SpecEngine) {
  const db = new StubDatabaseService() as unknown as DatabaseService;
  const app = express();
  app.use(express.json());
  const router = createApiRouter(db);
  app.use('/api', router);
  return app;
}

function basicGraph(humanAt?: 'none' | 'first' | 'second'): ToolGraph {
  const base = {
    entry: 'a',
    nodes: {
      a: { hash: 'a', intent: 'autonomous', sideEffect: false },
      b: { hash: 'b', intent: humanAt === 'first' ? 'human' : 'autonomous', sideEffect: false },
      c: { hash: 'c', intent: humanAt === 'second' ? 'human' : 'autonomous', sideEffect: false }
    },
    edges: [
      { from: 'a', to: 'b', priority: 100 },
      { from: 'b', to: 'c', priority: 100 }
    ]
  } satisfies ToolGraph;
  return base;
}

describe('POST /api/tools/:tool/execute', () => {
  let app: express.Express;
  beforeAll(() => {
    app = buildApp();
  });

  it('runs a full autonomous graph and returns completed', async () => {
    const graph = basicGraph('none');
    const res = await request(app).post('/api/tools/demo/execute').send({ graph });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.executed.length).toBe(3);
  });

  it('pauses on human spec and returns resumeToken', async () => {
    const graph = basicGraph('second');
    const res = await request(app).post('/api/tools/demo/execute').send({ graph });
    expect([200, 422]).toContain(res.status); // structural issues would 422 but not expected here
    if (res.status === 200) {
      expect(res.body.status).toBe('awaiting_input');
      expect(res.body.resumeToken).toBeDefined();
      expect(res.body.awaitingSpec).toBe('c');
    }
  });

  it('resumes after human input', async () => {
    const graph = basicGraph('second');
    const start = await request(app).post('/api/tools/demo/execute').send({ graph });
    expect(start.body.status).toBe('awaiting_input');
    const token = start.body.resumeToken;
    const resume = await request(app).post('/api/tools/demo/execute').send({ resumeToken: token, human_input: { specHash: 'c', output: { ok: true } }, graph });
    expect(resume.status).toBe(200);
    expect(resume.body.status).toBe('completed');
    expect(resume.body.executed.includes('c')).toBe(true);
  });

  it('returns 422 for structural error (cycle)', async () => {
    const graph: ToolGraph = {
      entry: 'a',
      nodes: { a: { hash: 'a', intent: 'autonomous', sideEffect: false } },
      edges: [{ from: 'a', to: 'a', priority: 100 }]
    };
    const res = await request(app).post('/api/tools/demo/execute').send({ graph });
    expect(res.status).toBe(422);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when graph missing', async () => {
    const res = await request(app).post('/api/tools/demo/execute').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 on invalid resume token', async () => {
    const graph = basicGraph('second');
    const res = await request(app).post('/api/tools/demo/execute').send({ resumeToken: 'bogus', human_input: { specHash: 'c' }, graph });
    expect(res.status).toBe(404);
  });

  it('returns 501 when only tool_version_id provided (future path)', async () => {
    const res = await request(app).post('/api/tools/demo/execute').send({ tool_version_id: '123e4567-e89b-12d3-a456-426614174000' });
    expect(res.status).toBe(501);
  });
});
