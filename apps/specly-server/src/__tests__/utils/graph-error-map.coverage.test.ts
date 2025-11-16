import { describe, it, expect } from 'vitest';

describe('mapGraphValidationToPublicError', () => {
  it('maps cycle errors to GRAPH_CYCLE', async () => {
    const { mapGraphValidationToPublicError } = await import('../../utils/graph-error-map.js');
    const e: any = { code: 'ERR_CYCLE', message: 'cycle' };
    expect(mapGraphValidationToPublicError(e).code).toBe('GRAPH_CYCLE');
  });

  it('maps undeclared spec to GRAPH_MISSING_NODE', async () => {
    const { mapGraphValidationToPublicError } = await import('../../utils/graph-error-map.js');
    const e: any = { code: 'ERR_UNDECLARED_SPEC', message: 'missing' };
    expect(mapGraphValidationToPublicError(e).code).toBe('GRAPH_MISSING_NODE');
  });

  it('maps other errors to GRAPH_INVALID', async () => {
    const { mapGraphValidationToPublicError } = await import('../../utils/graph-error-map.js');
    const e: any = { code: 'SOME_OTHER', message: 'other' };
    expect(mapGraphValidationToPublicError(e).code).toBe('GRAPH_INVALID');
  });
});
