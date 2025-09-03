/**
 * SpecEngine (SP-005 Skeleton)
 * Provides planning/execution abstractions over tool version spec graphs.
 * Initial scope: deterministic plan derivation only (no side effects or journal integration yet).
 */

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

  constructor(opts: SpecEngineOptions = {}) {
    this.planner = opts.planner ?? new BasicExecutionPlanner();
    this.executor = opts.executor ?? new NoopAutonomousExecutor();
      this.leaseProvider = opts.leaseProvider ?? new NoopClientStateLeaseProvider();
    this.leaseRenewEvery = opts.leaseRenewEvery ?? 5;
  }

  async run(graph: ToolGraph, runOpts?: { sessionId?: string; clientId?: string; force?: boolean }): Promise<ExecutionContext> {
    try {
      const plan = this.planner.buildPlan(graph);
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

      const finalizeError = (message: string): ExecutionContext => {
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
          error: { message }
        };
      };

      // Lease acquisition if session context provided
      if (runOpts?.sessionId && runOpts?.clientId) {
        try {
          const lease = await this.leaseProvider.acquire(runOpts.sessionId, runOpts.clientId, runOpts.force);
          leaseId = lease.leaseId;
        } catch (e: any) {
          return finalizeError(`Lease acquisition failed: ${e?.message || 'unknown'}`);
        }
      }

      while (state.currentIndex < plan.steps.length) {
        const step = plan.steps[state.currentIndex];
        const node = graph.nodes[step.specHash];
        if (!node) {
          return finalizeError(`Missing node during execution: ${step.specHash}`);
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

        // Autonomous execution
        rec.status = 'running';
        rec.attempts += 1;
        rec.startedAt = rec.startedAt ?? Date.now();
        try {
          const output = await this.executor.execute(step.specHash);
          rec.status = 'completed';
          rec.endedAt = Date.now();
          rec.output = output;
          results[step.specHash] = output;
          executed.push(step.specHash);
          // Merge into session context (last write wins). For now shallow assign.
          if (output && typeof output === 'object') {
            Object.assign(state.sessionContext, output as Record<string, unknown>);
          }
          // Lease renewal cadence
          if (leaseId) {
            specsSinceRenew++;
            if (specsSinceRenew >= this.leaseRenewEvery) {
              try { await this.leaseProvider.renew(leaseId); } catch (e: any) { return finalizeError(`Lease renewal failed: ${e?.message || 'unknown'}`); }
              specsSinceRenew = 0;
            }
          }
        } catch (err: any) {
          rec.status = 'failed';
          rec.endedAt = Date.now();
            rec.errorMessage = err?.message || 'Autonomous executor error';
          return finalizeError(`Execution failed at spec ${step.specHash}: ${rec.errorMessage}`);
        }

        state.currentIndex++;
      }

      // Release lease on normal completion
      if (leaseId) {
        void this.leaseProvider.release(leaseId).catch(() => {/* ignore */});
      }
      return { status: 'completed', executed, results, warnings: plan.warnings };
    } catch (e: any) {
      return {
        status: 'error',
        executed: [],
        results: {},
        warnings: [],
        error: { message: e?.message || 'Unknown error' }
      };
    }
  }

    /** Phase 3: resume execution after a human spec output is provided. */
    async resume(graph: ToolGraph, serializedState: SerializedPausedState, input: { specHash: string; humanOutput: unknown }, runOpts?: { sessionId?: string; clientId?: string; force?: boolean }): Promise<ExecutionContext> {
        // Basic validation of token/spec alignment
        if (serializedState.awaitingSpec !== input.specHash) {
            return { status: 'error', executed: serializedState.executed, results: serializedState.results, warnings: serializedState.warnings, error: { message: 'Stale or mismatched resume token' } };
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

        // Build a partial plan (reuse previous plan steps)
        const remainingSteps = serializedState.plan.steps.slice(nextIndex + 1);
        const plan: ExecutionPlan = { steps: remainingSteps, warnings: serializedState.warnings };

        // Execute remaining autonomous specs using normal loop logic by constructing a temp graph plan.
        // Simplify: create a mini engine iteration (duplicating small portion to avoid deep refactor now).
        const executed: string[] = [...serializedState.executed];
        const results: Record<string, unknown> = { ...serializedState.results };

        let leaseId: string | undefined;
        let specsSinceRenew = 0;
        const finalizeError = (message: string): ExecutionContext => {
            if (leaseId) void this.leaseProvider.release(leaseId).catch(() => { });
            return { status: 'error', executed, results, warnings: plan.warnings, error: { message } };
        };

        if (runOpts?.sessionId && runOpts?.clientId) {
            try { const lease = await this.leaseProvider.acquire(runOpts.sessionId, runOpts.clientId, runOpts.force); leaseId = lease.leaseId; } catch (e: any) { return finalizeError(`Lease acquisition failed: ${e?.message || 'unknown'}`); }
        }

        for (const step of remainingSteps) {
            const node = graph.nodes[step.specHash];
            if (!node) return finalizeError(`Missing node during execution: ${step.specHash}`);
            if (node.intent === 'human') {
                const resumeToken = this.buildResumeToken({ ...serializedState, currentIndex: nextIndex + executed.length }, step.specHash);
                if (leaseId) void this.leaseProvider.release(leaseId).catch(() => { });
                return { status: 'awaiting_input', executed, results, warnings: plan.warnings, awaitingSpec: step.specHash, resumeToken };
            }
            try {
                const output = await this.executor.execute(step.specHash);
                results[step.specHash] = output;
                executed.push(step.specHash);
                if (output && typeof output === 'object') Object.assign(serializedState.sessionContext, output as Record<string, unknown>);
                if (leaseId) {
                    specsSinceRenew++;
                    if (specsSinceRenew >= (this.leaseRenewEvery)) {
                        try { await this.leaseProvider.renew(leaseId); } catch (e: any) { return finalizeError(`Lease renewal failed: ${e?.message || 'unknown'}`); }
                        specsSinceRenew = 0;
                    }
                }
            } catch (err: any) {
                return finalizeError(`Execution failed at spec ${step.specHash}: ${err?.message || 'Autonomous executor error'}`);
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
