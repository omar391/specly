import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph, SerializedPausedState, SpecEngineErrorCode } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

function node(hash: string, intent: 'human' | 'autonomous' = 'autonomous') {
  return { hash, intent, sideEffect: false };
}

describe('SpecEngine Pause / Resume (SP-005 Phase 3)', () => {
  it('pauses at human and resumes to completion with provided output', async () => {
    const engine = new SpecEngine();
      const graph: ToolGraph = buildToolGraph(b => b
          .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
          .addSpec({ hash: 'B', intent: 'human' })
          .addSpec({ hash: 'C', intent: 'autonomous' })
          .addSpec({ hash: 'D', intent: 'autonomous' })
          .addEdge('A', 'B')
          .addEdge('B', 'C')
          .addEdge('C', 'D')
      );
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
      const graph: ToolGraph = buildToolGraph(b => b
          .addSpec({ hash: 'H', intent: 'autonomous', entry: true })
          .addSpec({ hash: 'I', intent: 'human' })
          .addEdge('H', 'I')
      );
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
      expect(bad.errorCode).toBe(SpecEngineErrorCode.RESUME_TOKEN_INVALID);
  });
});
