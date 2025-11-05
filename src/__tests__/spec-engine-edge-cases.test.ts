import { describe, it, expect, vi } from 'vitest';
import { SpecEngine, ToolGraph, ClientStateLeaseProvider, SpecEngineErrorCode, BasicExecutionPlanner, NoopAutonomousExecutor } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

// Minimal helper
function auto(hash: string) { return { hash, intent: 'autonomous' as const, sideEffect: false }; }

class ThrowStringExecutor {
    async execute(_hash: string) { throw 'string-error'; }
}

class FailingFirstExecutor {
    async execute(_hash: string) {
        throw new Error('first-executor-failure');
    }
}

class FailingAfterResumeExecutor {
    private callCount = 0;
    async execute(hash: string) {
        this.callCount++;
        if (hash === 'FAIL') { // Fail on FAIL spec during resume
            throw new Error('resume-failure');
        }
        return { ok: true, call: this.callCount };
    }
}

class NullExecutor {
    async execute(hash: string) {
        if (hash === 'TARGET') {
            // Simulate different error types that should hit the catch block
            throw null; // This should trigger the catch block line 504
        }
        return { ok: true };
    }
}

describe('SpecEngine edge cases', () => {
    it('NoopAutonomousExecutor returns expected result', async () => {
        const executor = new NoopAutonomousExecutor();
        const result = await executor.execute('test-hash');
        expect(result).toEqual({ ok: true, spec: 'test-hash' });
    });

    it('SpecEngine uses NoopAutonomousExecutor for autonomous specs', async () => {
        const executor = new NoopAutonomousExecutor();
        const engine = new SpecEngine({ executor });
        const graph: ToolGraph = { entry: 'X', nodes: { X: auto('X') }, edges: [] };
        const ctx = await engine.run(graph);
        expect(ctx.status).toBe('completed');
        expect(ctx.results?.X).toEqual({ ok: true, spec: 'X' });
    });

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

    it('handles executor failure during resume of remaining autonomous specs', async () => {
        const executor = new FailingAfterResumeExecutor();
        const engine = new SpecEngine({ executor: executor as any, retryPolicy: { maxAttempts: 1 } });

        // Graph: A (auto) -> H (human) -> FAIL (auto that fails on resume)
        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'H', intent: 'human' })
            .addSpec({ hash: 'FAIL', intent: 'autonomous' })
            .addEdge('A', 'H')
            .addEdge('H', 'FAIL')
        );

        // Run and pause at human spec
        const first = await engine.run(graph);
        expect(first.status).toBe('awaiting_input');
        expect(first.awaitingSpec).toBe('H');

        // Build serialized state for resume
        const planner = new BasicExecutionPlanner();
        const plan = planner.buildPlan(graph);
        const serialized = {
            plan,
            currentIndex: plan.steps.findIndex(s => s.specHash === 'H'),
            executed: ['A'],
            results: { A: { ok: true, call: 1 } },
            warnings: [],
            awaitingSpec: 'H',
            sessionContext: {}
        };

        // Resume with human input - should fail when executing FAIL spec
        const resumed = await engine.resume(graph, serialized, {
            specHash: 'H',
            humanOutput: { human: 'input' }
        });

        expect(resumed.status).toBe('error');
        expect(resumed.error?.message).toMatch(/Execution failed at spec FAIL/);
        expect(resumed.error?.message).toMatch(/resume-failure/);
        if (resumed.errorCode !== undefined) {
            expect(resumed.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
        }
    });

    it('BasicExecutionPlanner handles nodes with no incoming edges in priority calculation', async () => {
        const planner = new BasicExecutionPlanner();
        
        // Create a graph where one node has no incoming edges
        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'START', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'ISOLATED', intent: 'autonomous' })
            .addSpec({ hash: 'END', intent: 'autonomous' })
            .addEdge('START', 'END', 200)  // START -> END with priority 200
            // ISOLATED has no incoming edges, so incomingMaxPriority should return null
        );

        const plan = planner.buildPlan(graph);
        
        // Verify the plan is generated correctly even with isolated nodes
        expect(plan.steps).toHaveLength(2); // Only START and END should be in execution order
        expect(plan.steps[0].specHash).toBe('START');
        expect(plan.steps[1].specHash).toBe('END');
        expect(plan.warnings).toContain('Unreachable spec node: ISOLATED');
    });

    it('incomingMaxPriority function returns null for nodes with no incoming edges', async () => {
        // Create a graph with a node that has no incoming edges to exercise incomingMaxPriority return null path
        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'ENTRY', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'ISOLATED', intent: 'autonomous' })
        );

        const planner = new BasicExecutionPlanner();
        const plan = planner.buildPlan(graph);
        
        // ISOLATED has no incoming edges, so incomingMaxPriority should return null
        // This should trigger lines 541-542 in the incomingMaxPriority function
        expect(plan.steps).toHaveLength(1); // Only ENTRY
        expect(plan.steps[0].specHash).toBe('ENTRY');
        expect(plan.warnings).toContain('Unreachable spec node: ISOLATED');
    });

    it('incomingMaxPriority comparison with multiple isolated nodes triggers line 649', async () => {
        // Create multiple isolated nodes so the sort comparison calls incomingMaxPriority
        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'ENTRY', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'ISO_A', intent: 'autonomous' })
            .addSpec({ hash: 'ISO_B', intent: 'autonomous' })
            .addSpec({ hash: 'ISO_C', intent: 'autonomous' })
        );

        const planner = new BasicExecutionPlanner();
        const plan = planner.buildPlan(graph);
        
        // Multiple isolated nodes should trigger sort comparison and incomingMaxPriority calls
        expect(plan.steps).toHaveLength(1); // Only ENTRY
        expect(plan.steps[0].specHash).toBe('ENTRY');
        expect(plan.warnings).toEqual([
            'Unreachable spec node: ISO_A',
            'Unreachable spec node: ISO_B', 
            'Unreachable spec node: ISO_C'
        ]);
    });

    it('resume method catch block handles executor failures with null error', async () => {
        const executor = new NullExecutor();
        const engine = new SpecEngine({ executor: executor as any, retryPolicy: { maxAttempts: 1 } });

        // Graph: A (auto) -> H (human) -> TARGET (auto that throws null)
        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'H', intent: 'human' })
            .addSpec({ hash: 'TARGET', intent: 'autonomous' })
            .addEdge('A', 'H')
            .addEdge('H', 'TARGET')
        );

        // Run and pause at human spec
        const first = await engine.run(graph);
        expect(first.status).toBe('awaiting_input');
        expect(first.awaitingSpec).toBe('H');

        // Build serialized state for resume
        const planner = new BasicExecutionPlanner();
        const plan = planner.buildPlan(graph);
        const serialized = {
            plan,
            currentIndex: plan.steps.findIndex(s => s.specHash === 'H'),
            executed: ['A'],
            results: { A: { ok: true } },
            warnings: [],
            awaitingSpec: 'H',
            sessionContext: {}
        };

        // Resume with human input - should fail when executing TARGET spec and hit line 504
        const resumed = await engine.resume(graph, serialized, {
            specHash: 'H',
            humanOutput: { human: 'input' }
        });

        expect(resumed.status).toBe('error');
        expect(resumed.error?.message).toMatch(/Execution failed at spec TARGET/);
        expect(resumed.error?.message).toMatch(/Autonomous executor error/);
        if (resumed.errorCode !== undefined) {
            expect(resumed.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
        }
    });

    it('successful resume completes and releases lease (covers lines 509-510)', async () => {
        const executor = { execute: async (hash: string) => ({ ok: true, spec: hash }) };
        const lease = {
            acquire: vi.fn(async () => ({ leaseId: 'test-lease' })),
            renew: vi.fn(async () => { }),
            release: vi.fn(async () => { })
        };
        const engine = new SpecEngine({ executor: executor as any, leaseProvider: lease });

        // Graph: A (auto) -> H (human) -> B (auto)
        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'H', intent: 'human' })
            .addSpec({ hash: 'B', intent: 'autonomous' })
            .addEdge('A', 'H')
            .addEdge('H', 'B')
        );

        // Run and pause at human spec with lease
        const first = await engine.run(graph, { sessionId: 'sess1', clientId: 'client1' });
        expect(first.status).toBe('awaiting_input');
        expect(first.awaitingSpec).toBe('H');

        // Build serialized state for resume
        const planner = new BasicExecutionPlanner();
        const plan = planner.buildPlan(graph);
        const serialized = {
            plan,
            currentIndex: plan.steps.findIndex(s => s.specHash === 'H'),
            executed: ['A'],
            results: { A: { ok: true, spec: 'A' } },
            warnings: [],
            awaitingSpec: 'H',
            sessionContext: {}
        };

        // Resume with human input - should complete successfully and release lease
        const resumed = await engine.resume(graph, serialized, {
            specHash: 'H',
            humanOutput: { human: 'input' }
        }, { sessionId: 'sess1', clientId: 'client1' });

        expect(resumed.status).toBe('completed');
        expect(resumed.executed).toEqual(['A', 'H', 'B']);
        expect(resumed.results?.B).toEqual({ ok: true, spec: 'B' });
        
        // Verify lease was acquired for run and resume acquires and releases its own lease
        expect(lease.acquire).toHaveBeenCalledTimes(2); // once for run, once for resume
        expect(lease.release).toHaveBeenCalledWith('test-lease'); // verify lease was released
    });
});
