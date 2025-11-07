import { GraphValidationError } from './graph-validate.js';

// Public API graph error codes (stable surface)
export type PublicGraphErrorCode = 'GRAPH_CYCLE' | 'GRAPH_MISSING_NODE' | 'GRAPH_INVALID';

export interface PublicGraphError {
  code: PublicGraphErrorCode;
  message: string;
}

/**
 * Maps internal GraphValidationError codes to public API error codes used by HTTP endpoints.
 * - Cycles & self-loops => GRAPH_CYCLE
 * - Undeclared specs / entry not declared => GRAPH_MISSING_NODE
 * - Other validation errors => GRAPH_INVALID
 */
export function mapGraphValidationToPublicError(e: GraphValidationError): PublicGraphError {
  // Cycle-related
  if (e.code === 'ERR_CYCLE' || e.code === 'ERR_SELF_LOOP') {
    return { code: 'GRAPH_CYCLE', message: e.message };
  }
  // Missing / undeclared spec references
  if (e.code === 'ERR_UNDECLARED_SPEC' || e.code === 'ERR_ENTRY_NOT_DECLARED') {
    return { code: 'GRAPH_MISSING_NODE', message: e.message };
  }
  // Duplicate spec, unreachable, priority invalid, etc.
  return { code: 'GRAPH_INVALID', message: e.message };
}
