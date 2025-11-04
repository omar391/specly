import { describe, it, expect, vi } from 'vitest';
import { SpecEngine, ToolGraph, ClientStateLeaseProvider, SpecEngineErrorCode } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

// Minimal helper
function auto(hash: string) { return { hash, intent: 'autonomous' as const, sideEffect: false }; }

class ThrowStringExecutor {
    async execute(_hash: string) { throw 'string-error'; }
}

class FailingFirstExecutor {
    private called = false;
    async execute(_hash: string) {
        if (!this.called) { this.called = true; throw new Error('first-fail'); }
        return { ok: true };
    }
}

describe('SpecEngine edge cases', () => {
    it('returns error on resume when no human pause occurred (invalid resume token)', async () => {
        const engine = new SpecEngine();
        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'B', intent: 'autonomous' })
            .addEdge('A', 'B')
        );
        const completed = await engine.run(graph);
        expect(completed.status).toBe('completed');

        // Try to resume even though nothing is awaiting input
        const bad = await engine.resume(graph, {
            plan: { steps: [{ specHash: 'A', awaitingHuman: false }, { specHash: 'B', awaitingHuman: false }], warnings: completed.warnings },
            currentIndex: 1,
            executed: completed.executed,
            results: completed.results,
            warnings: completed.warnings,
            awaitingSpec: undefined as any,
            sessionContext: {}
        }, { specHash: 'B', humanOutput: { any: true } });

        expect(bad.status).toBe('error');
        expect(bad.error?.message || '').toMatch(/resume/i);
        // If engine exposes explicit code, assert it
        if (bad.errorCode !== undefined) {
            expect(bad.errorCode).toBe(SpecEngineErrorCode.RESUME_TOKEN_INVALID);
        }
    });

    it('normalizes non-Error throws from executor to a consistent error result', async () => {
        const engine = new SpecEngine({ executor: new ThrowStringExecutor() as any, retryPolicy: { maxAttempts: 1 } });
        const graph: ToolGraph = { entry: 'X', nodes: { X: auto('X') }, edges: [] };
        const ctx = await engine.run(graph);
        expect(ctx.status).toBe('error');
        // Engine should coerce non-Error throws to a stable message
        expect(String(ctx.error?.message || ctx.error)).toMatch(/Execution failed at spec X/);
        if (ctx.errorCode !== undefined) {
            expect(ctx.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
        }
    });

    it('does not acquire a lease when sessionId or clientId is missing', async () => {
        const lease: ClientStateLeaseProvider = {
            acquire: vi.fn(async () => ({ leaseId: 'IGNORED' })),
            renew: vi.fn(async () => { }),
            release: vi.fn(async () => { })
        };
        const graph: ToolGraph = { entry: 'A', nodes: { A: auto('A') }, edges: [] };

        // Only sessionId
        const engine1 = new SpecEngine({ leaseProvider: lease });
        const r1 = await engine1.run(graph, { sessionId: 's-only' } as any);
        expect(r1.status).toBe('completed');
        expect((lease.acquire as any).mock.calls.length).toBe(0);

        // Only clientId
        const engine2 = new SpecEngine({ leaseProvider: lease });
        const r2 = await engine2.run(graph, { clientId: 'c-only' } as any);
        expect(r2.status).toBe('completed');
        expect((lease.acquire as any).mock.calls.length).toBe(0);
    });

    it('releases lease even when execution fails', async () => {
        const lease: ClientStateLeaseProvider = {
            acquire: vi.fn(async () => ({ leaseId: 'Lx' })),
            renew: vi.fn(async () => { }),
            release: vi.fn(async () => { })
        };
        const engine = new SpecEngine({ leaseProvider: lease, executor: new FailingFirstExecutor() as any, retryPolicy: { maxAttempts: 1 } });
        const graph: ToolGraph = buildToolGraph(b => b.addSpec({ hash: 'Z', intent: 'autonomous', entry: true }));

        const ctx = await engine.run(graph, { sessionId: 's1', clientId: 'c1' });
        expect(ctx.status).toBe('error');
        expect(lease.acquire).toHaveBeenCalledTimes(1);
        expect(lease.release).toHaveBeenCalledTimes(1); // ensure release in error path
    });
});
