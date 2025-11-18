import { describe, it, expect } from 'vitest';
import { validateToolGraph, GraphValidationError, NormalizedEdge } from '../utils/graph-validate.js';

const baseSpecs = ['A','B','C','D'];

describe('graph-validate', () => {
  it('happy path sorts edges deterministically & normalizes priority', () => {
    const manifest = {
      ordered_specs: baseSpecs,
      entry_spec: 'A',
      edges: [
        { from: 'A', to: 'B', condition_type: 'always' as const, priority: 50 },
        { from: 'B', to: 'C', condition_type: 'result_code' as const, condition_value: 'ok' }, // missing priority -> 100
        { from: 'C', to: 'D', condition_type: 'always' as const, priority: 10 }
      ]
    };
    const normalized = validateToolGraph(manifest);
    // priorities filled
  expect((normalized.edges.find((e: NormalizedEdge) => e.from==='B') as NormalizedEdge).priority).toBe(100);
    // sorted ordering (by from, to, condition_type, condition_value, priority, insertion)
  const edgeOrder = normalized.edges.map((e: NormalizedEdge) => `${e.from}->${e.to}`);
    expect(edgeOrder).toEqual(['A->B','B->C','C->D']);
  });

  it('rejects cycle', () => {
    const manifest = {
      ordered_specs: ['A','B'],
      entry_spec: 'A',
      edges: [
        { from: 'A', to: 'B', condition_type: 'always' as const },
        { from: 'B', to: 'A', condition_type: 'always' as const }
      ]
    };
    expect(() => validateToolGraph(manifest)).toThrowError(GraphValidationError);
    try { validateToolGraph(manifest); } catch (e:any) { expect(e.code).toBe('ERR_CYCLE'); }
  });

  it('rejects unreachable spec when flag not set', () => {
    const manifest = {
      ordered_specs: ['A','B','C'],
      entry_spec: 'A',
      edges: [ { from: 'A', to: 'B', condition_type: 'always' as const } ] // C unreachable
    };
    expect(() => validateToolGraph(manifest)).toThrowError(GraphValidationError);
    try { validateToolGraph(manifest); } catch (e:any) { expect(e.code).toBe('ERR_UNREACHABLE'); }
  });

  it('allows unreachable spec when allowUnreachable=true', () => {
    const manifest = {
      ordered_specs: ['A','B','C'],
      entry_spec: 'A',
      edges: [ { from: 'A', to: 'B', condition_type: 'always' as const } ]
    };
    const normalized = validateToolGraph(manifest, { allowUnreachable: true });
    expect(normalized.ordered_specs.length).toBe(3);
  });

  it('rejects self-loop', () => {
    const manifest = {
      ordered_specs: ['A'],
      entry_spec: 'A',
      edges: [ { from: 'A', to: 'A', condition_type: 'always' as const } ]
    };
    expect(() => validateToolGraph(manifest)).toThrowError(GraphValidationError);
    try { validateToolGraph(manifest); } catch (e:any) { expect(e.code).toBe('ERR_SELF_LOOP'); }
  });

  it('rejects negative priority', () => {
    const manifest = {
      ordered_specs: ['A','B'],
      entry_spec: 'A',
      edges: [ { from: 'A', to: 'B', condition_type: 'always' as const, priority: -1 } ]
    };
    expect(() => validateToolGraph(manifest)).toThrowError(GraphValidationError);
    try { validateToolGraph(manifest); } catch (e:any) { expect(e.code).toBe('ERR_PRIORITY_INVALID'); }
  });

  it('rejects float priority', () => {
    const manifest = {
      ordered_specs: ['A','B'],
      entry_spec: 'A',
      edges: [ { from: 'A', to: 'B', condition_type: 'always' as const, priority: 5.5 } ]
    };
    expect(() => validateToolGraph(manifest)).toThrowError(GraphValidationError);
    try { validateToolGraph(manifest); } catch (e:any) { expect(e.code).toBe('ERR_PRIORITY_INVALID'); }
  });

  it('rejects duplicate ordered_specs', () => {
    const manifest = {
      ordered_specs: ['A','A'],
      entry_spec: 'A',
      edges: []
    } as any;
    expect(() => validateToolGraph(manifest)).toThrowError(GraphValidationError);
    try { validateToolGraph(manifest); } catch (e:any) { expect(e.code).toBe('ERR_DUP_SPEC'); }
  });

  it('rejects edge referencing undeclared spec', () => {
    const manifest = {
      ordered_specs: ['A'],
      entry_spec: 'A',
      edges: [ { from: 'A', to: 'B', condition_type: 'always' as const } ]
    } as any;
    expect(() => validateToolGraph(manifest)).toThrowError(GraphValidationError);
    try { validateToolGraph(manifest); } catch (e:any) { expect(e.code).toBe('ERR_UNDECLARED_SPEC'); }
  });

  it('sorts edges deterministically using insertion index fallback', () => {
    const manifest = {
      ordered_specs: ['A', 'B', 'C'],
      entry_spec: 'A',
      edges: [
        // Create edges with identical sorting criteria except insertion index
        { from: 'A', to: 'B', condition_type: 'always' as const, condition_value: 'same', priority: 50 },
        { from: 'A', to: 'B', condition_type: 'always' as const, condition_value: 'same', priority: 50 },
        { from: 'A', to: 'C', condition_type: 'always' as const, priority: 10 }
      ]
    };
    const normalized = validateToolGraph(manifest);
    // The edges should be sorted deterministically
    expect(normalized.edges.length).toBe(3);
    // First two edges should be the identical ones (sorted by insertion index)
    expect(normalized.edges[0].to).toBe('B');
    expect(normalized.edges[1].to).toBe('B');
    expect(normalized.edges[2].to).toBe('C');
  });
});
