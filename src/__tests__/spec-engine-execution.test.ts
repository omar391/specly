import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph, SpecEngineErrorCode } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

function node(hash: string, intent: 'human' | 'autonomous' = 'autonomous') {
  return { hash, intent, sideEffect: false };
}

describe('SpecEngine Execution Loop (SP-005)', () => {
    it('executes full autonomous chain and completes (builder)', async () => {
        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'B', intent: 'autonomous' })
            .addSpec({ hash: 'C', intent: 'autonomous' })
            .addEdge('A', 'B', 50)
            .addEdge('B', 'C', 50)
        );
    const engine = new SpecEngine();
    const ctx = await engine.run(graph);
    expect(ctx.status).toBe('completed');
    expect(ctx.executed).toEqual(['A','B','C']);
    expect(Object.keys(ctx.results)).toEqual(['A','B','C']);
    expect(ctx.awaitingSpec).toBeUndefined();
  });

  it('pauses when encountering first human spec', async () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: node('A'), B: node('B','human'), C: node('C') },
      edges: [ { from: 'A', to: 'B', priority: 80 }, { from: 'B', to: 'C', priority: 50 } ]
    };
    const engine = new SpecEngine();
    const ctx = await engine.run(graph);
    expect(ctx.status).toBe('awaiting_input');
    expect(ctx.executed).toEqual(['A']);
    expect(ctx.awaitingSpec).toBe('B');
    // Human node should not have executed yet
    expect(ctx.results['B']).toBeUndefined();
  });

  it('returns error context on planning failure (cycle)', async () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: node('A'), B: node('B') },
      edges: [ { from: 'A', to: 'B' }, { from: 'B', to: 'A' } ]
    };
    const engine = new SpecEngine();
    const ctx = await engine.run(graph);
    expect(ctx.status).toBe('error');
    expect(ctx.error?.message).toMatch(/Cycle detected/);
      expect(ctx.errorCode).toBe(SpecEngineErrorCode.GRAPH_CYCLE);
  });

  it('treats dead-end autonomous leaf as completion', async () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: node('A'), B: node('B') },
      edges: [ { from: 'A', to: 'B', priority: 10 } ]
    };
    const engine = new SpecEngine();
    const ctx = await engine.run(graph);
    expect(ctx.status).toBe('completed');
    expect(ctx.executed).toEqual(['A','B']);
  });

    it('fails early with MISSING_NODE when an edge references an undeclared spec', async () => {
    const graph: ToolGraph = { entry: 'A', nodes: { A: node('A') }, edges: [ { from: 'A', to: 'B' } ] };
    const engine = new SpecEngine();
    const ctx = await engine.run(graph);
    expect(ctx.status).toBe('error');
      expect(ctx.errorCode).toBe(SpecEngineErrorCode.GRAPH_MISSING_NODE);
  });
});
