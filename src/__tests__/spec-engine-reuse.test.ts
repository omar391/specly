import { describe, it, expect } from 'vitest';
import { SpecEngine } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';
import { initializeGlobalDatabaseService } from '../database/global-queries.js';
import { getGlobalDatabase } from '../database/drizzle-connection.js';
import { specs } from '../database/schema/global-schema.js';

describe('SpecEngine side_effect reuse (SP-010)', () => {
  it('reuses prior success result for sideEffect spec with same session', async () => {
    await initializeGlobalDatabaseService();
    const db = getGlobalDatabase();
    if (!db.initialized) await db.initialize();
    const drizzle = db.getDb();
    try {
      await drizzle.insert(specs).values([
        { hash: 'R1', executorType: 'noop', executorVersion: '1', intent: 'autonomous', sideEffect: true, staticParams: {}, metadata: {} },
      ] as any);
    } catch {}
    let callCount = 0;
    const exec = {
      execute: async (hash: string) => { callCount++; return { reused: false, hash, ts: Date.now() }; }
    };
    const engine = new SpecEngine({ executor: exec });
    const graph = buildToolGraph(b => b.addSpec({ hash: 'R1', intent: 'autonomous', sideEffect: true, entry: true }));
    const sessionId = `sess-reuse-${Date.now()}`;
    const first = await engine.run(graph, { sessionId });
    expect(first.status).toBe('completed');
    expect(callCount).toBe(1);
    const firstResult = first.results['R1'];
    // Second run with same session should reuse and not increment callCount
    const second = await engine.run(graph, { sessionId });
    expect(second.status).toBe('completed');
    expect(callCount).toBe(1); // no additional executor call
    expect(second.results['R1']).toEqual(firstResult); // identical payload reused
  });
});
