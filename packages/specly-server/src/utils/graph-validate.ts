// SP-018: Graph validation utility
// Validates and normalizes a tool version graph manifest prior to hashing/persisting.
// Enforced invariants:
//  - Exactly one entry_spec (present in ordered_specs)
//  - All ordered_specs unique
//  - All edges reference ordered_specs
//  - No self-loops
//  - No cycles (reachable subgraph from entry)
//  - No unreachable specs (unless allowUnreachable flag)
//  - Priorities normalized: missing => 100; must be integer >= 0
//  - Deterministic edge ordering for hashing
// Returns normalized manifest with sorted edges and normalized priorities.

export interface ToolGraphEdgeInput {
  from: string;
  to: string;
  condition_type: 'result_code' | 'always';
  condition_value?: string;
  priority?: number; // lower = higher precedence
  // internal insertion index may be added by caller; ignore here
}

export interface ToolGraphManifestInput {
  ordered_specs: string[];
  entry_spec: string;
  edges: ToolGraphEdgeInput[];
}

export interface NormalizedEdge extends ToolGraphEdgeInput {
  priority: number; // always present after normalization
}

export interface NormalizedGraphManifest {
  ordered_specs: string[];
  entry_spec: string;
  edges: NormalizedEdge[]; // sorted deterministically
}

export type GraphValidationErrorCode =
  | 'ERR_MULTI_ENTRY'
  | 'ERR_ENTRY_NOT_DECLARED'
  | 'ERR_UNDECLARED_SPEC'
  | 'ERR_DUP_SPEC'
  | 'ERR_SELF_LOOP'
  | 'ERR_CYCLE'
  | 'ERR_UNREACHABLE'
  | 'ERR_PRIORITY_INVALID';

export class GraphValidationError extends Error {
  code: GraphValidationErrorCode;
  details?: any;
  constructor(code: GraphValidationErrorCode, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

interface ValidateOptions {
  allowUnreachable?: boolean;
}

export function validateToolGraph(
  manifest: ToolGraphManifestInput,
  opts: ValidateOptions = {}
): NormalizedGraphManifest {
  const { allowUnreachable } = opts;
  if (!manifest) throw new GraphValidationError('ERR_UNDECLARED_SPEC', 'Manifest missing');

  const { ordered_specs, entry_spec } = manifest;
  if (!Array.isArray(ordered_specs) || ordered_specs.length === 0) {
    throw new GraphValidationError('ERR_UNDECLARED_SPEC', 'ordered_specs must be a non-empty array');
  }
  if (!entry_spec) {
    throw new GraphValidationError('ERR_ENTRY_NOT_DECLARED', 'entry_spec missing');
  }
  if (!ordered_specs.includes(entry_spec)) {
    throw new GraphValidationError('ERR_ENTRY_NOT_DECLARED', 'entry_spec not found in ordered_specs', { entry_spec });
  }
  // uniqueness check
  const seen = new Set<string>();
  for (const s of ordered_specs) {
    if (seen.has(s)) {
      throw new GraphValidationError('ERR_DUP_SPEC', `Duplicate spec hash in ordered_specs: ${s}`, { spec: s });
    }
    seen.add(s);
  }

  // Edge validation & normalization
  const normEdges: NormalizedEdge[] = manifest.edges.map((e, idx) => {
    if (!ordered_specs.includes(e.from) || !ordered_specs.includes(e.to)) {
      throw new GraphValidationError('ERR_UNDECLARED_SPEC', 'Edge references undeclared spec', { edge: e });
    }
    if (e.from === e.to) {
      throw new GraphValidationError('ERR_SELF_LOOP', 'Self-loop edge not allowed', { edge: e });
    }
    let priority = e.priority == null ? 100 : e.priority;
    if (!Number.isInteger(priority) || priority < 0) {
      throw new GraphValidationError('ERR_PRIORITY_INVALID', 'Priority must be integer >= 0', { edge: e });
    }
    return { ...e, priority, _insertion: idx } as NormalizedEdge & { _insertion: number };
  });

  // Build adjacency & in-degree for cycle + reachability
  const adj: Record<string, NormalizedEdge[]> = {};
  const inDegree: Record<string, number> = {};
  for (const s of ordered_specs) {
    adj[s] = [];
    inDegree[s] = 0;
  }
  for (const e of normEdges) {
    adj[e.from].push(e);
    inDegree[e.to]++;
  }

  // Reachability from entry via DFS
  const reachable = new Set<string>();
  (function dfs(node: string) {
    if (reachable.has(node)) return;
    reachable.add(node);
    for (const e of adj[node]) dfs(e.to);
  })(entry_spec);

  if (!allowUnreachable) {
    const unreachable = ordered_specs.filter(s => !reachable.has(s));
    if (unreachable.length) {
      throw new GraphValidationError('ERR_UNREACHABLE', 'Unreachable spec(s) detected', { unreachable });
    }
  }

  // Cycle detection using Kahn (restricted to reachable set for stricter check)
  const inDegCopy: Record<string, number> = {};
  for (const s of reachable) inDegCopy[s] = inDegree[s];
  const q: string[] = [];
  for (const s of reachable) if (inDegCopy[s] === 0) q.push(s);
  let visited = 0;
  while (q.length) {
    const n = q.shift()!;
    visited++;
    for (const e of adj[n]) {
      if (!reachable.has(e.to)) continue; // skip unreachable if allowed
      inDegCopy[e.to]--;
      if (inDegCopy[e.to] === 0) q.push(e.to);
    }
  }
  if (visited !== reachable.size) {
    throw new GraphValidationError('ERR_CYCLE', 'Cycle detected in reachable subgraph');
  }

  // Deterministic edge ordering for hashing
  const sortedEdges = [...normEdges].sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.to !== b.to) return a.to < b.to ? -1 : 1;
    if (a.condition_type !== b.condition_type) return a.condition_type < b.condition_type ? -1 : 1;
    const av = a.condition_value || '';
    const bv = b.condition_value || '';
    if (av !== bv) return av < bv ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    // insertion index fallback ensures stability
    const ai = (a as any)._insertion;
    const bi = (b as any)._insertion;
    return ai - bi;
  }).map(e => {
    const { _insertion, ...rest } = e as any;
    return rest as NormalizedEdge;
  });

  return {
    ordered_specs: [...ordered_specs],
    entry_spec,
    edges: sortedEdges
  };
}
