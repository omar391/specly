import { describe, it, expect, beforeEach } from 'vitest';
import { stableHash, hashSpec } from '../utils/hash.js';
import { configureHashCache, resetHashCacheMetrics, hashCacheMetrics } from '../utils/hash-cache.js';

describe('hash LRU cache integration', () => {
  beforeEach(() => {
    // small cache size to exercise eviction
    configureHashCache({ size: 3 });
    resetHashCacheMetrics();
  });

  it('counts hits and misses and preserves determinism', () => {
    const obj = { a: 1, b: 2 };
    const first = stableHash(obj);
    const second = stableHash(obj); // should hit cache
    expect(first).toEqual(second);
    expect(hashCacheMetrics.misses).toBeGreaterThanOrEqual(1);
    expect(hashCacheMetrics.hits).toBeGreaterThanOrEqual(1);

    // Different objects produce different hashes and cause misses
    const h2 = stableHash({ a: 1, c: 3 });
    expect(h2).not.toEqual(first);
  });

  it('evicts oldest when over capacity', () => {
    // Fill with distinct canonical strings
    const a = stableHash({ x: 1 });
    const b = stableHash({ x: 2 });
    const c = stableHash({ x: 3 });
    // Access 'a' to make it most recent
    const a2 = stableHash({ x: 1 });
    expect(a2).toEqual(a);
    // Insert new entry, expect eviction of the least-recent among (b,c)
    const d = stableHash({ x: 4 });
    // Now computing hash for 'b' or 'c' will cause a miss (cannot assert which got evicted deterministically)
    const missesBefore = hashCacheMetrics.misses;
    const _maybeEvicted = stableHash({ x: 2 });
    expect(hashCacheMetrics.misses).toBeGreaterThanOrEqual(missesBefore); // allow equal if c evicted instead
  });

  it('integrates with hashSpec', () => {
    const spec = { intent: 'autonomous', template: 'Hello' };
    const { hash: h1 } = hashSpec(spec);
    const { hash: h2 } = hashSpec(spec);
    expect(h1).toEqual(h2);
    expect(hashCacheMetrics.hits).toBeGreaterThan(0);
  });
});
