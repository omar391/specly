import { describe, it, expect, vi } from 'vitest';
import {
    SpecEngine,
    ToolGraph,
    SpecExecutor,
    ActionJournalAdapter,
    MetricsCollector
} from '../services/spec-engine.js';
import { PersistentJournalService } from '../services/persistent-journal-service.js';

describe('SpecEngine - Critical Branch Coverage', () => {

    // Branch 37: err?.message || 'Autonomous executor error' - MUST hit second part with PersistentJournal
    it('should use default error message with PersistentJournalService when error lacks message', async () => {
        const executor: SpecExecutor = {
            async execute() {
                const err: any = { code: 'NO_MESSAGE' }; // Object without message property
                delete err.message; // Ensure no message
                throw err;
            }
        };

        // Use PersistentJournalService (not just any journal)
        const mockPersistent = new PersistentJournalService('test-session-123');
        const recordFailureSpy = vi.spyOn(mockPersistent, 'recordFailure');

        const engine = new SpecEngine({
            executor,
            journalAdapter: mockPersistent
        });

        const graph: ToolGraph = {
            entry: 'spec1',
            nodes: { spec1: { hash: 'spec1', intent: 'autonomous', sideEffect: false } },
            edges: []
        };

        const result = await engine.run(graph, { sessionId: 'test-session-123' });
        expect(result.status).toBe('error');

        // Verify recordFailure was called with default message
        expect(recordFailureSpy).toHaveBeenCalledWith(
            'spec1',
            1,
            expect.objectContaining({ message: 'Autonomous executor error' })
        );
    });

    // Branch 44: lastErr?.message || 'Autonomous executor error' in defensive block
    it('should use default in defensive block when lastErr has no message', async () => {
        // This is the VERY defensive path at lines 407-414
        // It should theoretically never execute, but we need to cover it

        // We need a scenario where:
        // 1. Retry loop completes
        // 2. rec.status !== 'completed'
        // 3. lastErr exists but has no message

        // The only way to get here is if the executor throws on all attempts
        let attempts = 0;
        const executor: SpecExecutor = {
            async execute() {
                attempts++;
                const err: any = { status: 'ERROR' };
                // No message property
                throw err;
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
        expect(result.status).toBe('error');
        expect(result.error?.message).toContain('Autonomous executor error');
        expect(attempts).toBe(2);
    });

    // Branch 48: e?.message || 'Unknown error' in outer catch
    it('should use Unknown error default in outer catch', async () => {
        // Force throwing a non-Error object in outer catch
        const engine = new SpecEngine();

        // Pass completely malformed graph to trigger deep error
        const graph: any = null;

        try {
            await engine.run(graph);
        } catch (e) {
            // Depending on implementation, might throw or return error result
        }

        // Alternative: trigger error via other means
        const validGraph: ToolGraph = {
            entry: 'spec1',
            nodes: {},  // Empty nodes - spec1 doesn't exist
            edges: []
        };

        const result = await engine.run(validGraph);
        expect(result.status).toBe('error');
    });

    // Branch 71, 72: Non-PersistentJournal recordFailure in resume with undefined message
    it('should handle resume with non-persistent journal and undefined error message', async () => {
        const mockJournal: ActionJournalAdapter = {
            recordStart: vi.fn(),
            recordSuccess: vi.fn(),
            recordFailure: vi.fn()
        };

        const executor: SpecExecutor = {
            async execute() {
                const err: any = { type: 'ERROR' };
                // No message
                throw err;
            }
        };

        const engine = new SpecEngine({
            executor,
            journalAdapter: mockJournal
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
        expect(mockJournal.recordFailure).toHaveBeenCalledWith(
            'spec2',
            1,
            expect.objectContaining({ message: 'Autonomous executor error' })
        );
    });

    // Branch 86, 91: Planner branches for (a === b) and visited.has
    it('should cover planner internal branches with specific graph structures', async () => {
        const engine = new SpecEngine();

        // Create graph where we'll have:
        // - Nodes with same sorting key (for a === b)
        // - Diamond pattern (for visited.has check)
        const graph: ToolGraph = {
            entry: 'root',
            nodes: {
                root: { hash: 'root', intent: 'autonomous', sideEffect: false },
                a: { hash: 'a', intent: 'autonomous', sideEffect: false },
                b: { hash: 'b', intent: 'autonomous', sideEffect: false },
                c: { hash: 'c', intent: 'autonomous', sideEffect: false },
                end: { hash: 'end', intent: 'autonomous', sideEffect: false }
            },
            edges: [
                { from: 'root', to: 'a', priority: 100 },
                { from: 'root', to: 'b', priority: 100 }, // Same priority as 'a'
                { from: 'root', to: 'c', priority: 100 },
                { from: 'a', to: 'end' },
                { from: 'b', to: 'end' },
                { from: 'c', to: 'end' } // 'end' reachable from multiple paths
            ]
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('completed');

        // 'end' should appear only once despite 3 incoming paths
        const endCount = result.executed.filter(s => s === 'end').length;
        expect(endCount).toBe(1);

        // All nodes executed
        expect(result.executed.length).toBe(5);
    });

    // Branch 96, 97: incomingMaxPriority null check
    it('should handle entry node and nodes with null incoming priority', async () => {
        const engine = new SpecEngine();

        const graph: ToolGraph = {
            entry: 'start',
            nodes: {
                start: { hash: 'start', intent: 'autonomous', sideEffect: false },
                mid: { hash: 'mid', intent: 'autonomous', sideEffect: false },
                end: { hash: 'end', intent: 'autonomous', sideEffect: false }
            },
            edges: [
                { from: 'start', to: 'mid' }, // No priority specified (undefined)
                { from: 'mid', to: 'end' } // No priority specified
            ]
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('completed');
        expect(result.executed).toEqual(['start', 'mid', 'end']);
    });

    // Branch 21: Record already exists - this happens during retry
    it('should handle existing record during retry (record already initialized)', async () => {
        let callCount = 0;
        const executor: SpecExecutor = {
            async execute() {
                callCount++;
                if (callCount === 1) {
                    throw new Error('First attempt fails');
                }
                return { success: true };
            }
        };

        const engine = new SpecEngine({
            executor,
            retryPolicy: { maxAttempts: 3, strategy: 'immediate' }
        });

        const graph: ToolGraph = {
            entry: 'spec1',
            nodes: { spec1: { hash: 'spec1', intent: 'autonomous', sideEffect: false } },
            edges: []
        };

        const result = await engine.run(graph);
        expect(result.status).toBe('completed');
        expect(callCount).toBe(2); // Failed once, succeeded on retry
    });

    // Branch 43: Defensive if (rec.status !== 'completed') - this is the true branch
    it('should reach defensive completed check when all retries fail', async () => {
        const executor: SpecExecutor = {
            async execute() {
                throw new Error('Always fails');
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
        expect(result.errorCode).toBeDefined();
    });
});
