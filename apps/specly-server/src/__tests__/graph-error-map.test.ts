import { describe, it, expect } from 'vitest';
import { GraphValidationError } from '../utils/graph-validate.js';
import { mapGraphValidationToPublicError } from '../utils/graph-error-map.js';

describe('graph-error-map', () => {
  it('maps cycle/self-loop to GRAPH_CYCLE', () => {
    const e1 = new GraphValidationError('ERR_CYCLE', 'cycle');
    const e2 = new GraphValidationError('ERR_SELF_LOOP', 'self loop');
    expect(mapGraphValidationToPublicError(e1).code).toBe('GRAPH_CYCLE');
    expect(mapGraphValidationToPublicError(e2).code).toBe('GRAPH_CYCLE');
  });
  it('maps undeclared/entry-not-declared to GRAPH_MISSING_NODE', () => {
    const e1 = new GraphValidationError('ERR_UNDECLARED_SPEC', 'missing node');
    const e2 = new GraphValidationError('ERR_ENTRY_NOT_DECLARED', 'entry missing');
    expect(mapGraphValidationToPublicError(e1).code).toBe('GRAPH_MISSING_NODE');
    expect(mapGraphValidationToPublicError(e2).code).toBe('GRAPH_MISSING_NODE');
  });
  it('maps other errors to GRAPH_INVALID', () => {
    const e1 = new GraphValidationError('ERR_UNREACHABLE', 'unreachable');
    const e2 = new GraphValidationError('ERR_PRIORITY_INVALID', 'priority invalid');
    const e3 = new GraphValidationError('ERR_DUP_SPEC', 'dup');
    expect(mapGraphValidationToPublicError(e1).code).toBe('GRAPH_INVALID');
    expect(mapGraphValidationToPublicError(e2).code).toBe('GRAPH_INVALID');
    expect(mapGraphValidationToPublicError(e3).code).toBe('GRAPH_INVALID');
  });
});
