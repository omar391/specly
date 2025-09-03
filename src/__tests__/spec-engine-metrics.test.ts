import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

class MetricsSpy {
  counts: Record<string, number> = {};
  inc(counter: string) { this.counts[counter] = (this.counts[counter] || 0) + 1; }
  observe(_h: string, _v: number) { /* unused */ }
}

class FailingExecutor {
  async execute(specHash: string): Promise<unknown> {
    if (specHash === 'B') throw new Error('fail');
    return { ok: true };
  }
}

describe('SpecEngine Metrics (Phase 6 skeleton)', () => {
  it('counts specs started/completed and human pauses', async () => {
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'H', intent: 'human' })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addEdge('A','H')
      .addEdge('H','B')
    );
    const metrics = new MetricsSpy();
    const engine = new SpecEngine({ metricsCollector: metrics });
    const ctx = await engine.run(graph);
    expect(ctx.status).toBe('awaiting_input');
    expect(metrics.counts['specly_engine_specs_started_total']).toBe(1); // A
    expect(metrics.counts['specly_engine_specs_completed_total']).toBe(1); // A
    expect(metrics.counts['specly_engine_human_pause_total']).toBe(1); // pause at H
  });

  it('counts resumes and remaining specs', async () => {
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'H', intent: 'human' })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addEdge('A','H')
      .addEdge('H','B')
    );
    const metrics = new MetricsSpy();
    const engine = new SpecEngine({ metricsCollector: metrics });
    const first = await engine.run(graph);
    const serialized = {
      plan: { steps: [ { specHash: 'A', awaitingHuman: false }, { specHash: 'H', awaitingHuman: true }, { specHash: 'B', awaitingHuman: false } ], warnings: [] },
      currentIndex: 1,
      executed: ['A'],
      results: { A: { ok: true, spec: 'A' } },
      warnings: [],
      awaitingSpec: 'H',
      sessionContext: {}
    };
    const resumed = await engine.resume(graph, serialized, { specHash: 'H', humanOutput: { note: 'x' } });
    expect(resumed.status).toBe('completed');
    expect(metrics.counts['specly_engine_resume_total']).toBe(1);
    // Started/completed should include A and B (2 each); pause counted once
    expect(metrics.counts['specly_engine_specs_started_total']).toBe(2);
    expect(metrics.counts['specly_engine_specs_completed_total']).toBe(2);
  });

  it('counts failure scenario', async () => {
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addEdge('A','B')
    );
    const metrics = new MetricsSpy();
    const engine = new SpecEngine({ metricsCollector: metrics, executor: new FailingExecutor() as any });
    const ctx = await engine.run(graph);
    expect(ctx.status).toBe('error');
    expect(metrics.counts['specly_engine_specs_started_total']).toBe(2); // A then B
    expect(metrics.counts['specly_engine_specs_completed_total']).toBe(1); // only A
    expect(metrics.counts['specly_engine_specs_failed_total']).toBe(1); // B failure
  });
});
