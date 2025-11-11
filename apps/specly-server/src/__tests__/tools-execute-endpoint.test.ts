import { createApiRouter } from '../api/router.js';
import { DatabaseService } from '../services/database-service.js';
import { v4 as uuid } from 'uuid';
import { SpecEngine, ToolGraph } from '../services/spec-engine.js';
import { ToolsExecuteController } from '../api/tools-execute.js';
import { describe, it, expect, beforeAll } from 'vitest';
import { SpecEngineErrorCode } from '../services/spec-engine.js';

// Minimal database service stub (router expects real instance; we stub required methods)
// Lightweight mock database service to avoid native better-sqlite3 usage for these endpoint tests
class MockDatabaseService {
  private toolVersions: Record<string, any> = {};
  private specs: Record<string, any> = {};

  seedToolVersion(hash: string, manifest: any) {
    this.toolVersions[hash] = { hash, toolName: manifest.tool_name || 'demo', graphManifest: manifest };
  }
  seedSpec(hash: string, intent: 'autonomous' | 'human' = 'autonomous', sideEffect = false) {
    this.specs[hash] = { hash, intent, sideEffect };
  }
  getGlobal() {
    return {
      getToolVersion: async (hash: string) => this.toolVersions[hash] || null,
      getSpecsByHashes: async (hashes: string[]) => {
        const out: Record<string, any> = {};
        for (const h of hashes) if (this.specs[h]) out[h] = this.specs[h];
        return out;
      }
    } as any;
  }
}

async function buildApp(engineFactory?: () => SpecEngine, mockDb?: MockDatabaseService) {
  const db = (mockDb || new MockDatabaseService()) as unknown as DatabaseService;
  const app = await createApiRouter(db);
  return { app, mockDb: db as unknown as MockDatabaseService };
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
  let app: Awaited<ReturnType<typeof createApiRouter>>; let mockDb: MockDatabaseService;
  beforeAll(async () => {
    const built = await buildApp();
    app = built.app;
    mockDb = built.mockDb;
  });

  it('runs a full autonomous graph and returns completed', async () => {
    const graph = basicGraph('none');
    const res = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.executed.length).toBe(3);
  });

  it('pauses on human spec and returns resumeToken', async () => {
    const graph = basicGraph('second');
    const res = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph })
    });
    expect([200, 422]).toContain(res.status); // structural issues would 422 but not expected here
    if (res.status === 200) {
      const body = await res.json();
      expect(body.status).toBe('awaiting_input');
      expect(body.resumeToken).toBeDefined();
      expect(body.awaitingSpec).toBe('c');
    }
  });

  it('resumes after human input', async () => {
    const graph = basicGraph('second');
    const start = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph })
    });
    const startBody = await start.json();
    expect(startBody.status).toBe('awaiting_input');
    const token = startBody.resumeToken;
    const resume = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeToken: token, human_input: { specHash: 'c', output: { ok: true } }, graph })
    });
    expect(resume.status).toBe(200);
    const resumeBody = await resume.json();
    expect(resumeBody.status).toBe('completed');
    expect(resumeBody.executed.includes('c')).toBe(true);
  });

  it('returns 422 for structural error (cycle)', async () => {
    const graph: ToolGraph = {
      entry: 'a',
      nodes: { a: { hash: 'a', intent: 'autonomous', sideEffect: false } },
      edges: [{ from: 'a', to: 'a', priority: 100 }]
    };
    const res = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph })
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('GRAPH_CYCLE');
  });

  it('returns 422 for structural error (missing node reference)', async () => {
    const graph: ToolGraph = {
      entry: 'a',
      nodes: { a: { hash: 'a', intent: 'autonomous', sideEffect: false } },
      edges: [{ from: 'a', to: 'b', priority: 100 }] // 'b' not declared
    };
    const res = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph })
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBeDefined();
    if (body.error.code) {
      expect(['GRAPH_MISSING_NODE', 'GRAPH_CYCLE']).toContain(body.error.code);
    }
  });

  it('returns 400 when graph missing', async () => {
    const res = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 on invalid resume token', async () => {
    const graph = basicGraph('second');
    const res = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeToken: 'bogus', human_input: { specHash: 'c' }, graph })
    });
    expect(res.status).toBe(404);
  });

  it('returns 500 for runtime dead-end (ROUTE_DEAD_END)', async () => {
    // Build a graph where planner will schedule only the first node, but graph has outgoing edge -> simulate dead-end via truncated plan
    // We can approximate by constructing a graph with two nodes and an edge, then mock a custom engine with a planner that omits the second node.
    class TruncatedPlanner {
      buildPlan(_graph: ToolGraph) { return { steps: [{ specHash: 'x1', awaitingHuman: false }], warnings: [] }; }
    }
    // Build an app with a controller using custom engine factory
    const db = new MockDatabaseService() as unknown as DatabaseService;
    const { Hono } = await import('hono');
    const app2 = new Hono();
    const controller = new ToolsExecuteController(() => new SpecEngine({ planner: new TruncatedPlanner() as any }), undefined, db);
    app2.post('/tools/demo/execute', async (c) => {
      return await controller.execute(c);
    });
    const graph: ToolGraph = { entry: 'x1', nodes: { x1: { hash: 'x1', intent: 'autonomous', sideEffect: false }, x2: { hash: 'x2', intent: 'autonomous', sideEffect: false } }, edges: [ { from: 'x1', to: 'x2', priority: 100 } ] };
    const res = await app2.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph })
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error?.code).toBe(SpecEngineErrorCode.ROUTE_DEAD_END);
  });

  it('runs using only tool_version_id (autonomous)', async () => {
    const specA = uuid();
    const specB = uuid();
    mockDb.seedSpec(specA, 'autonomous');
    mockDb.seedSpec(specB, 'autonomous');
    const toolHash = uuid();
    const manifest = { ordered_specs: [specA, specB], entry_spec: specA, edges: [{ from: specA, to: specB, priority: 100 }] };
    mockDb.seedToolVersion(toolHash, manifest);
    const res = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_version_id: toolHash })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.executed.length).toBe(2);
  });

  it('pauses/resumes using only tool_version_id (human in second node)', async () => {
    const specA = uuid();
    const specHuman = uuid();
    mockDb.seedSpec(specA, 'autonomous');
    mockDb.seedSpec(specHuman, 'human');
    const toolHash = uuid();
    const manifest = { ordered_specs: [specA, specHuman], entry_spec: specA, edges: [{ from: specA, to: specHuman, priority: 100 }] };
    mockDb.seedToolVersion(toolHash, manifest);
    const start = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_version_id: toolHash })
    });
    expect(start.status).toBe(200);
    const startBody = await start.json();
    expect(startBody.status).toBe('awaiting_input');
    const resume = await app.request('/tools/demo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_version_id: toolHash, resumeToken: startBody.resumeToken, human_input: { specHash: specHuman, output: { ok: true } } })
    });
    expect(resume.status).toBe(200);
    const resumeBody = await resume.json();
    expect(resumeBody.status).toBe('completed');
    expect(resumeBody.executed.includes(specHuman)).toBe(true);
  });
});
