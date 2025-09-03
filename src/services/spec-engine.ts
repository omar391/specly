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

  constructor(opts: SpecEngineOptions = {}) {
    this.planner = opts.planner ?? new BasicExecutionPlanner();
    this.executor = opts.executor ?? new NoopAutonomousExecutor();
  }

  async run(graph: ToolGraph): Promise<ExecutionContext> {
    try {
      const plan = this.planner.buildPlan(graph);
      const executed: string[] = [];
      const results: Record<string, unknown> = {};

      for (const step of plan.steps) {
        const node = graph.nodes[step.specHash];
        if (!node) {
          return {
            status: 'error',
            executed,
            results,
            warnings: plan.warnings,
            error: { message: `Missing node during execution: ${step.specHash}` }
          };
        }
        if (node.intent === 'human') {
          // Pause before executing human spec, exposing awaiting_input state
            return {
              status: 'awaiting_input',
              executed,
              results,
              warnings: plan.warnings,
              awaitingSpec: step.specHash
            };
        }
        // Autonomous spec: execute
        const output = await this.executor.execute(step.specHash);
        results[step.specHash] = output;
        executed.push(step.specHash);
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
