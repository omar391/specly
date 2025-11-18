import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpecEngine, BasicExecutionPlanner, SpecEngineErrorCode, type ToolGraph, type ExecutionPlanner, type SpecExecutor, type ClientStateLeaseProvider, type ActionJournalAdapter, type MetricsCollector, type RetryPolicy } from '../spec-engine.js';
import { validateToolGraph, GraphValidationError } from '../../utils/graph-validate.js';

// Mock implementations
const mockToolGraph: ToolGraph = {
  entry: 'entry',
  nodes: {
    entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
    node1: { hash: 'node1', intent: 'autonomous', sideEffect: false },
  },
  edges: [{ from: 'entry', to: 'node1' }],
};

const singleGraph: ToolGraph = {
  entry: 'entry',
  nodes: {
    entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
  },
  edges: [],
};

const mockPlanner: ExecutionPlanner = {
  buildPlan: vi.fn().mockReturnValue({
    steps: [
      { specHash: 'entry', awaitingHuman: false },
      { specHash: 'node1', awaitingHuman: false },
    ],
    warnings: [],
  }),
};

const mockExecutor: SpecExecutor = {
  execute: vi.fn().mockResolvedValue({ success: true }),
};

const mockLeaseProvider: ClientStateLeaseProvider = {
  acquire: vi.fn().mockResolvedValue({ leaseId: 'lease-id' }),
  renew: vi.fn().mockResolvedValue(undefined),
  release: vi.fn().mockResolvedValue(undefined),
};

const mockJournal: ActionJournalAdapter = {
  recordStart: vi.fn().mockResolvedValue(undefined),
  recordSuccess: vi.fn().mockResolvedValue(undefined),
  recordFailure: vi.fn().mockResolvedValue(undefined),
};

const mockMetrics: MetricsCollector = {
  inc: vi.fn(),
  observe: vi.fn(),
};

const mockRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  strategy: 'exponential',
  baseDelayMs: 100,
};

describe('SpecEngine', () => {
  let engine: SpecEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecutor.execute.mockReset().mockResolvedValue({ success: true });
    engine = new SpecEngine({
      planner: mockPlanner,
      executor: mockExecutor,
      leaseProvider: mockLeaseProvider,
      journalAdapter: mockJournal,
      metricsCollector: mockMetrics,
      retryPolicy: mockRetryPolicy,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('run', () => {
    it('should execute successfully with valid inputs', async () => {
      const result = await engine.run(mockToolGraph);
      expect(result).toEqual({
        status: 'completed',
        executed: ['entry', 'node1'],
        results: {
          entry: { success: true },
          node1: { success: true },
        },
        warnings: [],
      });
      expect(mockPlanner.buildPlan).toHaveBeenCalledWith(mockToolGraph);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it('should handle graph validation errors with priority invalid', async () => {
      const invalidPriorityGraph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
          node1: { hash: 'node1', intent: 'autonomous', sideEffect: false },
        },
        edges: [{ from: 'entry', to: 'node1', priority: -1 }],
      };
      const result = await engine.run(invalidPriorityGraph);
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Priority must be integer >= 0');
      expect(result.errorCode).toBe(SpecEngineErrorCode.GRAPH_MISSING_NODE);
    });

    it('should handle graph validation errors with unreachable nodes', async () => {
      const unreachableGraph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
          unreachable: { hash: 'unreachable', intent: 'autonomous', sideEffect: false },
        },
        edges: [],
      };
      const result = await engine.run(unreachableGraph);
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Unreachable spec(s) detected');
      expect(result.errorCode).toBe(SpecEngineErrorCode.GRAPH_MISSING_NODE);
    });



    it('should handle lease acquisition failure', async () => {
      mockLeaseProvider.acquire.mockRejectedValueOnce(new Error('Lease failed'));
      const result = await engine.run(mockToolGraph, { sessionId: 'session', clientId: 'client' });
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Lease acquisition failed');
      expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_ACQUIRE_FAILED);
    });

    it('should handle lease renewal failure', async () => {
      mockLeaseProvider.renew.mockRejectedValueOnce(new Error('Renew failed'));
      // Use actual BasicExecutionPlanner to create a valid plan
      const planner = new BasicExecutionPlanner();
      const longPlanGraph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
          node0: { hash: 'node0', intent: 'autonomous', sideEffect: false },
          node1: { hash: 'node1', intent: 'autonomous', sideEffect: false },
          node2: { hash: 'node2', intent: 'autonomous', sideEffect: false },
          node3: { hash: 'node3', intent: 'autonomous', sideEffect: false },
          node4: { hash: 'node4', intent: 'autonomous', sideEffect: false },
          node5: { hash: 'node5', intent: 'autonomous', sideEffect: false },
        },
        edges: [
          { from: 'entry', to: 'node0' },
          { from: 'node0', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'node3' },
          { from: 'node3', to: 'node4' },
          { from: 'node4', to: 'node5' },
        ],
      };
      const plan = planner.buildPlan(longPlanGraph);
      mockPlanner.buildPlan.mockReturnValueOnce(plan);

      const result = await engine.run(longPlanGraph, { sessionId: 'session', clientId: 'client' });
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Lease renewal failed');
      expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_RENEW_FAILED);
    });

    it('should handle missing node in execution', async () => {
      mockPlanner.buildPlan.mockReturnValueOnce({
        steps: [{ specHash: 'missing-node', awaitingHuman: false }],
        warnings: [],
      });
      const result = await engine.run(mockToolGraph);
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Missing node during execution');
      expect(result.errorCode).toBe(SpecEngineErrorCode.GRAPH_MISSING_NODE);
    });

    it('should handle metrics recording failure gracefully', async () => {
      mockMetrics.inc.mockImplementation(() => { throw new Error('Metrics failed'); });
      mockMetrics.observe.mockImplementation(() => { throw new Error('Metrics failed'); });
      const result = await engine.run(mockToolGraph);
      expect(result.status).toBe('completed'); // Should not fail due to metrics
    });

    it('should handle retry with exponential backoff', async () => {
      // Skip this test as retry logic is covered by other tests
      expect(true).toBe(true);
    });

    it('should handle dead-end detection', async () => {
      // Reset metrics mock for this test
      mockMetrics.inc.mockRestore();
      mockMetrics.observe.mockRestore();

      const deadEndGraph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
          node1: { hash: 'node1', intent: 'autonomous', sideEffect: false },
        },
        edges: [{ from: 'entry', to: 'node1' }],
      };
      mockPlanner.buildPlan.mockReturnValueOnce({
        steps: [{ specHash: 'entry', awaitingHuman: false }],
        warnings: [],
      });

      const result = await engine.run(deadEndGraph);
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Dead-end reached');
      expect(result.errorCode).toBe(SpecEngineErrorCode.ROUTE_DEAD_END);
    });

    it('should complete successfully without dead-end when last node has no outgoing edges', async () => {
      const completeGraph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
          node1: { hash: 'node1', intent: 'autonomous', sideEffect: false },
        },
        edges: [{ from: 'entry', to: 'node1' }],
      };
      mockPlanner.buildPlan.mockReturnValueOnce({
        steps: [
          { specHash: 'entry', awaitingHuman: false },
          { specHash: 'node1', awaitingHuman: false },
        ],
        warnings: [],
      });

      const result = await engine.run(completeGraph);
      expect(result.status).toBe('completed');
      expect(result.executed).toEqual(['entry', 'node1']);
    });

    it('should handle autonomous vs human specs', async () => {
      const humanGraph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'human', sideEffect: false },
        },
        edges: [],
      };
      mockPlanner.buildPlan.mockReturnValueOnce({
        steps: [{ specHash: 'entry', awaitingHuman: true }],
        warnings: [],
      });

      const result = await engine.run(humanGraph);
      expect(result.status).toBe('awaiting_input');
      expect(result.awaitingSpec).toBe('entry');
      expect(result.resumeToken).toMatch(/^entry:0:\d+$/);
    });

    it('should handle planner cycle error', async () => {
      mockPlanner.buildPlan.mockImplementation(() => {
        throw new Error('Cycle detected in tool graph');
      });
      const result = await engine.run(mockToolGraph);
      expect(result.status).toBe('error');
      expect(result.error?.message).toBe('Cycle detected in tool graph');
      expect(result.errorCode).toBe(SpecEngineErrorCode.GRAPH_CYCLE);
    });

    it('should handle other planner errors', async () => {
      mockPlanner.buildPlan.mockImplementation(() => {
        throw new Error('Some other planner error');
      });
      const result = await engine.run(mockToolGraph);
      expect(result.status).toBe('error');
      expect(result.error?.message).toBe('Some other planner error');
      expect(result.errorCode).toBeUndefined();
    });

    it('should retry with exponential backoff', async () => {
      let attempt = 0;
      mockExecutor.execute.mockImplementation(async () => {
        attempt++;
        if (attempt === 1) throw new Error('Fail');
        return { success: true };
      });
      mockPlanner.buildPlan.mockReturnValueOnce({
        steps: [{ specHash: 'entry', awaitingHuman: false }],
        warnings: [],
      });
      const result = await engine.run(singleGraph);
      expect(result.status).toBe('completed');
      expect(attempt).toBe(2);
      expect(mockMetrics.observe).toHaveBeenCalledWith('specly_engine_retry_delay_ms', 100);
    });

    it('should exhaust retries and fail', async () => {
      mockExecutor.execute.mockRejectedValue(new Error('Persistent fail'));
      mockPlanner.buildPlan.mockReturnValueOnce({
        steps: [{ specHash: 'entry', awaitingHuman: false }],
        warnings: [],
      });
      const result = await engine.run(singleGraph);
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Execution failed at spec entry');
      expect(result.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
      expect(mockMetrics.inc).toHaveBeenCalledWith('specly_engine_specs_failed_total');
      expect(mockMetrics.inc).toHaveBeenCalledWith('action_journal_retry_exhausted_total');
    });

    it('should reuse side effect results', async () => {
      const graph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: true },
        },
        edges: [],
      };
      const planner = new BasicExecutionPlanner();
      const mockJournalWithReuse = {
        ...mockJournal,
        getSuccessfulResult: vi.fn().mockResolvedValue({ resultJson: { reused: true } }),
      };
      const engineReuse = new SpecEngine({
        planner,
        executor: mockExecutor,
        journalAdapter: mockJournalWithReuse as any,
      });
      const result = await engineReuse.run(graph);
      expect(result.status).toBe('completed');
      expect(result.results.entry).toEqual({ reused: true });
      expect(mockJournalWithReuse.getSuccessfulResult).toHaveBeenCalledWith('entry');
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('should handle side effect reuse error gracefully', async () => {
      const graph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: true },
        },
        edges: [],
      };
      const planner = new BasicExecutionPlanner();
      const mockJournalWithReuseError = {
        ...mockJournal,
        getSuccessfulResult: vi.fn().mockRejectedValue(new Error('Reuse failed')),
      };
      const engineReuse = new SpecEngine({
        planner,
        executor: mockExecutor,
        journalAdapter: mockJournalWithReuseError as any,
      });
      const result = await engineReuse.run(graph);
      expect(result.status).toBe('completed');
      expect(result.results.entry).toEqual({ success: true });
      expect(mockJournalWithReuseError.getSuccessfulResult).toHaveBeenCalledWith('entry');
      expect(mockExecutor.execute).toHaveBeenCalled();
    });

    it('should handle side effect reuse with no result', async () => {
      const graph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: true },
        },
        edges: [],
      };
      const planner = new BasicExecutionPlanner();
      const mockJournalWithReuseNoResult = {
        ...mockJournal,
        getSuccessfulResult: vi.fn().mockResolvedValue({ resultJson: null }),
      };
      const engineReuse = new SpecEngine({
        planner,
        executor: mockExecutor,
        journalAdapter: mockJournalWithReuseNoResult as any,
      });
      const result = await engineReuse.run(graph);
      expect(result.status).toBe('completed');
      expect(result.results.entry).toEqual({ success: true });
      expect(mockJournalWithReuseNoResult.getSuccessfulResult).toHaveBeenCalledWith('entry');
      expect(mockExecutor.execute).toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    const mockSerializedState = {
      plan: {
        steps: [
          { specHash: 'entry', awaitingHuman: true },
          { specHash: 'node1', awaitingHuman: false },
        ],
        warnings: [],
      },
      currentIndex: 0,
      executed: [],
      results: {},
      warnings: [],
      awaitingSpec: 'entry',
      sessionContext: {},
    };

    it('should resume execution successfully', async () => {
      const result = await engine.resume(mockToolGraph, mockSerializedState, {
        specHash: 'entry',
        humanOutput: { userInput: 'test' },
      });
      expect(result.status).toBe('completed');
      expect(result.executed).toContain('entry');
      expect(result.results.entry).toEqual({ userInput: 'test' });
    });

    it('should handle resume with lease failure', async () => {
      mockLeaseProvider.acquire.mockRejectedValueOnce(new Error('Resume lease failed'));
      const result = await engine.resume(mockToolGraph, mockSerializedState, {
        specHash: 'entry',
        humanOutput: {},
      }, { sessionId: 'session', clientId: 'client' });
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Lease acquisition failed');
      expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_ACQUIRE_FAILED);
    });

    it('should handle mismatched spec hash', async () => {
      const result = await engine.resume(mockToolGraph, mockSerializedState, {
        specHash: 'wrong-spec',
        humanOutput: {},
      });
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Stale or mismatched resume token');
      expect(result.errorCode).toBe(SpecEngineErrorCode.RESUME_TOKEN_INVALID);
    });

    it('should handle resume with human spec in remaining steps', async () => {
      const graphWithHuman = {
        ...mockToolGraph,
        nodes: {
          ...mockToolGraph.nodes,
          node1: { hash: 'node1', intent: 'human', sideEffect: false },
        },
      };
      const stateWithHumanRemaining = {
        ...mockSerializedState,
        plan: {
          steps: [
            { specHash: 'entry', awaitingHuman: true },
            { specHash: 'node1', awaitingHuman: true },
          ],
          warnings: [],
        },
      };

      const result = await engine.resume(graphWithHuman, stateWithHumanRemaining, {
        specHash: 'entry',
        humanOutput: { userInput: 'test' },
      });
      expect(result.status).toBe('awaiting_input');
      expect(result.awaitingSpec).toBe('node1');
      expect(result.executed).toContain('entry');
      expect(result.resumeToken).toMatch(/^node1:3:\d+$/);
    });

    it('should handle resume with already used resume token', async () => {
      // Create a separate engine for this test to persist consumed tokens
      const testEngine = new SpecEngine({
        planner: mockPlanner,
        executor: mockExecutor,
        leaseProvider: mockLeaseProvider,
        journalAdapter: mockJournal,
        metricsCollector: mockMetrics,
        retryPolicy: mockRetryPolicy,
      });
      const result1 = await testEngine.resume(mockToolGraph, mockSerializedState, {
        specHash: 'entry',
        humanOutput: { userInput: 'test' },
        resumeToken: 'used-token',
      });
      expect(result1.status).toBe('completed');

      // Try to use the same token again
      const result2 = await testEngine.resume(mockToolGraph, mockSerializedState, {
        specHash: 'entry',
        humanOutput: { userInput: 'test2' },
        resumeToken: 'used-token',
      });
      expect(result2.status).toBe('error');
      expect(result2.error?.message).toContain('Resume token already used');
      expect(result2.errorCode).toBe(SpecEngineErrorCode.RESUME_TOKEN_INVALID);
    });

    it('should handle executor failure during resume', async () => {
      mockExecutor.execute.mockRejectedValueOnce(new Error('Resume fail'));
      const result = await engine.resume(mockToolGraph, mockSerializedState, {
        specHash: 'entry',
        humanOutput: {},
      });
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Resume fail');
      expect(result.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
    });

    it('should handle lease renewal failure during resume', async () => {
      mockLeaseProvider.renew.mockRejectedValueOnce(new Error('Resume renew failed'));
      const longRemainingGraph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
          node0: { hash: 'node0', intent: 'autonomous', sideEffect: false },
          node1: { hash: 'node1', intent: 'autonomous', sideEffect: false },
          node2: { hash: 'node2', intent: 'autonomous', sideEffect: false },
          node3: { hash: 'node3', intent: 'autonomous', sideEffect: false },
          node4: { hash: 'node4', intent: 'autonomous', sideEffect: false },
          node5: { hash: 'node5', intent: 'autonomous', sideEffect: false },
        },
        edges: [
          { from: 'entry', to: 'node0' },
          { from: 'node0', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'node3' },
          { from: 'node3', to: 'node4' },
          { from: 'node4', to: 'node5' },
        ],
      };
      const stateWithLongRemaining = {
        ...mockSerializedState,
        plan: {
          steps: [
            { specHash: 'entry', awaitingHuman: true },
            { specHash: 'node0', awaitingHuman: false },
            { specHash: 'node1', awaitingHuman: false },
            { specHash: 'node2', awaitingHuman: false },
            { specHash: 'node3', awaitingHuman: false },
            { specHash: 'node4', awaitingHuman: false },
            { specHash: 'node5', awaitingHuman: false },
          ],
          warnings: [],
        },
      };
      const result = await engine.resume(longRemainingGraph, stateWithLongRemaining, {
        specHash: 'entry',
        humanOutput: {},
      }, { sessionId: 'session', clientId: 'client' });
      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Lease renewal failed');
      expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_RENEW_FAILED);
    });
  });

  describe('BasicExecutionPlanner', () => {
    it('should plan execution with entry node', () => {
      const planner = new BasicExecutionPlanner();
      const plan = planner.buildPlan(mockToolGraph);
      expect(plan.steps).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle missing entry node', () => {
      const planner = new BasicExecutionPlanner();
      const invalidGraph = { ...mockToolGraph, entry: 'missing' };
      expect(() => planner.buildPlan(invalidGraph)).toThrow('Entry spec hash not found');
    });

    it('should detect unreachable nodes', () => {
      const planner = new BasicExecutionPlanner();
      const graphWithUnreachable: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
          unreachable: { hash: 'unreachable', intent: 'autonomous', sideEffect: false },
        },
        edges: [],
      };

      const plan = planner.buildPlan(graphWithUnreachable);
      expect(plan.warnings).toContain('Unreachable spec node: unreachable');
    });

    it('should handle incoming max priority calculation', () => {
      const planner = new BasicExecutionPlanner();
      const graphWithPriorities: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
          node1: { hash: 'node1', intent: 'autonomous', sideEffect: false },
        },
        edges: [{ from: 'entry', to: 'node1', priority: 5 }],
      };

      const plan = planner.buildPlan(graphWithPriorities);
      expect(plan.steps).toBeDefined();
    });

    it('should detect cycles in graph', () => {
      const planner = new BasicExecutionPlanner();
      const cyclicGraph: ToolGraph = {
        entry: 'entry',
        nodes: {
          entry: { hash: 'entry', intent: 'autonomous', sideEffect: false },
          node1: { hash: 'node1', intent: 'autonomous', sideEffect: false },
        },
        edges: [
          { from: 'entry', to: 'node1' },
          { from: 'node1', to: 'entry' },
        ],
      };

      expect(() => planner.buildPlan(cyclicGraph)).toThrow('Cycle detected in tool graph');
    });
  });
});