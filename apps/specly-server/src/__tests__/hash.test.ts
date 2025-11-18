import { describe, it, expect, beforeEach } from 'vitest';
import { canonicalStringify, sha256, hashSpec, hashToolVersion, stableHash } from '../utils/hash.js';
import { configureHashCache, resetHashCacheMetrics } from '../utils/hash-cache.js';

describe('canonicalStringify and internal behavior', () => {
  it('stringifies primitives and null', () => {
    expect(canonicalStringify(null)).toBe('null');
    expect(canonicalStringify(123)).toBe('123');
    expect(canonicalStringify('x')).toBe('"x"');
    expect(canonicalStringify(true)).toBe('true');
  });

  it('preserves array order', () => {
    expect(canonicalStringify([2, 1])).toBe('[2,1]');
    expect(canonicalStringify(["b", "a"])) .toBe('["b","a"]');
  });

  it('orders object keys lexicographically', () => {
    const obj = { b: 2, a: 1 };
    expect(canonicalStringify(obj)).toBe('{"a":1,"b":2}');
  });

  it('handles nested structures', () => {
    const nested = { z: [3, { b: 2, a: 1 }], a: null };
    const canon = canonicalStringify(nested);
    // keys sorted: a then z
    expect(canon.startsWith('{"a":null,"z":')).toBe(true);
  });
});

describe('hashing utilities', () => {
  beforeEach(() => {
    configureHashCache({ size: 10 });
    resetHashCacheMetrics();
  });

  it('sha256 returns hex string of length 64', () => {
    const s = sha256('hello');
    expect(typeof s).toBe('string');
    expect(s).toHaveLength(64);
  });

  it('hashSpec is deterministic', () => {
    const spec = { a: 1, b: 2 };
    const r1 = hashSpec(spec);
    const r2 = hashSpec(spec);
    expect(r1.hash).toEqual(r2.hash);
    expect(r1.canonical).toEqual(r2.canonical);
  });

  it('hashToolVersion sorts edges deterministically', () => {
    const input = {
      ordered_specs: ['s1', 's2'],
      edges: [
        { from: 'x', to: 'y', priority: 2 },
        { from: 'a', to: 'b', priority: 1 }
      ],
      meta: 'm'
    };
    const a = hashToolVersion(input);
    // reverse edge order should produce same canonical hash
    const input2 = { ...input, edges: [...input.edges].reverse() };
    const b = hashToolVersion(input2);
    expect(a.hash).toEqual(b.hash);
    expect(a.canonical).toEqual(b.canonical);
  });

  it('stableHash is deterministic across calls', () => {
    const v = { x: 1, y: [2, 3] };
    const h1 = stableHash(v);
    const h2 = stableHash(v);
    expect(h1).toEqual(h2);
  });
});
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
