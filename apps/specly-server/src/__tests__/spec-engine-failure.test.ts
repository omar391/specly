import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph, SpecExecutor, SpecEngineErrorCode } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

function node(hash: string, intent: 'human' | 'autonomous' = 'autonomous') {
  return { hash, intent, sideEffect: false };
}

class FailingExecutor implements SpecExecutor {
  private failOn: string;
  constructor(failOn: string) { this.failOn = failOn; }
  async execute(specHash: string): Promise<unknown> {
    if (specHash === this.failOn) throw new Error('Boom');
    return { ok: true, spec: specHash, value: specHash.toLowerCase() };
  }
}

describe('SpecEngine Failure Propagation (SP-005 Phase 1)', () => {
  it('captures failure at failing spec and preserves prior results', async () => {
      const graph: ToolGraph = buildToolGraph(b => b
          .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
          .addSpec({ hash: 'B', intent: 'autonomous' })
          .addSpec({ hash: 'C', intent: 'autonomous' })
          .addEdge('A', 'B', 10)
          .addEdge('B', 'C', 10)
      );
    const engine = new SpecEngine({ executor: new FailingExecutor('B') });
    const ctx = await engine.run(graph);
    expect(ctx.status).toBe('error');
    // A should have executed, B failed, C not reached
    expect(ctx.executed).toEqual(['A']);
    expect(Object.keys(ctx.results)).toEqual(['A']);
    expect(ctx.error?.message).toMatch(/Execution failed at spec B/);
      expect(ctx.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
  });
});
