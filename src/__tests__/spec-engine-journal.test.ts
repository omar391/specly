import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph, SpecExecutor } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

class JournalSpy {
  events: { type: string; spec: string; attempt: number }[] = [];
  recordStart(specHash: string, attempt: number) { this.events.push({ type: 'start', spec: specHash, attempt }); }
  recordSuccess(specHash: string, attempt: number, _output: unknown) { this.events.push({ type: 'success', spec: specHash, attempt }); }
  recordFailure(specHash: string, attempt: number, _error: { message: string }) { this.events.push({ type: 'failure', spec: specHash, attempt }); }
}

class FailingExecutor implements SpecExecutor {
  constructor(private failSpec: string) {}
  async execute(specHash: string): Promise<unknown> {
    if (specHash === this.failSpec) throw new Error('boom');
    return { ok: true };
  }
}

describe('SpecEngine Journal Integration (Phase 5 skeleton)', () => {
  it('records start/success events for full autonomous chain', async () => {
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addSpec({ hash: 'C', intent: 'autonomous' })
      .addEdge('A','B')
      .addEdge('B','C')
    );
    const spy = new JournalSpy();
    const engine = new SpecEngine({ journalAdapter: spy });
    const ctx = await engine.run(graph);
    expect(ctx.status).toBe('completed');
    expect(spy.events.map(e => e.type+':'+e.spec)).toEqual([
      'start:A','success:A','start:B','success:B','start:C','success:C'
    ]);
  });

  it('records failure event and stops on executor error', async () => {
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addSpec({ hash: 'C', intent: 'autonomous' })
      .addEdge('A','B')
      .addEdge('B','C')
    );
    const spy = new JournalSpy();
    const engine = new SpecEngine({ journalAdapter: spy, executor: new FailingExecutor('B') });
    const ctx = await engine.run(graph);
    expect(ctx.status).toBe('error');
    expect(spy.events.map(e => e.type+':'+e.spec)).toEqual([
      'start:A','success:A','start:B','failure:B'
    ]);
  });

  it('records human spec success on resume and continues with subsequent autonomous specs', async () => {
    const graph: ToolGraph = buildToolGraph(b => b
      .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
      .addSpec({ hash: 'H', intent: 'human' })
      .addSpec({ hash: 'B', intent: 'autonomous' })
      .addEdge('A','H')
      .addEdge('H','B')
    );
    const spy = new JournalSpy();
    const engine = new SpecEngine({ journalAdapter: spy });
    const first = await engine.run(graph);
    expect(first.status).toBe('awaiting_input');
    const pausedState = first as any; // using internal shape for test only
    const serialized = {
      plan: { steps: [ { specHash: 'A', awaitingHuman: false }, { specHash: 'H', awaitingHuman: true }, { specHash: 'B', awaitingHuman: false } ], warnings: [] },
      currentIndex: 1,
      executed: ['A'],
      results: { A: { ok: true, spec: 'A' } },
      warnings: [],
      awaitingSpec: 'H',
      sessionContext: {}
    };
    const resumed = await engine.resume(graph, serialized, { specHash: 'H', humanOutput: { note: 'done' } });
    expect(resumed.status).toBe('completed');
    // Journal order: from initial run start/success A, human success H, then start/success B
    expect(spy.events.map(e => e.type+':'+e.spec)).toEqual([
      'start:A','success:A','success:H','start:B','success:B'
    ]);
  });
});
