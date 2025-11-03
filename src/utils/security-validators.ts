// SP-013: Security & Validation utilities
// Enforces production safety constraints on specs, tools, and graphs.

import { GlobalDatabaseService } from '../database/global-queries.js';
import { tools } from '../database/schema/global-schema.js';
import { eq } from 'drizzle-orm';

// =========================================
// Environment-driven configuration
// =========================================
const MAX_SPEC_CONTENT_SIZE = parseInt(process.env.SPECLY_MAX_SPEC_CONTENT_SIZE || '1048576', 10); // 1MB default
const MAX_SPEC_GRAPH_DEPTH = parseInt(process.env.SPECLY_MAX_GRAPH_DEPTH || '50', 10);
const MAX_GRAPH_NODES = parseInt(process.env.SPECLY_MAX_GRAPH_NODES || '1000', 10);
const MAX_INPUT_SCHEMA_SIZE = parseInt(process.env.SPECLY_MAX_INPUT_SCHEMA_SIZE || '102400', 10); // 100KB
const MAX_OUTPUT_SCHEMA_SIZE = parseInt(process.env.SPECLY_MAX_OUTPUT_SCHEMA_SIZE || '102400', 10); // 100KB

const ALLOWED_EXECUTOR_TYPES: ReadonlyArray<string> = ['function', 'bash', 'rest', 'graphql', 'noop', 'node'];

export interface SecurityValidationError {
  code: string;
  message: string;
  details?: any;
}

// =========================================
// Executor Type Validation
// =========================================
export function validateExecutorType(executorType: string): SecurityValidationError | null {
  if (!ALLOWED_EXECUTOR_TYPES.includes(executorType)) {
    return {
      code: 'ERR_INVALID_EXECUTOR_TYPE',
      message: `Executor type '${executorType}' not allowed. Allowed types: ${ALLOWED_EXECUTOR_TYPES.join(', ')}`,
      details: { executorType, allowed: ALLOWED_EXECUTOR_TYPES }
    };
  }
  return null;
}

// =========================================
// Spec Size Validation
// =========================================
export function validateSpecSizeLimits(spec: {
  content_template?: string | null;
  input_schema?: any;
  output_schema?: any;
}): SecurityValidationError | null {
  // Content template size check
  if (spec.content_template) {
    const contentSize = Buffer.byteLength(spec.content_template, 'utf8');
    if (contentSize > MAX_SPEC_CONTENT_SIZE) {
      return {
        code: 'ERR_SPEC_CONTENT_TOO_LARGE',
        message: `Spec content_template exceeds maximum size (${contentSize} > ${MAX_SPEC_CONTENT_SIZE} bytes)`,
        details: { contentSize, maxSize: MAX_SPEC_CONTENT_SIZE }
      };
    }
  }

  // Input schema size check
  if (spec.input_schema) {
    const schemaSize = Buffer.byteLength(JSON.stringify(spec.input_schema), 'utf8');
    if (schemaSize > MAX_INPUT_SCHEMA_SIZE) {
      return {
        code: 'ERR_INPUT_SCHEMA_TOO_LARGE',
        message: `Input schema exceeds maximum size (${schemaSize} > ${MAX_INPUT_SCHEMA_SIZE} bytes)`,
        details: { schemaSize, maxSize: MAX_INPUT_SCHEMA_SIZE }
      };
    }
  }

  // Output schema size check
  if (spec.output_schema) {
    const schemaSize = Buffer.byteLength(JSON.stringify(spec.output_schema), 'utf8');
    if (schemaSize > MAX_OUTPUT_SCHEMA_SIZE) {
      return {
        code: 'ERR_OUTPUT_SCHEMA_TOO_LARGE',
        message: `Output schema exceeds maximum size (${schemaSize} > ${MAX_OUTPUT_SCHEMA_SIZE} bytes)`,
        details: { schemaSize, maxSize: MAX_OUTPUT_SCHEMA_SIZE }
      };
    }
  }

  return null;
}

// =========================================
// Graph Size Validation
// =========================================
export function validateGraphSizeLimits(manifest: {
  ordered_specs: string[];
  edges: any[];
}): SecurityValidationError | null {
  // Node count check
  if (manifest.ordered_specs.length > MAX_GRAPH_NODES) {
    return {
      code: 'ERR_GRAPH_TOO_MANY_NODES',
      message: `Graph exceeds maximum node count (${manifest.ordered_specs.length} > ${MAX_GRAPH_NODES})`,
      details: { nodeCount: manifest.ordered_specs.length, maxNodes: MAX_GRAPH_NODES }
    };
  }

  // Graph depth check via BFS from entry (requires entry_spec parameter)
  // We'll compute max distance from entry to any reachable node
  // Note: This is a simplified depth check; caller should pass entry_spec
  // For now, we'll check total edge count as a proxy for complexity
  const edgeCount = manifest.edges.length;
  const maxEdges = MAX_GRAPH_NODES * 3; // reasonable heuristic: avg 3 edges per node
  if (edgeCount > maxEdges) {
    return {
      code: 'ERR_GRAPH_TOO_MANY_EDGES',
      message: `Graph exceeds maximum edge count (${edgeCount} > ${maxEdges})`,
      details: { edgeCount, maxEdges }
    };
  }

  return null;
}

/**
 * Computes maximum graph depth from entry_spec using BFS
 */
export function computeGraphDepth(manifest: {
  ordered_specs: string[];
  entry_spec: string;
  edges: { from: string; to: string }[];
}): number {
  const adj: Record<string, string[]> = {};
  for (const s of manifest.ordered_specs) {
    adj[s] = [];
  }
  for (const e of manifest.edges) {
    adj[e.from].push(e.to);
  }

  const queue: Array<{ node: string; depth: number }> = [{ node: manifest.entry_spec, depth: 0 }];
  const visited = new Set<string>();
  let maxDepth = 0;

  while (queue.length) {
    const { node, depth } = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    maxDepth = Math.max(maxDepth, depth);

    for (const neighbor of adj[node]) {
      if (!visited.has(neighbor)) {
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    }
  }

  return maxDepth;
}

export function validateGraphDepth(manifest: {
  ordered_specs: string[];
  entry_spec: string;
  edges: { from: string; to: string }[];
}): SecurityValidationError | null {
  const depth = computeGraphDepth(manifest);
  if (depth > MAX_SPEC_GRAPH_DEPTH) {
    return {
      code: 'ERR_GRAPH_TOO_DEEP',
      message: `Graph exceeds maximum depth (${depth} > ${MAX_SPEC_GRAPH_DEPTH})`,
      details: { depth, maxDepth: MAX_SPEC_GRAPH_DEPTH }
    };
  }
  return null;
}

// =========================================
// Command Alias Uniqueness Check
// =========================================
/**
 * Validates that command_alias is not already registered in the global tools table.
 * This prevents accidental collisions where two tools claim the same alias.
 */
export async function validateCommandAliasUniqueness(
  dbService: GlobalDatabaseService,
  commandAlias: string | null | undefined,
  excludeToolName?: string
): Promise<SecurityValidationError | null> {
  if (!commandAlias) return null; // nullable field, no conflict

  await dbService.initialize();
  const db = dbService.getDrizzleManager().getDb();

  let query = db.select({ name: tools.name }).from(tools).where(eq(tools.commandAlias, commandAlias));
  const existing = await query.limit(1);

  if (existing.length > 0) {
    const conflictingTool = existing[0].name;
    if (excludeToolName && conflictingTool === excludeToolName) {
      // Updating same tool with same alias is fine
      return null;
    }
    return {
      code: 'ERR_COMMAND_ALIAS_CONFLICT',
      message: `Command alias '${commandAlias}' is already registered to tool '${conflictingTool}'`,
      details: { commandAlias, conflictingTool }
    };
  }

  return null;
}

// =========================================
// Composite Validation for Specs
// =========================================
export function validateSpecSecurity(spec: {
  executor_type: string;
  content_template?: string | null;
  input_schema?: any;
  output_schema?: any;
}): SecurityValidationError | null {
  // Check executor type first
  const executorErr = validateExecutorType(spec.executor_type);
  if (executorErr) return executorErr;

  // Check size limits
  const sizeErr = validateSpecSizeLimits(spec);
  if (sizeErr) return sizeErr;

  return null;
}

// =========================================
// Export configuration for tests
// =========================================
export const SECURITY_LIMITS = {
  MAX_SPEC_CONTENT_SIZE,
  MAX_SPEC_GRAPH_DEPTH,
  MAX_GRAPH_NODES,
  MAX_INPUT_SCHEMA_SIZE,
  MAX_OUTPUT_SCHEMA_SIZE,
  ALLOWED_EXECUTOR_TYPES
};
