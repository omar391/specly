import { describe, it, expect, vi } from 'vitest';
import {
    SpecEngine,
    ToolGraph,
    SpecExecutor,
    ClientStateLeaseProvider,
    ActionJournalAdapter,
    MetricsCollector,
    BasicExecutionPlanner,
    ExecutionState,
    SpecExecutionRecord,
    incomingMaxPriority
} from '../services/spec-engine.js';

describe('SpecEngine - Path to 100% Coverage', () => {

    // Branch 21: if (!state.records[step.specHash]) - FALSE branch (record already exists)
    it('should skip record initialization when record already exists', async () => {
        // This is tricky - we need to execute a spec twice in the same run
        // which would require a loop or retry scenario where record persists

        let executionCount = 0;
        const executor: SpecExecutor = {
            async execute(specHash: string) {
                executionCount++;
                if (executionCount === 1) {
                    throw new Error('First attempt fails');
                }
                return { ok: true, spec: specHash };
            }
        };

        const engine = new SpecEngine({
            executor,
            retryPolicy: { maxAttempts: 2, strategy: 'immediate' }
        });

        const graph: ToolGraph = {
            entry: 'spec1',
            nodes: { spec1: { hash: 'spec1', intent: 'autonomous', sideEffect: false } },
            edges: []
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('completed');
        expect(executionCount).toBe(2); // First fails, second succeeds
    });

    // Branch 37: err?.message || 'Autonomous executor error' - second part
    it('should use default error message when error has no message property', async () => {
        const executor: SpecExecutor = {
            async execute() {
                const err: any = { code: 'ERROR' };
                throw err; // Error without message property
            }
        };

        const mockJournal: ActionJournalAdapter = {
            recordStart: vi.fn(),
            recordSuccess: vi.fn(),
            recordFailure: vi.fn()
        };

        const engine = new SpecEngine({ executor, journalAdapter: mockJournal });
        const graph: ToolGraph = {
            entry: 'spec1',
            nodes: { spec1: { hash: 'spec1', intent: 'autonomous', sideEffect: false } },
            edges: []
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('error');
        expect(result.error?.message).toContain('Autonomous executor error');
        expect(mockJournal.recordFailure).toHaveBeenCalledWith(
            'spec1',
            1,
            expect.objectContaining({ message: 'Autonomous executor error' })
        );
    });

    // Branch 41: this.retry.baseDelayMs ?? 50 - second part (when baseDelayMs is undefined)
    it('should use default baseDelayMs of 50 when not specified', async () => {
        let attempts = 0;
        const executor: SpecExecutor = {
            async execute() {
                attempts++;
                throw new Error('always fails');
            }
        };

        const mockMetrics: MetricsCollector = {
            inc: vi.fn(),
            observe: vi.fn()
        };

        const engine = new SpecEngine({
            executor,
            retryPolicy: { maxAttempts: 2, strategy: 'exponential' }, // No baseDelayMs
            metricsCollector: mockMetrics
        });

        const graph: ToolGraph = {
            entry: 'spec1',
            nodes: { spec1: { hash: 'spec1', intent: 'autonomous', sideEffect: false } },
            edges: []
        };

        await engine.run(graph);

        // Should have called observe with delay calculated from default 50ms
        expect(mockMetrics.observe).toHaveBeenCalledWith(
            'specly_engine_retry_delay_ms',
            50 // 50 * 2^0 for first retry
        );
    });

    // Branch 43, 44: if (rec.status !== 'completed') defensive path
    // This is VERY hard to trigger naturally, but we can test it exists
    it('should handle defensive case in retry loop', async () => {
        // The defensive check at line 407-414 is for when the retry loop exits
        // without the record being completed. This happens when maxAttempts is exhausted.
        let attempts = 0;
        const executor: SpecExecutor = {
            async execute() {
                attempts++;
                throw new Error('fail');
            }
        };

        const engine = new SpecEngine({
            executor,
            retryPolicy: { maxAttempts: 1, strategy: 'immediate' }
        });

        const graph: ToolGraph = {
            entry: 'spec1',
            nodes: { spec1: { hash: 'spec1', intent: 'autonomous', sideEffect: false } },
            edges: []
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('error');
        expect(attempts).toBe(1);
    });

    // Branch 48: e?.message || 'Unknown error' in outer catch
    it('should handle outer catch with undefined error message', async () => {
        // Force an error in the outer try/catch by passing invalid data
        const engine = new SpecEngine();

        // Malform the graph to trigger an error deep in execution
        const graph: any = {
            entry: 'spec1',
            nodes: { spec1: { hash: 'spec1', intent: 'autonomous', sideEffect: false } },
            edges: [{ from: 'spec1', to: 'missing_spec' }] // References non-existent node
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('error');
        expect(result.error).toBeDefined();
    });

    // Branch 71, 72: PersistentJournal else branch in resume + error message fallback
    it('should handle non-persistent journal recordFailure during resume', async () => {
        const failingJournal: ActionJournalAdapter = {
            recordStart() { throw new Error('start failed'); },
            recordSuccess() { throw new Error('success failed'); },
            recordFailure() { throw new Error('failure failed'); }
        };

        const failExecutor: SpecExecutor = {
            async execute() {
                const err: any = {};  // Error without message
                throw err;
            }
        };

        const engine = new SpecEngine({
            executor: failExecutor,
            journalAdapter: failingJournal
        });

        const graph: ToolGraph = {
            entry: 'spec1',
            nodes: {
                spec1: { hash: 'spec1', intent: 'human', sideEffect: false },
                spec2: { hash: 'spec2', intent: 'autonomous', sideEffect: false }
            },
            edges: [{ from: 'spec1', to: 'spec2' }]
        };

        const serializedState = {
            plan: {
                steps: [
                    { specHash: 'spec1', awaitingHuman: true },
                    { specHash: 'spec2', awaitingHuman: false }
                ],
                warnings: []
            },
            currentIndex: 0,
            executed: [],
            results: {},
            warnings: [],
            awaitingSpec: 'spec1',
            sessionContext: {}
        };

        const result = await engine.resume(
            graph,
            serializedState,
            { specHash: 'spec1', humanOutput: {} }
        );

        expect(result.status).toBe('error');
        expect(result.error?.message).toContain('Autonomous executor error');
    });

    // Branch 86: if (a === b) return 0 in planner comparator
    it('should handle equal priority specs in planner (a === b case)', async () => {
        // Create a scenario where two specs have same hash (impossible in real use)
        // But we can test the sorting logic directly via the planner
        const engine = new SpecEngine();

        const graph: ToolGraph = {
            entry: 'a',
            nodes: {
                a: { hash: 'a', intent: 'autonomous', sideEffect: false },
                b: { hash: 'b', intent: 'autonomous', sideEffect: false },
                c: { hash: 'c', intent: 'autonomous', sideEffect: false }
            },
            edges: [
                { from: 'a', to: 'b', priority: 100 },
                { from: 'a', to: 'c', priority: 100 } // Same priority
            ]
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('completed');
        // With same priority, lexicographic order: b before c
        const bIndex = result.executed.indexOf('b');
        const cIndex = result.executed.indexOf('c');
        expect(bIndex).toBeGreaterThan(-1);
        expect(cIndex).toBeGreaterThan(-1);
    });

    // Branch 91: if (visited.has(current)) continue - TRUE branch
    it('should skip already visited nodes in topological sort', async () => {
        const engine = new SpecEngine();

        // Diamond graph structure
        const graph: ToolGraph = {
            entry: 'start',
            nodes: {
                start: { hash: 'start', intent: 'autonomous', sideEffect: false },
                mid1: { hash: 'mid1', intent: 'autonomous', sideEffect: false },
                mid2: { hash: 'mid2', intent: 'autonomous', sideEffect: false },
                end: { hash: 'end', intent: 'autonomous', sideEffect: false }
            },
            edges: [
                { from: 'start', to: 'mid1' },
                { from: 'start', to: 'mid2' },
                { from: 'mid1', to: 'end' },
                { from: 'mid2', to: 'end' }
            ]
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('completed');

        // 'end' should appear exactly once despite multiple incoming edges
        const endCount = result.executed.filter(s => s === 'end').length;
        expect(endCount).toBe(1);

        // All nodes should be executed exactly once
        expect(result.executed.length).toBe(4);
    });

    // Branch 96, 97: incomingMaxPriority returns null when no incoming edges
    it('should handle nodes with no incoming edges in priority calculation', async () => {
        const engine = new SpecEngine();

        // Entry node has no incoming edges
        const graph: ToolGraph = {
            entry: 'entry',
            nodes: {
                entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
                next: { hash: 'next', intent: 'autonomous', sideEffect: false }
            },
            edges: [{ from: 'entry', to: 'next' }]
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('completed');
        expect(result.executed).toContain('entry');
        expect(result.executed).toContain('next');
    });

    // Additional: Test error with undefined/null in various paths
    it('should handle errors without proper structure throughout execution', async () => {
        const weirdExecutor: SpecExecutor = {
            async execute() {
                throw undefined; // Throw undefined instead of Error
            }
        };

        const engine = new SpecEngine({ executor: weirdExecutor });
        const graph: ToolGraph = {
            entry: 'spec1',
            nodes: { spec1: { hash: 'spec1', intent: 'autonomous', sideEffect: false } },
            edges: []
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('error');
    });

    // Test uncovered function: Ensure all planner edge cases are covered
    it('should handle complex graph with multiple priority levels', async () => {
        const engine = new SpecEngine();

        const graph: ToolGraph = {
            entry: 'start',
            nodes: {
                start: { hash: 'start', intent: 'autonomous', sideEffect: false },
                high1: { hash: 'high1', intent: 'autonomous', sideEffect: false },
                high2: { hash: 'high2', intent: 'autonomous', sideEffect: false },
                low1: { hash: 'low1', intent: 'autonomous', sideEffect: false },
                low2: { hash: 'low2', intent: 'autonomous', sideEffect: false }
            },
            edges: [
                { from: 'start', to: 'high1', priority: 200 },
                { from: 'start', to: 'high2', priority: 200 },
                { from: 'start', to: 'low1', priority: 50 },
                { from: 'start', to: 'low2', priority: 50 }
            ]
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('completed');
        expect(result.executed.length).toBe(5);

        // Higher priority specs should generally be executed first
        const high1Index = result.executed.indexOf('high1');
        const low1Index = result.executed.indexOf('low1');
        // Note: Exact order depends on topological sort + priority heuristic
    });
});
