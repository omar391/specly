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

    // Cycle detection via DFS color marking
    const color: Record<string, 0 | 1 | 2> = {}; // 0=unvisited,1=visiting,2=done
    const cyclePath: string[] = [];
    let hasCycle = false;
    const dfs = (node: string) => {
      color[node] = 1;
      for (const edge of adjacency[node]) {
        const n = edge.to;
        if (color[n] === 0) {
          dfs(n);
          if (hasCycle) return;
        } else if (color[n] === 1) {
          hasCycle = true;
          cyclePath.push(n);
          return;
        }
      }
      color[node] = 2;
    };
    dfs(graph.entry);
    if (hasCycle) {
      throw new Error(`Cycle detected in tool graph involving ${cyclePath.join(' -> ')}`);
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

    const reachable = new Set<string>();
    // BFS from entry to mark reachable
    const q = [graph.entry];
    while (q.length) {
      const n = q.shift()!;
      if (reachable.has(n)) continue;
      reachable.add(n);
      for (const e of adjacency[n]) q.push(e.to);
    }

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
