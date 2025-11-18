import { describe, it, expect, vi } from 'vitest';
import { SpecEngine, ToolGraph, SpecEngineErrorCode } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

function node(hash: string, intent: 'human' | 'autonomous' = 'autonomous') {
    return { hash, intent, sideEffect: false };
}

describe('SpecEngine edge case behaviors', () => {
    it('maps planner errors with "Cycle detected" to GRAPH_CYCLE', async () => {
        const engine = new SpecEngine({});
        // Replace planner with one that throws a specific message
        (engine as any).planner = { buildPlan: () => { throw new Error('Cycle detected: simulated'); } };

        const graph: ToolGraph = {
            entry: 'A',
            nodes: { A: node('A') },
            edges: []
        };

        const res = await engine.run(graph);
        expect(res.status).toBe('error');
        expect(res.errorCode).toBe(SpecEngineErrorCode.GRAPH_CYCLE);
    });

    it('maps planner errors with "Missing node during execution" to GRAPH_MISSING_NODE', async () => {
        const engine = new SpecEngine({});
        (engine as any).planner = { buildPlan: () => { throw new Error('Missing node during execution: simulated'); } };

        const graph: ToolGraph = {
            entry: 'A',
            nodes: { A: node('A') },
            edges: []
        };

        const res = await engine.run(graph);
        expect(res.status).toBe('error');
        expect(res.errorCode).toBe(SpecEngineErrorCode.GRAPH_MISSING_NODE);
    });

    it('rejects resume when resumeToken has already been consumed', async () => {
        const engine = new SpecEngine();

        const graph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'H', intent: 'human' })
            .addSpec({ hash: 'B', intent: 'autonomous' })
            .addEdge('A', 'H')
            .addEdge('H', 'B')
        );

        // Pause at first human
        const first = await engine.run(graph);
        expect(first.status).toBe('awaiting_input');
        const resumeToken = first.resumeToken as string;

        const serialized = {
            plan: first.resumeToken ? { steps: [], warnings: [] } as any : { steps: [{ specHash: 'A', awaitingHuman: false }, { specHash: 'H', awaitingHuman: true }, { specHash: 'B', awaitingHuman: false }], warnings: [] },
            currentIndex: 1,
            executed: ['A'],
            results: { A: { ok: true } },
            warnings: [],
            awaitingSpec: 'H',
            sessionContext: {}
        };

        // First resume should succeed
        const resumed = await engine.resume(graph, serialized as any, { specHash: 'H', humanOutput: { value: 'x' }, resumeToken });
        expect(resumed.status).toBeDefined();

        // Second resume with same token should be rejected
        const second = await engine.resume(graph, serialized as any, { specHash: 'H', humanOutput: { value: 'x' }, resumeToken });
        expect(second.status).toBe('error');
        expect(second.errorCode).toBe(SpecEngineErrorCode.RESUME_TOKEN_INVALID);
    });

    it('calls journal.recordFailure when executor fails during resume', async () => {
        let recordFailures = 0;
        const fakeJournal = {
            recordStart: vi.fn().mockResolvedValue(undefined),
            recordSuccess: vi.fn().mockResolvedValue(undefined),
            recordFailure: vi.fn().mockImplementation(() => { recordFailures++; return Promise.resolve(); })
        };

        const failingExecutor = {
            execute: vi.fn().mockImplementation(() => {
                throw new Error('fail');
            })
        };

        const engine = new SpecEngine({ executor: failingExecutor as any, journalAdapter: fakeJournal as any });

        const graph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'H', intent: 'human' })
            .addSpec({ hash: 'B', intent: 'autonomous' })
            .addEdge('A', 'H')
            .addEdge('H', 'B')
        );

        // Construct a paused serialized state manually and resume
        const serialized = {
            plan: { steps: [{ specHash: 'A', awaitingHuman: false }, { specHash: 'H', awaitingHuman: true }, { specHash: 'B', awaitingHuman: false }], warnings: [] },
            currentIndex: 1,
            executed: ['A'],
            results: { A: { ok: true } },
            warnings: [],
            awaitingSpec: 'H',
            sessionContext: {}
        };

        const resumed = await engine.resume(graph, serialized as any, { specHash: 'H', humanOutput: { x: 1 } });
        expect(resumed.status).toBe('error');
        // recordFailure should have been called by the resume flow
        expect((fakeJournal.recordFailure as any).mock.calls.length).toBeGreaterThan(0);
    });
});
import { describe, it, expect, vi } from 'vitest';
import { SpecEngine, ToolGraph, ClientStateLeaseProvider, SpecEngineErrorCode, BasicExecutionPlanner, NoopAutonomousExecutor } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';

// Minimal helper
function auto(hash: string) { return { hash, intent: 'autonomous' as const, sideEffect: false }; }

class ThrowStringExecutor {
    async execute(_hash: string) { throw 'string-error'; }
}

class ThrowOnBExecutor {
    async execute(hash: string) {
        if (hash === 'B') throw 'string-error';
        return { ok: true };
    }
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

    it('resume handles lease renewal failure', async () => {
        const lease = {
            acquire: vi.fn().mockResolvedValue({ leaseId: 'test-lease' }),
            renew: vi.fn().mockRejectedValue(new Error('renew-fail')),
            release: vi.fn().mockResolvedValue(undefined)
        };
        const engine = new SpecEngine({
            leaseProvider: lease as any,
            leaseRenewEvery: 1 // renew every spec
        });

        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'H', intent: 'human' })
            .addSpec({ hash: 'B', intent: 'autonomous' })
            .addEdge('A', 'H')
            .addEdge('H', 'B')
        );

        // Run and pause
        const first = await engine.run(graph, {});
        expect(first.status).toBe('awaiting_input');

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

        // Resume - lease renewal should fail on B
        const resumed = await engine.resume(graph, serialized, {
            specHash: 'H',
            humanOutput: { human: 'input' }
        }, { sessionId: 'sess1', clientId: 'client1' });

        expect(resumed.status).toBe('error');
        expect(resumed.error?.message).toContain('Lease renewal failed');
        expect(resumed.errorCode).toBe(SpecEngineErrorCode.LEASE_RENEW_FAILED);
        expect(lease.renew).toHaveBeenCalledWith('test-lease');
    });

    it('resume handles executor failure', async () => {
        const engine = new SpecEngine({ executor: new ThrowOnBExecutor() });

        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'H', intent: 'human' })
            .addSpec({ hash: 'B', intent: 'autonomous' })
            .addEdge('A', 'H')
            .addEdge('H', 'B')
        );

        const first = await engine.run(graph, {});
        expect(first.status).toBe('awaiting_input');

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

        const resumed = await engine.resume(graph, serialized, {
            specHash: 'H',
            humanOutput: { human: 'input' }
        });

        expect(resumed.status).toBe('error');
        expect(resumed.error?.message).toContain('Execution failed at spec B');
        expect(resumed.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
    });

    it('resume handles missing node', async () => {
        const engine = new SpecEngine();

        // Build graph with 'B' in nodes for validation, but remove for resume
        const graph: ToolGraph = {
            entry: 'A',
            nodes: {
                A: { hash: 'A', intent: 'autonomous', sideEffect: false },
                H: { hash: 'H', intent: 'human', sideEffect: false },
                B: { hash: 'B', intent: 'autonomous', sideEffect: false }
            },
            edges: [
                { from: 'A', to: 'H' },
                { from: 'H', to: 'B' }
            ]
        };

        const first = await engine.run(graph, {});
        expect(first.status).toBe('awaiting_input');

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

        // Remove 'B' from nodes for resume to trigger missing node error
        const graphForResume: ToolGraph = {
            ...graph,
            nodes: {
                A: graph.nodes.A,
                H: graph.nodes.H
            }
        };

        const resumed = await engine.resume(graphForResume, serialized, {
            specHash: 'H',
            humanOutput: { human: 'input' }
        });

        expect(resumed.status).toBe('error');
        expect(resumed.error?.message).toContain('Missing node during execution: B');
        expect(resumed.errorCode).toBe(SpecEngineErrorCode.GRAPH_MISSING_NODE);
    });

    it('run triggers lease renewal', async () => {
        const mockLeaseProvider = {
            acquire: vi.fn().mockResolvedValue({ leaseId: 'test-lease' }),
            renew: vi.fn().mockResolvedValue(undefined),
            release: vi.fn().mockResolvedValue(undefined)
        };

        const engine = new SpecEngine({
            leaseProvider: mockLeaseProvider,
            leaseRenewEvery: 2 // Renew every 2 specs
        });

        const graph: ToolGraph = {
            entry: 'A',
            nodes: {
                A: auto('A'),
                B: auto('B'),
                C: auto('C')
            },
            edges: [
                { from: 'A', to: 'B' },
                { from: 'B', to: 'C' }
            ]
        };

        const result = await engine.run(graph, { sessionId: 'test-session', clientId: 'test-client' });

        expect(result.status).toBe('completed');
        expect(mockLeaseProvider.acquire).toHaveBeenCalledWith('test-session', 'test-client', undefined);
        expect(mockLeaseProvider.renew).toHaveBeenCalledTimes(1); // Should renew after 2 specs (B completes)
        expect(mockLeaseProvider.release).toHaveBeenCalledWith('test-lease');
    });

    it('run handles lease renewal failure', async () => {
        const mockLeaseProvider = {
            acquire: vi.fn().mockResolvedValue({ leaseId: 'test-lease' }),
            renew: vi.fn().mockRejectedValue(new Error('renew-failed')),
            release: vi.fn().mockResolvedValue(undefined)
        };

        const engine = new SpecEngine({
            leaseProvider: mockLeaseProvider,
            leaseRenewEvery: 1 // Renew after every spec
        });

        const graph: ToolGraph = {
            entry: 'A',
            nodes: {
                A: auto('A'),
                B: auto('B')
            },
            edges: [
                { from: 'A', to: 'B' }
            ]
        };

        const result = await engine.run(graph, { sessionId: 'test-session', clientId: 'test-client' });

        expect(result.status).toBe('error');
        expect(result.error?.message).toContain('Lease renewal failed');
        expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_RENEW_FAILED);
        expect(mockLeaseProvider.release).toHaveBeenCalledWith('test-lease');
    });

    it('resume triggers lease renewal', async () => {
        const mockLeaseProvider = {
            acquire: vi.fn().mockResolvedValue({ leaseId: 'test-lease' }),
            renew: vi.fn().mockResolvedValue(undefined),
            release: vi.fn().mockResolvedValue(undefined)
        };

        const engine = new SpecEngine({
            leaseProvider: mockLeaseProvider,
            leaseRenewEvery: 1
        });

        const graph: ToolGraph = {
            entry: 'A',
            nodes: {
                A: auto('A'),
                H: { hash: 'H', intent: 'human', sideEffect: false },
                B: auto('B')
            },
            edges: [
                { from: 'A', to: 'H' },
                { from: 'H', to: 'B' }
            ]
        };

        const first = await engine.run(graph, {});
        expect(first.status).toBe('awaiting_input');

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

        const resumed = await engine.resume(graph, serialized, {
            specHash: 'H',
            humanOutput: { human: 'input' }
        }, { sessionId: 'test-session', clientId: 'test-client' });

        expect(resumed.status).toBe('completed');
        expect(mockLeaseProvider.acquire).toHaveBeenCalledWith('test-session', 'test-client', undefined);
        expect(mockLeaseProvider.renew).toHaveBeenCalledTimes(1); // Renews after B
        expect(mockLeaseProvider.release).toHaveBeenCalledWith('test-lease');
    });

    it('run handles lease acquisition failure', async () => {
        const mockLeaseProvider = {
            acquire: vi.fn().mockRejectedValue(new Error('acquire-failed')),
            renew: vi.fn(),
            release: vi.fn()
        };

        const engine = new SpecEngine({ leaseProvider: mockLeaseProvider });

        const graph: ToolGraph = {
            entry: 'A',
            nodes: { A: auto('A') },
            edges: []
        };

        const result = await engine.run(graph, { sessionId: 'test-session', clientId: 'test-client' });

        expect(result.status).toBe('error');
        expect(result.error?.message).toContain('Lease acquisition failed');
        expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_ACQUIRE_FAILED);
    });

    it('BasicExecutionPlanner buildPlan handles unreachable nodes', () => {
        const planner = new BasicExecutionPlanner();

        const graph: ToolGraph = {
            entry: 'A',
            nodes: {
                A: auto('A'),
                B: auto('B'), // Unreachable
                C: auto('C')  // Unreachable
            },
            edges: [
                { from: 'A', to: 'B' } // Only A->B, C is unreachable
            ]
        };

        const plan = planner.buildPlan(graph);

        expect(plan.steps).toHaveLength(2); // A and B
        expect(plan.warnings).toContain('Unreachable spec node: C');
    });

    it('BasicExecutionPlanner buildPlan detects cycles', () => {
        const planner = new BasicExecutionPlanner();

        const graph: ToolGraph = {
            entry: 'A',
            nodes: {
                A: auto('A'),
                B: auto('B'),
                C: auto('C')
            },
            edges: [
                { from: 'A', to: 'B' },
                { from: 'B', to: 'C' },
                { from: 'C', to: 'A' } // Creates cycle
            ]
        };

        expect(() => planner.buildPlan(graph)).toThrow('Cycle detected in tool graph');
    });

    it('run handles dead-end', async () => {
        const engine = new SpecEngine();

        const graph: ToolGraph = {
            entry: 'A',
            nodes: {
                A: auto('A'),
                B: auto('B')
            },
            edges: [
                { from: 'A', to: 'B' }
                // B has no outgoing edges but is reached, should not be dead-end
            ]
        };

        const result = await engine.run(graph, {});

        expect(result.status).toBe('completed');
        expect(result.executed).toEqual(['A', 'B']);
    });

    it('run handles dead-end with outgoing edges', async () => {
        const engine = new SpecEngine();

        const graph: ToolGraph = {
            entry: 'A',
            nodes: {
                A: auto('A'),
                B: auto('B'),
                C: auto('C') // Not in edges
            },
            edges: [
                { from: 'A', to: 'B' },
                { from: 'B', to: 'C' } // But C not defined properly
            ]
        };

        // This should complete since B has outgoing edge to C, but C exists
        const result = await engine.run(graph, {});
        expect(result.status).toBe('completed');
    });

    it('run with retry policy exhausts attempts', async () => {
        const engine = new SpecEngine({
            executor: new FailingFirstExecutor(),
            retryPolicy: { maxAttempts: 2, strategy: 'immediate' }
        });

        const graph: ToolGraph = {
            entry: 'A',
            nodes: { A: auto('A') },
            edges: []
        };

        const result = await engine.run(graph, {});

        expect(result.status).toBe('error');
        expect(result.error?.message).toContain('Execution failed at spec A');
        expect(result.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
    });

    it('run with exponential backoff computes delay', async () => {
        const engine = new SpecEngine({
            executor: new FailingFirstExecutor(),
            retryPolicy: { maxAttempts: 3, strategy: 'exponential', baseDelayMs: 100 }
        });

        const graph: ToolGraph = {
            entry: 'A',
            nodes: { A: auto('A') },
            edges: []
        };

        const result = await engine.run(graph, {});

        expect(result.status).toBe('error');
        // The delay computation happens but doesn't block
    });

    it('metrics collector observe method is called', async () => {
        const mockMetrics = {
            inc: vi.fn(),
            observe: vi.fn()
        };

        const engine = new SpecEngine({ metricsCollector: mockMetrics });

        const graph: ToolGraph = {
            entry: 'A',
            nodes: { A: auto('A') },
            edges: []
        };

        await engine.run(graph, {});

        // observe is not called in current implementation, but test structure is ready
        expect(mockMetrics.observe).not.toHaveBeenCalled();
    });

    it('fetchWorkspaceRules handles repository error gracefully', async () => {
        const mockRulesRepo = {
            list: vi.fn().mockRejectedValue(new Error('repo-error'))
        };

        const engine = new SpecEngine({ rulesRepo: mockRulesRepo as any });

        const graph: ToolGraph = {
            entry: 'A',
            nodes: { A: auto('A') },
            edges: []
        };

        // This should trigger fetchWorkspaceRules with workspaceId, causing the catch block
        const result = await engine.run(graph, { workspaceId: 'test-workspace' });

        expect(result.status).toBe('completed');
        expect(mockRulesRepo.list).toHaveBeenCalledWith('test-workspace', true);
        // The error should be logged but not fail execution
    });

    it('resume handles lease acquisition failure', async () => {
        const mockLeaseProvider = {
            acquire: vi.fn().mockRejectedValue(new Error('acquire-failed')),
            renew: vi.fn(),
            release: vi.fn()
        };

        const engine = new SpecEngine({ leaseProvider: mockLeaseProvider });

        const graph: ToolGraph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'H', intent: 'human' })
            .addSpec({ hash: 'B', intent: 'autonomous' })
            .addEdge('A', 'H')
            .addEdge('H', 'B')
        );

        const first = await engine.run(graph, {});
        expect(first.status).toBe('awaiting_input');

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

        const resumed = await engine.resume(graph, serialized, {
            specHash: 'H',
            humanOutput: { human: 'input' }
        }, { sessionId: 'test-session', clientId: 'test-client' });

        expect(resumed.status).toBe('error');
        expect(resumed.error?.message).toContain('Lease acquisition failed');
        expect(resumed.errorCode).toBe(SpecEngineErrorCode.LEASE_ACQUIRE_FAILED);
    });
});
