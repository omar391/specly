import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph, SerializedPausedState } from '../services/spec-engine.js';

function node(hash: string, intent: 'human' | 'autonomous' = 'autonomous') {
  return { hash, intent, sideEffect: false };
}

describe('SpecEngine Pause / Resume (SP-005 Phase 3)', () => {
  it('pauses at human and resumes to completion with provided output', async () => {
    const engine = new SpecEngine();
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: node('A'), B: node('B','human'), C: node('C'), D: node('D') },
      edges: [ { from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' } ]
    };
    const paused = await engine.run(graph);
    expect(paused.status).toBe('awaiting_input');
    expect(paused.awaitingSpec).toBe('B');
    // Build serialized paused state minimal structure
    const serialized: SerializedPausedState = {
      plan: { steps: [ { specHash: 'A', awaitingHuman: false }, { specHash: 'B', awaitingHuman: true }, { specHash: 'C', awaitingHuman: false }, { specHash: 'D', awaitingHuman: false } ], warnings: paused.warnings },
      currentIndex: 1, // index where human spec resides
      executed: paused.executed,
      results: paused.results,
      warnings: paused.warnings,
      awaitingSpec: paused.awaitingSpec!,
      sessionContext: {}
    };
    const resumed = await engine.resume(graph, serialized, { specHash: 'B', humanOutput: { answer: 'ok' } });
    expect(resumed.status).toBe('completed');
    expect(resumed.executed).toEqual(['A','B','C','D']);
    expect(resumed.results['B']).toEqual({ answer: 'ok' });
  });

  it('rejects resume with mismatched spec hash', async () => {
    const engine = new SpecEngine();
    const graph: ToolGraph = { entry: 'H', nodes: { H: node('H'), I: node('I','human') }, edges: [ { from: 'H', to: 'I' } ] };
    const paused = await engine.run(graph);
    const serialized: SerializedPausedState = {
      plan: { steps: [ { specHash: 'H', awaitingHuman: false }, { specHash: 'I', awaitingHuman: true } ], warnings: paused.warnings },
      currentIndex: 1,
      executed: paused.executed,
      results: paused.results,
      warnings: paused.warnings,
      awaitingSpec: paused.awaitingSpec!,
      sessionContext: {}
    };
    const bad = await engine.resume(graph, serialized, { specHash: 'WRONG', humanOutput: { value: 1 } });
    expect(bad.status).toBe('error');
    expect(bad.error?.message).toMatch(/Stale or mismatched/);
  });
});
