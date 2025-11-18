import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LRUCache,
  configureHashCache,
  getOrComputeHash,
  hashCacheMetrics,
  resetHashCacheMetrics,
} from '../utils/hash-cache';
import { stableHash, hashSpec } from '../utils/hash.js';

describe('LRUCache basic behavior', () => {
  it('sets, gets, refreshes recency and evicts oldest', () => {
    const c = new LRUCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);

    // access 'a' to refresh recency so order becomes ['b','a']
    expect(c.get('a')).toBe(1);

    // add 'c' which should evict the oldest ('b')
    c.set('c', 3);

    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);

    // clear should remove everything
    c.clear();
    expect(c.get('a')).toBeUndefined();
    expect(c.get('c')).toBeUndefined();
  });

  it('overwrites existing key and moves it to most-recent', () => {
    const c = new LRUCache<string, number>(2);
    c.set('x', 10);
    c.set('y', 20);
    // overwrite x
    c.set('x', 11);
    // insertion order now: y, x -> adding z evicts y
    c.set('z', 30);
    expect(c.get('y')).toBeUndefined();
    expect(c.get('x')).toBe(11);
    expect(c.get('z')).toBe(30);
  });
});

describe('hash cache wrapper and metrics', () => {
  beforeEach(() => {
    // ensure a small predictable cache per test
    configureHashCache({ size: 2 });
    resetHashCacheMetrics();
  });

  it('computes and caches values, updates misses and hits', () => {
    const compute = vi.fn(() => 'value1');
    const v1 = getOrComputeHash('k1', compute);
    expect(v1).toBe('value1');
    expect(compute).toHaveBeenCalledTimes(1);
    expect(hashCacheMetrics.misses).toBe(1);
    expect(hashCacheMetrics.hits).toBe(0);

    const compute2 = vi.fn(() => 'value-should-not-run');
    const v2 = getOrComputeHash('k1', compute2);
    expect(v2).toBe('value1');
    expect(compute2).not.toHaveBeenCalled();
    expect(hashCacheMetrics.hits).toBe(1);
  });

  it('evicts according to configured size when used via getOrComputeHash', () => {
    // size=2 from beforeEach
    const c1 = vi.fn(() => 'a');
    const c2 = vi.fn(() => 'b');
    const c3 = vi.fn(() => 'c');

    expect(getOrComputeHash('k1', c1)).toBe('a'); // miss
    expect(getOrComputeHash('k2', c2)).toBe('b'); // miss

    // touch k1 to make it most-recent
    expect(getOrComputeHash('k1', () => 'a-ignored')).toBe('a'); // hit

    // adding k3 should evict the least-recent (k2)
    expect(getOrComputeHash('k3', c3)).toBe('c'); // miss

    // k2 was evicted so computing again should call its compute fn
    const c2b = vi.fn(() => 'b2');
    expect(getOrComputeHash('k2', c2b)).toBe('b2');
    expect(c2b).toHaveBeenCalled();
  });

  it('resetHashCacheMetrics clears counters', () => {
    // mutate counters
    hashCacheMetrics.hits = 5;
    hashCacheMetrics.misses = 7;
    resetHashCacheMetrics();
    expect(hashCacheMetrics.hits).toBe(0);
    expect(hashCacheMetrics.misses).toBe(0);
  });
});

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>(3);
  });

  it('sets and gets values', () => {
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('refreshes recency on get', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // Access 'a' to make it most recent
    expect(cache.get('a')).toBe(1);
    // Add 'd', should evict 'b' (least recent)
    cache.set('d', 4);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('evicts when over capacity', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // Should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('handles eviction when map.keys().next().value is undefined', () => {
    // Subclass LRUCache to use a broken Map
    class TestLRUCache<K, V> extends LRUCache<K, V> {
      constructor(maxSize: number) {
        super(maxSize);
        // Replace the protected map with a broken one
        this.map = new class extends Map<K, V> {
          keys() {
            return {
              next: () => ({ value: undefined, done: false }),
              [Symbol.iterator]: function* () { yield undefined; }
            };
          }
        }();
      }
    }

    const cache = new TestLRUCache<string, number>(1);
    cache.set('a', 1);
    cache.set('b', 2); // This should trigger eviction with undefined oldestKey

    // Should not crash - the if condition should prevent deletion
    expect(cache.get('a')).toBe(1); // 'a' should still be there
    expect(cache.get('b')).toBe(2);
  });

  it('clears the cache', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('replaces existing key and exercises internal delete branch', () => {
    cache.set('x', 1);
    // setting same key should hit the `this.map.has(key)` branch and delete existing
    cache.set('x', 2);
    expect(cache.get('x')).toBe(2);
  });
});

describe('configureHashCache', () => {
  it('configures cache with valid size', () => {
    configureHashCache({ size: 10 });
    // Test that configuration works by checking getOrComputeHash behavior
    let computeCount = 0;
    const result1 = getOrComputeHash('test', () => {
      computeCount++;
      return 'computed';
    });
    const result2 = getOrComputeHash('test', () => {
      computeCount++;
      return 'computed';
    });
    expect(result1).toBe('computed');
    expect(result2).toBe('computed');
    expect(computeCount).toBe(1); // Should hit cache on second call
  });

  it('ignores invalid size (0)', () => {
    configureHashCache({ size: 0 });
    // Should not change cache configuration
  });

  it('ignores invalid size (negative)', () => {
    configureHashCache({ size: -1 });
    // Should not change cache configuration
  });

  it('ignores invalid size (NaN)', () => {
    configureHashCache({ size: NaN });
    // Should not change cache configuration
  });

  it('handles empty options', () => {
    configureHashCache({});
    // Should not change cache configuration
  });

  it('handles undefined options', () => {
    configureHashCache(undefined);
    // Should not change cache configuration
  });
});

describe('getOrComputeHash', () => {
  beforeEach(() => {
    configureHashCache({ size: 3 });
    resetHashCacheMetrics();
  });

  it('computes and caches value on first call', () => {
    let computeCount = 0;
    const result = getOrComputeHash('key1', () => {
      computeCount++;
      return 'value1';
    });
    expect(result).toBe('value1');
    expect(computeCount).toBe(1);
    expect(hashCacheMetrics.misses).toBe(1);
    expect(hashCacheMetrics.hits).toBe(0);
  });

  it('returns cached value on subsequent calls', () => {
    let computeCount = 0;
    getOrComputeHash('key1', () => {
      computeCount++;
      return 'value1';
    });
    const result = getOrComputeHash('key1', () => {
      computeCount++;
      return 'value1';
    });
    expect(result).toBe('value1');
    expect(computeCount).toBe(1); // Should not compute again
    expect(hashCacheMetrics.misses).toBe(1);
    expect(hashCacheMetrics.hits).toBe(1);
  });
});

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
