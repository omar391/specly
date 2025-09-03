/**
 * SpecEngine (SP-005 Skeleton)
 * Provides planning/execution abstractions over tool version spec graphs.
 * Initial scope: deterministic plan derivation only (no side effects or journal integration yet).
 */

import { validateToolGraph, GraphValidationError } from '../utils/graph-validate.js';
import { PersistentJournalService } from './persistent-journal-service.js';

export interface SpecNode {
  hash: string;
  intent: 'human' | 'autonomous';
  sideEffect: boolean;
}

export interface ToolGraphEdge { from: string; to: string; priority?: number }

export interface ToolGraph {
  entry: string;
  nodes: Record<string, SpecNode>; // specHash -> node metadata
  edges: ToolGraphEdge[]; // directional edges
}

export interface ExecutionStep { specHash: string; awaitingHuman: boolean }

export interface ExecutionPlan { steps: ExecutionStep[]; warnings: string[] }

export interface ExecutionPlanner {
  buildPlan(graph: ToolGraph): ExecutionPlan;
}

// Execution result statuses for early skeleton
export type ExecutionStatus = 'completed' | 'awaiting_input' | 'error';

// Phase 1: Introduce per-spec execution record & aggregate state
export interface SpecExecutionRecord {
  specHash: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  startedAt?: number;
  endedAt?: number;
  resultCode?: string; // future: success / derived code
  output?: unknown; // executor output snapshot
  errorMessage?: string;
}

export interface ExecutionState {
  plan: ExecutionPlan;
  currentIndex: number; // index within plan.steps that is next to process
  records: Record<string, SpecExecutionRecord>;
  sessionContext: Record<string, unknown>; // merged outputs (last write wins)
  failed?: boolean;
  failureMessage?: string;
}

export interface ExecutionContext {
  // Placeholder for accumulated results (future: map specHash -> output)
  results: Record<string, unknown>;
  // Ordered executed spec hashes
  executed: string[];
  // If awaiting human input, the spec hash causing pause
  awaitingSpec?: string;
  // Warnings surfaced during planning/validation
  warnings: string[];
  status: ExecutionStatus;
  error?: { message: string };
    // Phase 3 additions
    resumeToken?: string; // opaque token representing paused state version
    errorCode?: SpecEngineErrorCode; // Phase 4
}

// Phase 4: Error taxonomy
// SpecEngineErrorCode: normalized, program-consumable error surface.
// Structural (pre-execution) vs Runtime (during execution) delineation helps callers decide retry / remediation strategies.
// Structural: PLAN_CYCLE, MISSING_NODE. Runtime: EXECUTION_FAILURE, LEASE_ACQUIRE, LEASE_RENEW, DEAD_END, STALE_RESUME.
export enum SpecEngineErrorCode {
    GRAPH_CYCLE = 'GRAPH_CYCLE',
    GRAPH_MISSING_NODE = 'GRAPH_MISSING_NODE',
    EXECUTOR_FAILED = 'EXECUTOR_FAILED',
    LEASE_ACQUIRE_FAILED = 'LEASE_ACQUIRE_FAILED',
    LEASE_RENEW_FAILED = 'LEASE_RENEW_FAILED',
    ROUTE_DEAD_END = 'ROUTE_DEAD_END',
    RESUME_TOKEN_INVALID = 'RESUME_TOKEN_INVALID'
}

export interface SpecExecutor {
  execute(specHash: string): Promise<unknown>; // future: accept input context, return output
}

/**
 * Minimal in-memory executor stub.
 * For autonomous specs returns a trivial success payload; human specs never executed here.
 */
export class NoopAutonomousExecutor implements SpecExecutor {
  async execute(specHash: string): Promise<unknown> {
    return { ok: true, spec: specHash };
  }
}

export interface SpecEngineOptions {
  planner?: ExecutionPlanner;
  executor?: SpecExecutor; // handles autonomous specs
  // future: hooks for session lease, journal, rule injection, metrics
    leaseProvider?: ClientStateLeaseProvider;
  leaseRenewEvery?: number; // specs per renewal (default 5)
  journalAdapter?: ActionJournalAdapter; // Phase 5 journal seam
  metricsCollector?: MetricsCollector; // Phase 6 metrics seam
  retryPolicy?: RetryPolicy; // Phase 7 retry seam
}

// Phase 7: Basic retry policy definition
export interface RetryPolicy {
  maxAttempts: number; // total attempts including first (>=1)
  strategy?: 'immediate' | 'exponential';
  baseDelayMs?: number; // logical delay value (not actually sleeping in engine yet)
}

// Phase 2: Lease provider interface (simple)
export interface ClientStateLeaseProvider {
  acquire(sessionId: string, clientId: string, force?: boolean): Promise<{ leaseId: string }>; // throws on conflict
  renew(leaseId: string): Promise<void>;
  release(leaseId: string): Promise<void>;
}

class NoopClientStateLeaseProvider implements ClientStateLeaseProvider {
  async acquire(_sessionId: string, _clientId: string, _force?: boolean) { return { leaseId: 'noop' }; }
  async renew(_leaseId: string) { /* noop */ }
  async release(_leaseId: string) { /* noop */ }
}

// Phase 5: Action journal seam (skeleton – no reuse logic yet)
export type JournalEventStatus = 'started' | 'succeeded' | 'failed';

export interface ActionJournalAdapter {
  recordStart(specHash: string, attempt: number): Promise<void> | void;
  recordSuccess(specHash: string, attempt: number, output: unknown): Promise<void> | void;
  recordFailure(specHash: string, attempt: number, error: { message: string }): Promise<void> | void;
}

class NoopActionJournalAdapter implements ActionJournalAdapter {
  recordStart(_specHash: string, _attempt: number) { /* noop */ }
  recordSuccess(_specHash: string, _attempt: number, _output: unknown) { /* noop */ }
  recordFailure(_specHash: string, _attempt: number, _error: { message: string }) { /* noop */ }
}

// Phase 6: Metrics seam (simple counter/histogram interface)
export interface MetricsCollector {
  inc(counter: string, labels?: Record<string,string>): void;
  observe(histogram: string, value: number, labels?: Record<string,string>): void;
}

class NoopMetricsCollector implements MetricsCollector {
  inc(_counter: string, _labels?: Record<string,string>) { /* noop */ }
  observe(_hist: string, _value: number, _labels?: Record<string,string>) { /* noop */ }
}

/**
 * SpecEngine:
 * - Builds plan (assumes pre-validation via SP-018)
 * - Executes autonomous specs sequentially until a human spec is encountered or plan exhausted
 * - Returns execution context with executed list & pause point
 * - Does NOT persist anything yet (session/journal integration deferred)
 */
export class SpecEngine {
  private planner: ExecutionPlanner;
  private executor: SpecExecutor;
    private leaseProvider: ClientStateLeaseProvider;
  private leaseRenewEvery: number;
  private journal: ActionJournalAdapter;
  private metrics: MetricsCollector;
  private retry: RetryPolicy;

  constructor(opts: SpecEngineOptions = {}) {
    this.planner = opts.planner ?? new BasicExecutionPlanner();
    this.executor = opts.executor ?? new NoopAutonomousExecutor();
      this.leaseProvider = opts.leaseProvider ?? new NoopClientStateLeaseProvider();
    this.leaseRenewEvery = opts.leaseRenewEvery ?? 5;
    this.journal = opts.journalAdapter ?? new NoopActionJournalAdapter();
    this.metrics = opts.metricsCollector ?? new NoopMetricsCollector();
    this.retry = opts.retryPolicy ?? { maxAttempts: 1, strategy: 'immediate' };
  }
  // (import relocated to top)

  async run(graph: ToolGraph, runOpts?: { sessionId?: string; clientId?: string; force?: boolean }): Promise<ExecutionContext> {
    try {
        // Structural validation (SP-018) to catch missing nodes / cycles before planning
        try {
            validateToolGraph({
                ordered_specs: Object.keys(graph.nodes),
                entry_spec: graph.entry,
                edges: graph.edges.map(e => ({ from: e.from, to: e.to, condition_type: 'always', priority: e.priority }))
            });
        } catch (vErr: any) {
            if (vErr instanceof GraphValidationError) {
                let code: SpecEngineErrorCode | undefined;
        if (vErr.code === 'ERR_UNDECLARED_SPEC') code = SpecEngineErrorCode.GRAPH_MISSING_NODE;
        if (vErr.code === 'ERR_CYCLE' || vErr.code === 'ERR_SELF_LOOP') code = SpecEngineErrorCode.GRAPH_CYCLE;
                return { status: 'error', executed: [], results: {}, warnings: [], error: { message: vErr.message }, errorCode: code };
            }
            throw vErr;
        }

      const plan = this.planner.buildPlan(graph);
      // If caller provided sessionId and journal is noop, upgrade to persistent journal
      if (runOpts?.sessionId && this.journal instanceof NoopActionJournalAdapter) {
        this.journal = new PersistentJournalService(runOpts.sessionId);
      }
      const state: ExecutionState = {
        plan,
        currentIndex: 0,
        records: {},
        sessionContext: {}
      };

      const executed: string[] = [];
      const results: Record<string, unknown> = {};
      let leaseId: string | undefined;
      let specsSinceRenew = 0;

        const finalizeError = (message: string, code?: SpecEngineErrorCode): ExecutionContext => {
        state.failed = true;
        state.failureMessage = message;
        // Best effort release
        if (leaseId) {
          void this.leaseProvider.release(leaseId).catch(() => {/* ignore */});
        }
        return {
          status: 'error',
          executed,
          results,
          warnings: plan.warnings,
            error: { message },
            errorCode: code
        };
      };

      // Lease acquisition if session context provided
      if (runOpts?.sessionId && runOpts?.clientId) {
        try {
          const lease = await this.leaseProvider.acquire(runOpts.sessionId, runOpts.clientId, runOpts.force);
          leaseId = lease.leaseId;
        } catch (e: any) {
            return finalizeError(`Lease acquisition failed: ${e?.message || 'unknown'}`, SpecEngineErrorCode.LEASE_ACQUIRE_FAILED);
        }
      }

      while (state.currentIndex < plan.steps.length) {
        const step = plan.steps[state.currentIndex];
        const node = graph.nodes[step.specHash];
        if (!node) {
            return finalizeError(`Missing node during execution: ${step.specHash}`, SpecEngineErrorCode.GRAPH_MISSING_NODE);
        }

        // Prepare record if not existing
        if (!state.records[step.specHash]) {
          state.records[step.specHash] = {
            specHash: step.specHash,
            status: 'pending',
            attempts: 0
          };
        }
        const rec = state.records[step.specHash];

        if (node.intent === 'human') {
            try { this.metrics.inc('specly_engine_human_pause_total'); } catch { /* swallow */ }
            const resumeToken = this.buildResumeToken(state, step.specHash);
          return {
            status: 'awaiting_input',
            executed,
            results,
            warnings: plan.warnings,
              awaitingSpec: step.specHash,
              resumeToken
          };
        }

        // Autonomous execution with retry loop
        rec.status = 'running';
        rec.startedAt = rec.startedAt ?? Date.now();

        // Side-effect reuse (pre-attempt)
        if (node.sideEffect && this.journal && typeof (this.journal as any).getSuccessfulResult === 'function') {
          try {
            const prior = await (this.journal as any).getSuccessfulResult(step.specHash);
            if (prior && prior.resultJson) {
              rec.status = 'completed';
              rec.endedAt = Date.now();
              rec.output = prior.resultJson;
              results[step.specHash] = prior.resultJson;
              executed.push(step.specHash);
              try { this.metrics.inc('specly_engine_reuse_hits_total'); } catch { /* swallow */ }
              state.currentIndex++;
              continue;
            }
          } catch { /* swallow */ }
        }

        const maxAttempts = Math.max(1, this.retry.maxAttempts || 1);
        let attempt = 0;
        let lastErr: any;
        while (attempt < maxAttempts) {
          attempt++;
          rec.attempts = attempt; // reflect current attempt
          try { this.metrics.inc('specly_engine_specs_started_total'); } catch { /* swallow */ }
          // Journal start per attempt
          if (this.journal instanceof PersistentJournalService) {
            await this.journal.recordStart(step.specHash, attempt);
          } else { try { await this.journal.recordStart(step.specHash, attempt); } catch { /* swallow */ } }
          try {
            const output = await this.executor.execute(step.specHash);
            rec.status = 'completed';
            rec.endedAt = Date.now();
            rec.output = output;
              if (this.journal instanceof PersistentJournalService) {
                await this.journal.recordSuccess(step.specHash, attempt, output);
              } else { try { await this.journal.recordSuccess(step.specHash, attempt, output); } catch { /* swallow */ } }
              try { this.metrics.inc('specly_engine_specs_completed_total'); } catch { /* swallow */ }
              results[step.specHash] = output;
              executed.push(step.specHash);
              if (output && typeof output === 'object') Object.assign(state.sessionContext, output as Record<string, unknown>);
              if (leaseId) {
                specsSinceRenew++;
                if (specsSinceRenew >= this.leaseRenewEvery) {
                try { await this.leaseProvider.renew(leaseId); try { this.metrics.inc('specly_engine_lease_renewals_total'); } catch { /* swallow */ } } catch (e: any) { return finalizeError(`Lease renewal failed: ${e?.message || 'unknown'}`, SpecEngineErrorCode.LEASE_RENEW_FAILED); }
                  specsSinceRenew = 0;
                }
              }
              break; // success, exit retry loop
            } catch (err: any) {
              lastErr = err;
              // Record failure for this attempt
              if (this.journal instanceof PersistentJournalService) {
                await this.journal.recordFailure(step.specHash, attempt, { message: err?.message || 'Autonomous executor error' });
              } else { try { await this.journal.recordFailure(step.specHash, attempt, { message: err?.message || 'Autonomous executor error' }); } catch { /* swallow */ } }
              if (attempt < maxAttempts) {
                try { this.metrics.inc('action_journal_retries_total'); } catch { /* swallow */ }
                // Logical backoff computation (no actual sleep to keep engine sync for tests)
                if (this.retry.strategy === 'exponential') {
                  const delay = (this.retry.baseDelayMs ?? 50) * Math.pow(2, attempt - 1);
                  // Potential future: await wait(delay)
                  void delay; // suppress unused lint
                }
                continue; // attempt another retry
              } else {
              // Exhausted attempts
                rec.status = 'failed';
                rec.endedAt = Date.now();
                rec.errorMessage = err?.message || 'Autonomous executor error';
              try { this.metrics.inc('specly_engine_specs_failed_total'); } catch { /* swallow */ }
              try { this.metrics.inc('action_journal_retry_exhausted_total'); } catch { /* swallow */ }
              return finalizeError(`Execution failed at spec ${step.specHash}: ${rec.errorMessage}`, SpecEngineErrorCode.EXECUTOR_FAILED);
            }
          }
        }
        if (rec.status !== 'completed') {
          // Defensive: should have returned on failure or broken on success
          rec.status = 'failed';
          rec.endedAt = Date.now();
          rec.errorMessage = lastErr?.message || 'Autonomous executor error';
          try { this.metrics.inc('specly_engine_specs_failed_total'); } catch { /* swallow */ }
          return finalizeError(`Execution failed at spec ${step.specHash}: ${rec.errorMessage}`, SpecEngineErrorCode.EXECUTOR_FAILED);
        }

        state.currentIndex++;

          // Dead-end detection: if next step does not exist in plan AND we still have unvisited reachable nodes (branching incomplete), treat as dead-end failure
          if (state.currentIndex >= plan.steps.length) {
              // Build quick adjacency to see if current node had outgoing edges in original graph; if so and plan ended prematurely -> no_transition
              const hasOutgoing = graph.edges.some(e => e.from === step.specHash);
              if (hasOutgoing) {
                  return finalizeError(`Dead-end reached after spec ${step.specHash}: no valid transition`, SpecEngineErrorCode.ROUTE_DEAD_END);
              }
          }
      }

      // Release lease on normal completion
      if (leaseId) {
        void this.leaseProvider.release(leaseId).catch(() => {/* ignore */});
      }
      return { status: 'completed', executed, results, warnings: plan.warnings };
  } catch (e: any) {
    const msg = e?.message || 'Unknown error';
    let code: SpecEngineErrorCode | undefined;
    if (/Cycle detected/.test(msg)) code = SpecEngineErrorCode.GRAPH_CYCLE;
    if (/Missing node during execution/.test(msg)) code = SpecEngineErrorCode.GRAPH_MISSING_NODE;
    return { status: 'error', executed: [], results: {}, warnings: [], error: { message: msg }, errorCode: code };
    }
  }

    /** Phase 3: resume execution after a human spec output is provided. */
    async resume(graph: ToolGraph, serializedState: SerializedPausedState, input: { specHash: string; humanOutput: unknown }, runOpts?: { sessionId?: string; clientId?: string; force?: boolean }): Promise<ExecutionContext> {
        // Basic validation of token/spec alignment
        if (serializedState.awaitingSpec !== input.specHash) {
            return { status: 'error', executed: serializedState.executed, results: serializedState.results, warnings: serializedState.warnings, error: { message: 'Stale or mismatched resume token' }, errorCode: SpecEngineErrorCode.RESUME_TOKEN_INVALID };
        }
        // Reconstruct minimal state (for now we just continue from next index)
        const nextIndex = serializedState.currentIndex; // currentIndex points to human spec position
        // Inject human output context
        if (input.humanOutput && typeof input.humanOutput === 'object') {
            Object.assign(serializedState.sessionContext, input.humanOutput as Record<string, unknown>);
        }
        // Mark human spec as completed in results for continuity
        serializedState.results[input.specHash] = input.humanOutput;
        serializedState.executed.push(input.specHash);
  // Journal success for human spec (treated as provided externally)
      if (this.journal instanceof PersistentJournalService) {
        await this.journal.recordSuccess(input.specHash, 1, input.humanOutput);
      } else { try { await this.journal.recordSuccess(input.specHash, 1, input.humanOutput); } catch { /* swallow */ } }
  try { this.metrics.inc('specly_engine_resume_total'); } catch { /* swallow */ }

        // Build a partial plan (reuse previous plan steps)
        const remainingSteps = serializedState.plan.steps.slice(nextIndex + 1);
        const plan: ExecutionPlan = { steps: remainingSteps, warnings: serializedState.warnings };

        // Execute remaining autonomous specs using normal loop logic by constructing a temp graph plan.
        // Simplify: create a mini engine iteration (duplicating small portion to avoid deep refactor now).
        const executed: string[] = [...serializedState.executed];
        const results: Record<string, unknown> = { ...serializedState.results };

        let leaseId: string | undefined;
        let specsSinceRenew = 0;
        const finalizeError = (message: string, code?: SpecEngineErrorCode): ExecutionContext => {
            if (leaseId) void this.leaseProvider.release(leaseId).catch(() => { });
            return { status: 'error', executed, results, warnings: plan.warnings, error: { message }, errorCode: code };
        };

        if (runOpts?.sessionId && runOpts?.clientId) {
            try { const lease = await this.leaseProvider.acquire(runOpts.sessionId, runOpts.clientId, runOpts.force); leaseId = lease.leaseId; } catch (e: any) { return finalizeError(`Lease acquisition failed: ${e?.message || 'unknown'}`, SpecEngineErrorCode.LEASE_ACQUIRE_FAILED); }
        }

    for (const step of remainingSteps) {
            const node = graph.nodes[step.specHash];
            if (!node) return finalizeError(`Missing node during execution: ${step.specHash}`, SpecEngineErrorCode.GRAPH_MISSING_NODE);
            if (node.intent === 'human') {
                const resumeToken = this.buildResumeToken({ ...serializedState, currentIndex: nextIndex + executed.length }, step.specHash);
                if (leaseId) void this.leaseProvider.release(leaseId).catch(() => { });
                return { status: 'awaiting_input', executed, results, warnings: plan.warnings, awaitingSpec: step.specHash, resumeToken };
            }
            try {
              if (this.journal instanceof PersistentJournalService) {
                await this.journal.recordStart(step.specHash, 1);
              } else { try { await this.journal.recordStart(step.specHash, 1); } catch { /* swallow */ } }
        try { this.metrics.inc('specly_engine_specs_started_total'); } catch { /* swallow */ }
                const output = await this.executor.execute(step.specHash);
                results[step.specHash] = output;
                executed.push(step.specHash);
              if (this.journal instanceof PersistentJournalService) {
                await this.journal.recordSuccess(step.specHash, 1, output);
              } else { try { await this.journal.recordSuccess(step.specHash, 1, output); } catch { /* swallow */ } }
        try { this.metrics.inc('specly_engine_specs_completed_total'); } catch { /* swallow */ }
                if (output && typeof output === 'object') Object.assign(serializedState.sessionContext, output as Record<string, unknown>);
                if (leaseId) {
                    specsSinceRenew++;
                    if (specsSinceRenew >= (this.leaseRenewEvery)) {
            try { await this.leaseProvider.renew(leaseId); try { this.metrics.inc('specly_engine_lease_renewals_total'); } catch { /* swallow */ } } catch (e: any) { return finalizeError(`Lease renewal failed: ${e?.message || 'unknown'}`, SpecEngineErrorCode.LEASE_RENEW_FAILED); }
                        specsSinceRenew = 0;
                    }
                }
            } catch (err: any) {
        try { this.metrics.inc('specly_engine_specs_failed_total'); } catch { /* swallow */ }
              if (this.journal instanceof PersistentJournalService) {
                await this.journal.recordFailure(step.specHash, 1, { message: err?.message || 'Autonomous executor error' });
              } else { try { await this.journal.recordFailure(step.specHash, 1, { message: err?.message || 'Autonomous executor error' }); } catch { /* swallow */ } }
                return finalizeError(`Execution failed at spec ${step.specHash}: ${err?.message || 'Autonomous executor error'}`, SpecEngineErrorCode.EXECUTOR_FAILED);
            }
        }
        if (leaseId) void this.leaseProvider.release(leaseId).catch(() => { });
        return { status: 'completed', executed, results, warnings: plan.warnings };
    }

    private buildResumeToken(state: { currentIndex: number }, awaitingSpec: string): string {
        return `${awaitingSpec}:${state.currentIndex}:${Date.now()}`;
    }
}

// Serialized form of a paused state (minimal for Phase 3 tests)
export interface SerializedPausedState {
    plan: ExecutionPlan;
    currentIndex: number;
    executed: string[];
    results: Record<string, unknown>;
    warnings: string[];
    awaitingSpec: string;
    sessionContext: Record<string, unknown>;
}

/**
 * BasicExecutionPlanner
 * - Validates single entry presence
 * - Detects cycles (DFS)
 * - Performs topological ordering (Kahn) with stable deterministic ordering
 * - Sorts available nodes by (priority desc, specHash asc)
 * - Flags unreachable nodes as warnings (not fatal initial scope)
 */
export class BasicExecutionPlanner implements ExecutionPlanner {
  buildPlan(graph: ToolGraph): ExecutionPlan {
    const warnings: string[] = [];
    if (!graph.nodes[graph.entry]) {
      throw new Error(`Entry spec hash not found in nodes: ${graph.entry}`);
    }

    // Build adjacency & in-degree
    const inDegree: Record<string, number> = {};
    const adjacency: Record<string, { to: string; priority: number }[]> = {};
    for (const hash of Object.keys(graph.nodes)) {
      inDegree[hash] = 0;
      adjacency[hash] = [];
    }

    for (const e of graph.edges) {
      if (!graph.nodes[e.from] || !graph.nodes[e.to]) {
        warnings.push(`Edge references missing node: ${e.from} -> ${e.to}`);
        continue;
      }
      adjacency[e.from].push({ to: e.to, priority: e.priority ?? 100 });
      inDegree[e.to]++;
    }

      // Cycle detection (Kahn variant): if topological pass visits fewer reachable nodes than reachable set, cycle exists.
      const reachable = new Set<string>();
      const qReach = [graph.entry];
      while (qReach.length) {
          const n = qReach.shift()!;
          if (reachable.has(n)) continue;
          reachable.add(n);
          for (const e of adjacency[n]) qReach.push(e.to);
      }
      // Copy inDegree for simulation
      const inDegCopy: Record<string, number> = { ...inDegree };
      const readyCycle: string[] = [];
      for (const h of reachable) if (inDegCopy[h] === 0) readyCycle.push(h);
      let visitedCount = 0;
      while (readyCycle.length) {
          // deterministic pop
          readyCycle.sort();
          const cur = readyCycle.shift()!;
          visitedCount++;
          for (const e of adjacency[cur]) {
              inDegCopy[e.to]--; if (inDegCopy[e.to] === 0 && reachable.has(e.to)) readyCycle.push(e.to);
          }
      }
      if (visitedCount < reachable.size) {
          throw new Error('Cycle detected in tool graph');
    }

    // Kahn topological with priority ordering among ready nodes
    const ready: string[] = [];
    for (const h of Object.keys(graph.nodes)) {
      if (inDegree[h] === 0) ready.push(h);
    }

    const steps: ExecutionStep[] = [];
    const visited = new Set<string>();

    const pushOrdered = () => {
      // Only schedule nodes reachable from entry (optional gating)
      ready.sort((a, b) => {
        if (a === b) return 0;
        // Determine priorities: take max priority of outgoing edges? Simpler: use average or base 100.
        // For initial pass we derive a pseudo-priority: highest incoming edge priority (need to compute)
        const prioA = incomingMaxPriority(a, graph.edges) ?? 100;
        const prioB = incomingMaxPriority(b, graph.edges) ?? 100;
        if (prioA !== prioB) return prioB - prioA; // desc
        return a.localeCompare(b); // tie breaker stable
      });
    };

      // reachable already computed above

    pushOrdered();
    while (ready.length) {
      const current = ready.shift()!;
      if (!reachable.has(current)) {
        // skip unreachable nodes until after plan generation
        continue;
      }
      if (visited.has(current)) continue;
      visited.add(current);
      const nodeMeta = graph.nodes[current];
      steps.push({ specHash: current, awaitingHuman: nodeMeta.intent === 'human' });
      for (const edge of adjacency[current]) {
        inDegree[edge.to]--;
        if (inDegree[edge.to] === 0) {
          ready.push(edge.to);
        }
      }
      pushOrdered();
    }

    // Warn about unreachable nodes
    for (const h of Object.keys(graph.nodes)) {
      if (!reachable.has(h)) warnings.push(`Unreachable spec node: ${h}`);
    }

    return { steps, warnings };
  }
}

function incomingMaxPriority(node: string, edges: ToolGraphEdge[]): number | null {
  let max: number | null = null;
  for (const e of edges) {
    if (e.to === node) {
      const p = e.priority ?? 100;
      if (max === null || p > max) max = p;
    }
  }
  return max;
}
