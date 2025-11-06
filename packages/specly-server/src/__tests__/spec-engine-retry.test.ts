import { describe, it, expect } from 'vitest';
import { SpecEngine } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

class FlakyExecutor {
    private failCount = 0;
    constructor(private failTimes: number) { }
    async execute(_hash: string) {
        if (this.failCount < this.failTimes) {
            this.failCount++;
            throw new Error('transient');
        }
        return { ok: true, attempt: this.failCount + 1 };
    }
}

class AlwaysFailExecutor {
    async execute(_hash: string) { throw new Error('boom'); }
}

describe('SpecEngine Retry Policy (SP-010)', () => {
    it('succeeds on second attempt when maxAttempts=3', async () => {
        const graph = buildToolGraph(b => b.addSpec({ hash: 'R', intent: 'autonomous', entry: true }));
        const engine = new SpecEngine({ executor: new FlakyExecutor(1) as any, retryPolicy: { maxAttempts: 3, strategy: 'immediate' } });
        const ctx = await engine.run(graph);
        expect(ctx.status).toBe('completed');
        // no direct metric assertion (metrics optional); rely on absence of error
    });

    it('fails after exhausting attempts', async () => {
        const graph = buildToolGraph(b => b.addSpec({ hash: 'R', intent: 'autonomous', entry: true }));
        const engine = new SpecEngine({ executor: new AlwaysFailExecutor() as any, retryPolicy: { maxAttempts: 2, strategy: 'immediate' } });
        const ctx = await engine.run(graph);
        expect(ctx.status).toBe('error');
        expect(ctx.error?.message).toMatch(/Execution failed/);
    });
});
