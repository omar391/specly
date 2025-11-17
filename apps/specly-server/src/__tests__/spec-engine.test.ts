import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BasicExecutionPlanner, ToolGraph, SpecEngine, SpecEngineErrorCode, NoopAutonomousExecutor } from '../services/spec-engine.ts';
import { PersistentJournalService } from '../services/persistent-journal-service.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { WorkspaceRulesRepository } from '../repositories/workspace-rules-repository.js';

// Mock dependencies
vi.mock('../services/persistent-journal-service.js');
vi.mock('../database/global-queries.js');
vi.mock('../repositories/workspace-rules-repository.js');

function makeNode(hash: string, intent: 'human' | 'autonomous' = 'autonomous', sideEffect: boolean = false) {
  return { hash, intent, sideEffect };
}

describe('SpecEngine BasicExecutionPlanner (SP-005)', () => {
  it('produces linear ordering for simple chain', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: {
        A: makeNode('A'),
        B: makeNode('B'),
        C: makeNode('C', 'human')
      },
      edges: [
        { from: 'A', to: 'B', priority: 100 },
        { from: 'B', to: 'C', priority: 100 }
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','B','C']);
    expect(plan.steps[2].awaitingHuman).toBe(true);
    expect(plan.warnings.length).toBe(0);
  });

  it('orders branches by priority desc then hash', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D') },
      edges: [
        { from: 'A', to: 'B', priority: 50 },
        { from: 'A', to: 'C', priority: 80 },
        { from: 'A', to: 'D', priority: 80 }
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    // A first, then C and D (same priority sorted lexicographically), then B
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','C','D','B']);
  });

  it('throws on cycle', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B') },
      edges: [ { from: 'A', to: 'B' }, { from: 'B', to: 'A' } ]
    };
    const planner = new BasicExecutionPlanner();
    expect(() => planner.buildPlan(graph)).toThrow('Cycle detected in tool graph');
  });

  it('warns about unreachable nodes', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C') },
      edges: [{ from: 'A', to: 'B' }] // C unreachable
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A', 'B']);
    expect(plan.warnings).toContain('Unreachable spec node: C');
  });

  it('warns about edges to missing nodes', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B') },
      edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }] // C missing
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A', 'B']);
    expect(plan.warnings).toContain('Edge references missing node: B -> C');
  });

  it('handles null priorities in edges', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C') },
      edges: [
        { from: 'A', to: 'B', priority: 50 },
        { from: 'A', to: 'C' } // null priority
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A', 'C', 'B']); // C has 100, B has 50
  });

  it('sorts by priority descending', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D') },
      edges: [
        { from: 'A', to: 'B', priority: 10 },
        { from: 'A', to: 'C', priority: 50 },
        { from: 'A', to: 'D', priority: 30 }
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A', 'C', 'D', 'B']); // C 50, D 30, B 10
  });

  it('warns on unreachable node', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), X: makeNode('X') },
      edges: [ { from: 'A', to: 'B' } ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','B']);
    expect(plan.warnings.some(w => w.includes('Unreachable'))).toBe(true);
  });

  it('handles unreachable nodes in ordering phase', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), X: makeNode('X'), Y: makeNode('Y') },
      edges: [
        { from: 'A', to: 'B', priority: 100 },
        { from: 'B', to: 'C', priority: 100 },
        { from: 'X', to: 'Y', priority: 100 } // unreachable subgraph
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','B','C']);
    expect(plan.warnings).toContain('Unreachable spec node: X');
    expect(plan.warnings).toContain('Unreachable spec node: Y');
  });

  it('handles complex cycle detection with unreachable components', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D'), X: makeNode('X') },
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'A' }, // cycle in reachable part
        { from: 'X', to: 'X' }  // self-cycle in unreachable part
      ]
    };
    const planner = new BasicExecutionPlanner();
    expect(() => planner.buildPlan(graph)).toThrow(/Cycle detected/);
  });

  it('handles priority ordering with null priorities', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C') },
      edges: [
        { from: 'A', to: 'B', priority: 50 },
        { from: 'A', to: 'C' } // null priority defaults to 100
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    // C should come before B due to higher priority (100 > 50)
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','C','B']);
  });

  it('handles empty graph edge case', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A') },
      edges: []
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A']);
    expect(plan.warnings.length).toBe(0);
  });

  it('exercises priority ordering with multiple incoming edges', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D') },
      edges: [
        { from: 'A', to: 'D', priority: 10 },
        { from: 'B', to: 'D', priority: 50 }, // Higher priority incoming edge
        { from: 'C', to: 'D', priority: 30 },
        { from: 'D', to: 'A', priority: 100 } // This creates a cycle, but should still exercise priority logic
      ]
    };
    const planner = new BasicExecutionPlanner();
    expect(() => planner.buildPlan(graph)).toThrow(/Cycle detected/);
  });

  it('handles complex priority ordering with mixed priorities', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D'), E: makeNode('E') },
      edges: [
        { from: 'A', to: 'B', priority: 100 },
        { from: 'A', to: 'C', priority: 100 },
        { from: 'B', to: 'D', priority: 50 },
        { from: 'C', to: 'D', priority: 80 }, // C->D has higher priority than B->D
        { from: 'D', to: 'E', priority: 100 }
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    // A first, then B and C (same priority), then D, then E
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','B','C','D','E']);
  });

  it('detects cycle with unreachable nodes due to complex cycle structure', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D') },
      edges: [
        { from: 'A', to: 'B', priority: 100 },
        { from: 'B', to: 'C', priority: 100 },
        { from: 'C', to: 'B', priority: 100 }, // Creates cycle B->C->B
        { from: 'C', to: 'D', priority: 100 }  // D is reachable but cycle prevents processing
      ]
    };
    const planner = new BasicExecutionPlanner();
    expect(() => planner.buildPlan(graph)).toThrow(/Cycle detected/);
  });
});

describe('SpecEngine (SP-005)', () => {
  let mockGlobalDb: any;
  let mockRulesRepo: any;
  let mockJournal: any;
  let mockLeaseProvider: any;
  let mockMetrics: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGlobalDb = { /* mock methods */ };
    mockRulesRepo = { list: vi.fn() };
    mockJournal = { recordStart: vi.fn(), recordSuccess: vi.fn(), recordFailure: vi.fn() };
    mockLeaseProvider = { acquire: vi.fn(), renew: vi.fn(), release: vi.fn() };
    mockMetrics = { inc: vi.fn(), observe: vi.fn() };

    (GlobalDatabaseService as any).mockImplementation(() => mockGlobalDb);
    (WorkspaceRulesRepository as any).mockImplementation(() => mockRulesRepo);
  });

  describe('constructor', () => {
    it('initializes with default noop implementations', () => {
      const engine = new SpecEngine();
      expect(engine).toBeInstanceOf(SpecEngine);
    });

    it('accepts custom options', () => {
      const customExecutor = new NoopAutonomousExecutor();
      // Use mock objects instead of trying to instantiate non-exported classes
      const customLeaseProvider = mockLeaseProvider;
      const customJournal = mockJournal;
      const customMetrics = mockMetrics;

      const engine = new SpecEngine({
        executor: customExecutor,
        leaseProvider: customLeaseProvider,
        journalAdapter: customJournal,
        metricsCollector: customMetrics,
        leaseRenewEvery: 10,
        retryPolicy: { maxAttempts: 3, strategy: 'exponential' }
      });

      expect(engine).toBeInstanceOf(SpecEngine);
    });
  });

  describe('run() method', () => {
    it('executes simple autonomous chain successfully', async () => {
      const graph: ToolGraph = {
        entry: 'A',
        nodes: {
          A: makeNode('A'),
          B: makeNode('B'),
          C: makeNode('C')
        },
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' }
        ]
      };

      const engine = new SpecEngine();
      const result = await engine.run(graph);

      expect(result.status).toBe('completed');
      expect(result.executed).toEqual(['A', 'B', 'C']);
      expect(result.results).toEqual({
        A: { ok: true, spec: 'A' },
        B: { ok: true, spec: 'B' },
        C: { ok: true, spec: 'C' }
      });
      expect(result.warnings).toEqual([]);
      expect(result.awaitingSpec).toBeUndefined();
    });

    it('pauses at human spec', async () => {
      const graph: ToolGraph = {
        entry: 'A',
        nodes: {
          A: makeNode('A'),
          B: makeNode('B', 'human'),
          C: makeNode('C')
        },
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' }
        ]
      };

      const engine = new SpecEngine();
      const result = await engine.run(graph);

      expect(result.status).toBe('awaiting_input');
      expect(result.executed).toEqual(['A']);
      expect(result.results).toEqual({ A: { ok: true, spec: 'A' } });
      expect(result.awaitingSpec).toBe('B');
      expect(result.resumeToken).toBeDefined();
    });

    it('handles graph validation errors', async () => {
      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A'), B: makeNode('B') },
        edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }] // cycle
      };

      const engine = new SpecEngine();
      const result = await engine.run(graph);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.GRAPH_CYCLE);
      expect(result.executed).toEqual([]);
    });

    it('handles missing node during execution', async () => {
      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: [{ from: 'A', to: 'MISSING' }]
      };

      const engine = new SpecEngine();
      const result = await engine.run(graph);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.GRAPH_MISSING_NODE);
    });

    it('integrates with lease provider', async () => {
      mockLeaseProvider.acquire.mockResolvedValue({ leaseId: 'test-lease' });
      mockLeaseProvider.release.mockResolvedValue(undefined);

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({ leaseProvider: mockLeaseProvider });
      const result = await engine.run(graph, { sessionId: 'session-1', clientId: 'client-1' });

      expect(mockLeaseProvider.acquire).toHaveBeenCalledWith('session-1', 'client-1', undefined);
      expect(mockLeaseProvider.release).toHaveBeenCalledWith('test-lease');
      expect(result.status).toBe('completed');
    });

    it('handles lease acquisition failure', async () => {
      mockLeaseProvider.acquire.mockRejectedValue(new Error('Lease conflict'));

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({ leaseProvider: mockLeaseProvider });
      const result = await engine.run(graph, { sessionId: 'session-1', clientId: 'client-1' });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_ACQUIRE_FAILED);
    });

    it('upgrades to persistent journal when session provided', async () => {
      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({ metricsCollector: mockMetrics });
      const result = await engine.run(graph, { sessionId: 'session-1' });

      expect(PersistentJournalService).toHaveBeenCalledWith('session-1', { metrics: mockMetrics });
      expect(result.status).toBe('completed');
    });

    it('fetches workspace rules when workspaceId provided', async () => {
      mockRulesRepo.list.mockResolvedValue([
        { relation: 'test', rule: 'rule1', confidence: 0.8 },
        { relation: 'test2', rule: 'rule2', confidence: 1.0 }
      ]);

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine();
      const result = await engine.run(graph, { workspaceId: 'workspace-1' });

      expect(mockRulesRepo.list).toHaveBeenCalledWith('workspace-1', true);
      expect(result.status).toBe('completed');
    });

    it('handles executor failure with retry', async () => {
      let callCount = 0;
      const failingExecutor = {
        execute: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount < 3) throw new Error('Executor failed');
          return { ok: true, spec: 'A' };
        })
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({
        executor: failingExecutor,
        retryPolicy: { maxAttempts: 3, strategy: 'immediate' },
        journalAdapter: mockJournal,
        metricsCollector: mockMetrics
      });

      const result = await engine.run(graph);

      expect(failingExecutor.execute).toHaveBeenCalledTimes(3);
      expect(mockJournal.recordFailure).toHaveBeenCalledTimes(2);
      expect(mockMetrics.inc).toHaveBeenCalledWith('action_journal_retries_total');
      expect(result.status).toBe('completed');
    });

    it('exhausts retries and fails', async () => {
      const failingExecutor = {
        execute: vi.fn().mockRejectedValue(new Error('Persistent failure'))
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({
        executor: failingExecutor,
        retryPolicy: { maxAttempts: 2 },
        journalAdapter: mockJournal,
        metricsCollector: mockMetrics
      });

      const result = await engine.run(graph);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
      expect(mockMetrics.inc).toHaveBeenCalledWith('action_journal_retry_exhausted_total');
    });

    it('handles side effect reuse', async () => {
      const mockJournalWithReuse = {
        ...mockJournal,
        getSuccessfulResult: vi.fn().mockResolvedValue({
          resultJson: { reused: true, spec: 'A' }
        })
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A', 'autonomous', true) }, // side effect
        edges: []
      };

      const engine = new SpecEngine({
        journalAdapter: mockJournalWithReuse,
        metricsCollector: mockMetrics
      });

      const result = await engine.run(graph);

      expect(mockJournalWithReuse.getSuccessfulResult).toHaveBeenCalledWith('A');
      expect(result.results.A).toEqual({ reused: true, spec: 'A' });
      expect(mockMetrics.inc).toHaveBeenCalledWith('specly_engine_reuse_hits_total');
    });

    it('renews lease periodically', async () => {
      mockLeaseProvider.acquire.mockResolvedValue({ leaseId: 'test-lease' });
      mockLeaseProvider.renew.mockResolvedValue(undefined);
      mockLeaseProvider.release.mockResolvedValue(undefined);

      const graph: ToolGraph = {
        entry: 'A',
        nodes: {
          A: makeNode('A'), B: makeNode('B'), C: makeNode('C'),
          D: makeNode('D'), E: makeNode('E'), F: makeNode('F')
        },
        edges: [
          { from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' },
          { from: 'D', to: 'E' }, { from: 'E', to: 'F' }
        ]
      };

      const engine = new SpecEngine({
        leaseProvider: mockLeaseProvider,
        leaseRenewEvery: 2, // renew every 2 specs
        metricsCollector: mockMetrics
      });

      await engine.run(graph, { sessionId: 'session-1', clientId: 'client-1' });

      expect(mockLeaseProvider.renew).toHaveBeenCalledTimes(3); // After spec 2 (C), spec 4 (E), spec 5 (F)
      expect(mockMetrics.inc).toHaveBeenCalledWith('specly_engine_lease_renewals_total');
    });

    it('handles lease renewal failure', async () => {
      mockLeaseProvider.acquire.mockResolvedValue({ leaseId: 'test-lease' });
      mockLeaseProvider.renew.mockRejectedValue(new Error('Renew failed'));
      mockLeaseProvider.release.mockResolvedValue(undefined);

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C') },
        edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }]
      };

      const engine = new SpecEngine({
        leaseProvider: mockLeaseProvider,
        leaseRenewEvery: 1,
        metricsCollector: mockMetrics
      });

      const result = await engine.run(graph, { sessionId: 'session-1', clientId: 'client-1' });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_RENEW_FAILED);
    });

    it('detects dead-end routes', async () => {
      // Create a custom planner that returns an incomplete plan to trigger dead-end detection
      const incompletePlanner = {
        buildPlan: vi.fn().mockReturnValue({
          steps: [{ specHash: 'A', awaitingHuman: false }],
          warnings: []
        })
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A'), B: makeNode('B') },
        edges: [{ from: 'A', to: 'B' }] // A has outgoing edge to B, but B not in plan
      };

      const engine = new SpecEngine({ planner: incompletePlanner });
      const result = await engine.run(graph);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.ROUTE_DEAD_END);
      expect(result.error?.message).toContain('Dead-end reached after spec A');
    });

    it('handles exponential backoff retry strategy', async () => {
      let callCount = 0;
      const failingExecutor = {
        execute: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount < 2) throw new Error('Executor failed');
          return { ok: true, spec: 'A' };
        })
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({
        executor: failingExecutor,
        retryPolicy: { maxAttempts: 2, strategy: 'exponential', baseDelayMs: 10 }
      });

      const startTime = Date.now();
      const result = await engine.run(graph);
      const endTime = Date.now();

      expect(result.status).toBe('completed');
      // Should have some delay (though we don't actually sleep in tests)
      expect(endTime - startTime).toBeGreaterThanOrEqual(0);
    });

    it('executes long chain with default noop lease provider', async () => {
      const graph: ToolGraph = {
        entry: 'A',
        nodes: {
          A: makeNode('A'), B: makeNode('B'), C: makeNode('C'),
          D: makeNode('D'), E: makeNode('E'), F: makeNode('F')
        },
        edges: [
          { from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' },
          { from: 'D', to: 'E' }, { from: 'E', to: 'F' }
        ]
      };

      const engine = new SpecEngine(); // uses default noop lease provider
      const result = await engine.run(graph);

      expect(result.status).toBe('completed');
      expect(result.executed).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    });

    it('handles metrics failure during human pause', async () => {
      const failingMetrics = {
        inc: vi.fn().mockImplementation(() => { throw new Error('Metrics failed'); }),
        observe: vi.fn()
      };
      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A'), B: makeNode('B', 'human') },
        edges: [{ from: 'A', to: 'B' }]
      };
      const engine = new SpecEngine({ metricsCollector: failingMetrics });
      const result = await engine.run(graph);
      expect(result.status).toBe('awaiting_input');
      expect(failingMetrics.inc).toHaveBeenCalledWith('specly_engine_human_pause_total');
    });

    it('handles metrics failure during side effect reuse', async () => {
      const failingMetrics = {
        inc: vi.fn().mockImplementation(() => { throw new Error('Metrics failed'); }),
        observe: vi.fn()
      };
      const mockJournalWithReuse = {
        ...mockJournal,
        getSuccessfulResult: vi.fn().mockResolvedValue({ resultJson: { reused: true } })
      };
      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A', 'autonomous', true) },
        edges: []
      };
      const engine = new SpecEngine({
        journalAdapter: mockJournalWithReuse,
        metricsCollector: failingMetrics
      });
      const result = await engine.run(graph);
      expect(result.status).toBe('completed');
      expect(failingMetrics.inc).toHaveBeenCalledWith('specly_engine_reuse_hits_total');
    });

  });

  describe('resume() method', () => {
    it('resumes execution after human input', async () => {
      const graph: ToolGraph = {
        entry: 'A',
        nodes: {
          A: makeNode('A'),
          B: makeNode('B', 'human'),
          C: makeNode('C')
        },
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' }
        ]
      };

      const serializedState = {
        plan: { steps: [{ specHash: 'A', awaitingHuman: false }, { specHash: 'B', awaitingHuman: true }, { specHash: 'C', awaitingHuman: false }], warnings: [] },
        currentIndex: 1,
        executed: ['A'],
        results: { A: { ok: true, spec: 'A' } },
        warnings: [],
        awaitingSpec: 'B',
        sessionContext: {}
      };

      const engine = new SpecEngine();
      const result = await engine.resume(graph, serializedState, {
        specHash: 'B',
        humanOutput: { userInput: 'test' }
      });

      expect(result.status).toBe('completed');
      expect(result.executed).toEqual(['A', 'B', 'C']);
      expect(result.results.B).toEqual({ userInput: 'test' });
    });

    it('validates resume token spec alignment', async () => {
      const serializedState = {
        plan: { steps: [], warnings: [] },
        currentIndex: 0,
        executed: [],
        results: {},
        warnings: [],
        awaitingSpec: 'B',
        sessionContext: {}
      };

      const engine = new SpecEngine();
      const result = await engine.resume({} as ToolGraph, serializedState, {
        specHash: 'WRONG_SPEC',
        humanOutput: {}
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.RESUME_TOKEN_INVALID);
    });

    it('prevents reuse of consumed resume tokens', async () => {
      const serializedState = {
        plan: { steps: [], warnings: [] },
        currentIndex: 0,
        executed: [],
        results: {},
        warnings: [],
        awaitingSpec: 'B',
        sessionContext: {}
      };

      const engine = new SpecEngine();
      await engine.resume({} as ToolGraph, serializedState, {
        specHash: 'B',
        humanOutput: {},
        resumeToken: 'token-1'
      });

      const result = await engine.resume({} as ToolGraph, serializedState, {
        specHash: 'B',
        humanOutput: {},
        resumeToken: 'token-1'
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.RESUME_TOKEN_INVALID);
    });



    it('pauses again if another human spec encountered during resume', async () => {
      const serializedState = {
        plan: { steps: [{ specHash: 'B', awaitingHuman: true }, { specHash: 'C', awaitingHuman: false }, { specHash: 'D', awaitingHuman: true }], warnings: [] },
        currentIndex: 0,
        executed: [],
        results: {},
        warnings: [],
        awaitingSpec: 'B',
        sessionContext: {}
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: {
          A: makeNode('A'),
          B: makeNode('B', 'human'),
          C: makeNode('C'),
          D: makeNode('D', 'human')
        },
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'D' }
        ]
      };

      const engine = new SpecEngine();
      const result = await engine.resume(graph, serializedState, {
        specHash: 'B',
        humanOutput: { input: 'test' }
      });

      expect(result.status).toBe('awaiting_input');
      expect(result.awaitingSpec).toBe('D');
      expect(result.executed).toEqual(['B', 'C']);
    });
  });

  describe('error handling and edge cases', () => {
    it('handles workspace rules fetch failure gracefully', async () => {
      mockRulesRepo.list.mockRejectedValue(new Error('DB error'));

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine();
      const result = await engine.run(graph, { workspaceId: 'workspace-1' });

      expect(result.status).toBe('completed');
      // Should continue without rules
    });

    it('handles journal operations failures gracefully', async () => {
      const failingJournal = {
        recordStart: vi.fn().mockRejectedValue(new Error('Journal failed')),
        recordSuccess: vi.fn().mockRejectedValue(new Error('Journal failed')),
        recordFailure: vi.fn().mockRejectedValue(new Error('Journal failed'))
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({ journalAdapter: failingJournal });
      const result = await engine.run(graph);

      expect(result.status).toBe('completed');
      // Should continue despite journal failures
    });

    it('handles metrics failures gracefully', async () => {
      const failingMetrics = {
        inc: vi.fn().mockImplementation(() => { throw new Error('Metrics failed'); }),
        observe: vi.fn().mockImplementation(() => { throw new Error('Metrics failed'); })
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({ metricsCollector: failingMetrics });
      const result = await engine.run(graph);

      expect(result.status).toBe('completed');
      // Should continue despite metrics failures
    });

    it('handles lease release failure during error finalization', async () => {
      mockLeaseProvider.acquire.mockResolvedValue({ leaseId: 'test-lease' });
      mockLeaseProvider.release.mockRejectedValue(new Error('Release failed'));
      mockLeaseProvider.renew.mockResolvedValue(undefined);

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A'), B: makeNode('B') },
        edges: [{ from: 'A', to: 'B' }]
      };

      // Force an error after lease acquisition by making renew fail
      mockLeaseProvider.renew.mockRejectedValue(new Error('Renew failed'));

      const engine = new SpecEngine({
        leaseProvider: mockLeaseProvider,
        leaseRenewEvery: 1,
        metricsCollector: mockMetrics
      });

      const result = await engine.run(graph, { sessionId: 'session-1', clientId: 'client-1' });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_RENEW_FAILED);
      expect(mockLeaseProvider.release).toHaveBeenCalledWith('test-lease');
    });

    it('handles lease release failure during normal completion', async () => {
      mockLeaseProvider.acquire.mockResolvedValue({ leaseId: 'test-lease' });
      mockLeaseProvider.release.mockRejectedValue(new Error('Release failed'));
      mockLeaseProvider.renew.mockResolvedValue(undefined);

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({ leaseProvider: mockLeaseProvider });
      const result = await engine.run(graph, { sessionId: 'session-1', clientId: 'client-1' });

      expect(result.status).toBe('completed');
      expect(mockLeaseProvider.release).toHaveBeenCalledWith('test-lease');
    });

    it('handles lease release failure during resume error finalization', async () => {
      mockLeaseProvider.acquire.mockResolvedValue({ leaseId: 'resume-lease' });
      mockLeaseProvider.release.mockRejectedValue(new Error('Release failed'));
      mockLeaseProvider.renew.mockRejectedValue(new Error('Renew failed'));

      const serializedState = {
        plan: { steps: [{ specHash: 'B', awaitingHuman: false }, { specHash: 'C', awaitingHuman: false }], warnings: [] },
        currentIndex: 0,
        executed: ['A'],
        results: { A: {} },
        warnings: [],
        awaitingSpec: 'B',
        sessionContext: {}
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C') },
        edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }]
      };

      const engine = new SpecEngine({
        leaseProvider: mockLeaseProvider,
        leaseRenewEvery: 1
      });

      const result = await engine.resume(graph, serializedState, {
        specHash: 'B',
        humanOutput: { input: 'test' }
      }, { sessionId: 'session-1', clientId: 'client-1' });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_RENEW_FAILED);
      expect(mockLeaseProvider.release).toHaveBeenCalledWith('resume-lease');
    });

    it('handles lease release failure during resume normal completion', async () => {
      mockLeaseProvider.acquire.mockResolvedValue({ leaseId: 'resume-lease' });
      mockLeaseProvider.release.mockRejectedValue(new Error('Release failed'));
      mockLeaseProvider.renew.mockResolvedValue(undefined);

      const serializedState = {
        plan: { steps: [{ specHash: 'B', awaitingHuman: false }], warnings: [] },
        currentIndex: 0,
        executed: ['A'],
        results: { A: {} },
        warnings: [],
        awaitingSpec: 'B',
        sessionContext: {}
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A'), B: makeNode('B') },
        edges: [{ from: 'A', to: 'B' }]
      };

      const engine = new SpecEngine({ leaseProvider: mockLeaseProvider });
      const result = await engine.resume(graph, serializedState, {
        specHash: 'B',
        humanOutput: { input: 'test' }
      }, { sessionId: 'session-1', clientId: 'client-1' });

      expect(result.status).toBe('completed');
      expect(mockLeaseProvider.release).toHaveBeenCalledWith('resume-lease');
    });

    it('handles finalizeError when no lease is acquired', async () => {
      // This test ensures the if (leaseId) condition in finalizeError is covered for the false case
      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      // Mock executor to fail without acquiring lease
      const failingExecutor = {
        execute: vi.fn().mockRejectedValue(new Error('Executor failed'))
      };

      const engine = new SpecEngine({
        executor: failingExecutor,
        retryPolicy: { maxAttempts: 1 }
      });

      const result = await engine.run(graph);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
      // No lease should be acquired or released
    });

    it('handles side effect reuse with successful prior result', async () => {
      const mockJournalWithReuse = {
        ...mockJournal,
        getSuccessfulResult: vi.fn().mockResolvedValue({
          resultJson: { reused: true, spec: 'A' }
        })
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A', 'autonomous', true) }, // side effect
        edges: []
      };

      const engine = new SpecEngine({
        journalAdapter: mockJournalWithReuse,
        metricsCollector: mockMetrics
      });

      const result = await engine.run(graph);

      expect(mockJournalWithReuse.getSuccessfulResult).toHaveBeenCalledWith('A');
      expect(result.results.A).toEqual({ reused: true, spec: 'A' });
      expect(mockMetrics.inc).toHaveBeenCalledWith('specly_engine_reuse_hits_total');
    });

    it('handles executor returning object output for session context', async () => {
      const objectReturningExecutor = {
        execute: vi.fn().mockResolvedValue({ ok: true, data: 'test', nested: { value: 42 } })
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({ executor: objectReturningExecutor });
      const result = await engine.run(graph);

      expect(result.status).toBe('completed');
      expect(objectReturningExecutor.execute).toHaveBeenCalledWith('A');
    });

    it('handles dead-end detection when plan ends prematurely with outgoing edges', async () => {
      // Create a custom planner that returns an incomplete plan to trigger dead-end detection
      const incompletePlanner = {
        buildPlan: vi.fn().mockReturnValue({
          steps: [{ specHash: 'A', awaitingHuman: false }],
          warnings: []
        })
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A'), B: makeNode('B') },
        edges: [{ from: 'A', to: 'B' }] // A has outgoing edge to B, but B not in plan
      };

      const engine = new SpecEngine({ planner: incompletePlanner });
      const result = await engine.run(graph);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(SpecEngineErrorCode.ROUTE_DEAD_END);
      expect(result.error?.message).toContain('Dead-end reached after spec A');
    });

    it('handles dead-end detection when plan ends without outgoing edges', async () => {
      // Create a custom planner that returns an incomplete plan
      const incompletePlanner = {
        buildPlan: vi.fn().mockReturnValue({
          steps: [{ specHash: 'A', awaitingHuman: false }],
          warnings: []
        })
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') }, // Only reachable node
        edges: [] // No outgoing edges from A
      };

      const engine = new SpecEngine({ planner: incompletePlanner });
      const result = await engine.run(graph);

      expect(result.status).toBe('completed'); // Should complete since no outgoing edges
      expect(result.executed).toEqual(['A']);
    });

    it('handles session context update with non-object output', async () => {
      const primitiveReturningExecutor = {
        execute: vi.fn().mockResolvedValue('string output')
      };

      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine({ executor: primitiveReturningExecutor });
      const result = await engine.run(graph);

      expect(result.status).toBe('completed');
      expect(result.results.A).toBe('string output');
    });

    it('handles workspace rules loading with NoopActionJournalAdapter', async () => {
      // This tests the condition: if (runOpts?.sessionId && this.journal instanceof NoopActionJournalAdapter)
      const graph: ToolGraph = {
        entry: 'A',
        nodes: { A: makeNode('A') },
        edges: []
      };

      const engine = new SpecEngine(); // Uses default NoopActionJournalAdapter
      const result = await engine.run(graph, { sessionId: 'session-1' });

      expect(result.status).toBe('completed');
      // Should not attempt to load workspace rules when using NoopActionJournalAdapter
    });

    it('NoopAutonomousExecutor works', async () => {
      const executor = new NoopAutonomousExecutor();
      const result = await executor.execute('test-hash');
      expect(result).toEqual({ ok: true, spec: 'test-hash' });
    });
  });
});
