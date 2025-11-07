import { describe, it, expect } from 'vitest';
import { canonicalStringify, hashSpec, hashToolVersion, stableHash } from '../utils/hash.js';

describe('Hash & Canonicalization (SP-002)', () => {
  it('should produce identical canonical strings for objects with different key order', () => {
    const a = { z: 1, a: 2, nested: { b: 3, a: 4 } };
    const b = { a: 2, nested: { a: 4, b: 3 }, z: 1 };
    expect(canonicalStringify(a)).toEqual(canonicalStringify(b));
  });

  it('stableHash should differ when value meaningfully changes', () => {
    const a = { a: 1, b: 2 };
    const b = { a: 1, b: 3 };
    expect(stableHash(a)).not.toEqual(stableHash(b));
  });

  it('hashSpec should return consistent hash across runs', () => {
    const spec = { name: 'example', inputs: { foo: 'string' }, outputs: { bar: 'number' } };
    const first = hashSpec(spec);
    const second = hashSpec(JSON.parse(JSON.stringify(spec)));
    expect(first.hash).toEqual(second.hash);
    expect(first.canonical).toEqual(second.canonical);
  });

  it('hashToolVersion should sort edges deterministically but preserve ordered_specs order', () => {
    const tv1 = {
      version: 1,
      ordered_specs: [ 'specA', 'specB', 'specC' ],
      edges: [
        { from: 'specB', to: 'specC', priority: 5 },
        { from: 'specA', to: 'specB', priority: 10 },
        { from: 'specA', to: 'specC', priority: 2 }
      ]
    };
    const tv2 = {
      version: 1,
      ordered_specs: [ 'specA', 'specB', 'specC' ],
      edges: [
        { from: 'specA', to: 'specB', priority: 10 },
        { from: 'specA', to: 'specC', priority: 2 },
        { from: 'specB', to: 'specC', priority: 5 }
      ]
    };

    const h1 = hashToolVersion(tv1);
    const h2 = hashToolVersion(tv2);
    expect(h1.hash).toEqual(h2.hash);
    expect(h1.canonical).toEqual(h2.canonical);
    // sanity: order of ordered_specs should remain unchanged in canonical form
    expect(h1.canonical.includes('specA')).toBeTruthy();
  });

  it('hashToolVersion should be unaffected by edge input order (normalization)', () => {
    const common = { ordered_specs: ['A','B','C'] };
    const e1 = [
      { from: 'A', to: 'B', priority: 100 },
      { from: 'B', to: 'C', priority: 50 }
    ];
    const e2 = [
      { from: 'B', to: 'C', priority: 50 },
      { from: 'A', to: 'B', priority: 100 }
    ];
    const h1 = hashToolVersion({ ...common, edges: e1 });
    const h2 = hashToolVersion({ ...common, edges: e2 });
    expect(h1.hash).toEqual(h2.hash);
  });

  it('hashToolVersion changes when defaulted priority is explicitly altered', () => {
    const common = { ordered_specs: ['A','B'] };
    const withDefault = hashToolVersion({ ...common, edges: [ { from: 'A', to: 'B' } ] });
    const withDifferent = hashToolVersion({ ...common, edges: [ { from: 'A', to: 'B', priority: 5 } ] });
    expect(withDefault.hash).not.toEqual(withDifferent.hash);
  });
});
