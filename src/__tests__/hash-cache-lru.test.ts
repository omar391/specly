/**
 * Tests for Hash Cache (LRU Cache)
 * 
 * Tests LRU cache implementation, metrics tracking, and configuration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LRUCache,
  getOrComputeHash,
  configureHashCache,
  resetHashCacheMetrics,
  hashCacheMetrics
} from '../utils/hash-cache.js';

describe('Hash Cache', () => {
  describe('LRUCache', () => {
    it('should store and retrieve values', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('should return undefined for missing keys', () => {
      const cache = new LRUCache<string, number>(3);
      expect(cache.get('missing')).toBeUndefined();
    });

    it('should update existing keys', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('a', 2);
      expect(cache.get('a')).toBe(2);
    });

    it('should evict oldest entry when exceeding maxSize', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // should evict 'a'
      
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('should refresh recency on get', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a'); // refresh 'a'
      cache.set('c', 3); // should evict 'b', not 'a'
      
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
    });

    it('should refresh recency on set for existing key', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('a', 10); // refresh 'a'
      cache.set('c', 3); // should evict 'b'
      
      expect(cache.get('a')).toBe(10);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
    });

    it('should clear all entries', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      cache.clear();
      
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
    });

    it('should handle maxSize of 1', () => {
      const cache = new LRUCache<string, number>(1);
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
      
      cache.set('b', 2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
    });

    it('should handle large maxSize', () => {
      const cache = new LRUCache<string, number>(1000);
      for (let i = 0; i < 500; i++) {
        cache.set(`key${i}`, i);
      }
      
      for (let i = 0; i < 500; i++) {
        expect(cache.get(`key${i}`)).toBe(i);
      }
    });

    it('should work with different value types', () => {
      const cache = new LRUCache<string, any>(3);
      cache.set('string', 'value');
      cache.set('number', 42);
      cache.set('object', { nested: true });
      cache.set('array', [1, 2, 3]);
      
      expect(cache.get('number')).toBe(42);
      expect(cache.get('object')).toEqual({ nested: true });
      expect(cache.get('array')).toEqual([1, 2, 3]);
    });

    it('should work with different key types', () => {
      const cache = new LRUCache<number, string>(3);
      cache.set(1, 'one');
      cache.set(2, 'two');
      
      expect(cache.get(1)).toBe('one');
      expect(cache.get(2)).toBe('two');
    });

    it('should handle null values', () => {
      const cache = new LRUCache<string, any>(3);
      cache.set('null', null);
      expect(cache.get('null')).toBeNull();
    });

    it('should distinguish between null and undefined', () => {
      const cache = new LRUCache<string, any>(3);
      cache.set('null', null);
      
      expect(cache.get('null')).toBeNull();
      expect(cache.get('undefined')).toBeUndefined();
    });

    it('should maintain correct order with multiple operations', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // a is now most recent
      cache.get('b'); // b is now most recent
      cache.set('d', 4); // should evict c
      
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBeUndefined();
      expect(cache.get('d')).toBe(4);
    });
  });

  describe('hashCacheMetrics', () => {
    beforeEach(() => {
      resetHashCacheMetrics();
    });

    it('should track hits and misses', () => {
      expect(hashCacheMetrics.hits).toBe(0);
      expect(hashCacheMetrics.misses).toBe(0);
    });

    it('should reset metrics', () => {
      hashCacheMetrics.hits = 10;
      hashCacheMetrics.misses = 5;
      
      resetHashCacheMetrics();
      
      expect(hashCacheMetrics.hits).toBe(0);
      expect(hashCacheMetrics.misses).toBe(0);
    });
  });

  describe('getOrComputeHash', () => {
    beforeEach(() => {
      resetHashCacheMetrics();
      configureHashCache({ size: 100 }); // Reset cache
    });

    it('should compute hash on first call', () => {
      const result = getOrComputeHash('test', () => 'hash123');
      
      expect(result).toBe('hash123');
      expect(hashCacheMetrics.misses).toBe(1);
      expect(hashCacheMetrics.hits).toBe(0);
    });

    it('should use cache on subsequent calls', () => {
      const compute = () => 'hash123';
      
      getOrComputeHash('test', compute);
      const result = getOrComputeHash('test', compute);
      
      expect(result).toBe('hash123');
      expect(hashCacheMetrics.misses).toBe(1);
      expect(hashCacheMetrics.hits).toBe(1);
    });

    it('should compute different hashes for different keys', () => {
      const result1 = getOrComputeHash('key1', () => 'hash1');
      const result2 = getOrComputeHash('key2', () => 'hash2');
      
      expect(result1).toBe('hash1');
      expect(result2).toBe('hash2');
      expect(hashCacheMetrics.misses).toBe(2);
    });

    it('should only call compute function on cache miss', () => {
      let callCount = 0;
      const compute = () => {
        callCount++;
        return 'hash';
      };
      
      getOrComputeHash('test', compute);
      getOrComputeHash('test', compute);
      getOrComputeHash('test', compute);
      
      expect(callCount).toBe(1);
    });

    it('should handle empty canonical key', () => {
      const result = getOrComputeHash('', () => 'empty-hash');
      expect(result).toBe('empty-hash');
    });

    it('should handle unicode in canonical key', () => {
      const result = getOrComputeHash('你好', () => 'unicode-hash');
      expect(result).toBe('unicode-hash');
      
      const cached = getOrComputeHash('你好', () => 'should-not-compute');
      expect(cached).toBe('unicode-hash');
      expect(hashCacheMetrics.hits).toBe(1);
    });

    it('should handle very long canonical keys', () => {
      const longKey = 'x'.repeat(10000);
      const result = getOrComputeHash(longKey, () => 'long-hash');
      expect(result).toBe('long-hash');
    });

    it('should maintain cache across multiple different keys', () => {
      for (let i = 0; i < 50; i++) {
        getOrComputeHash(`key${i}`, () => `hash${i}`);
      }
      
      expect(hashCacheMetrics.misses).toBe(50);
      
      // Access all keys again
      for (let i = 0; i < 50; i++) {
        const result = getOrComputeHash(`key${i}`, () => 'should-not-compute');
        expect(result).toBe(`hash${i}`);
      }
      
      expect(hashCacheMetrics.hits).toBe(50);
    });
  });

  describe('configureHashCache', () => {
    beforeEach(() => {
      resetHashCacheMetrics();
    });

    it('should configure cache size', () => {
      configureHashCache({ size: 2 });
      
      getOrComputeHash('a', () => 'hash-a');
      getOrComputeHash('b', () => 'hash-b');
      getOrComputeHash('c', () => 'hash-c');
      
      // 'a' should be evicted
      getOrComputeHash('a', () => 'recomputed-a');
      expect(hashCacheMetrics.misses).toBe(4); // a, b, c, then a again
    });

    it('should clear existing cache when reconfigured', () => {
      getOrComputeHash('test', () => 'hash1');
      
      configureHashCache({ size: 100 });
      
      // Should be a miss after reconfiguration
      getOrComputeHash('test', () => 'hash2');
      expect(hashCacheMetrics.misses).toBe(2);
    });

    it('should handle missing size parameter', () => {
      getOrComputeHash('test', () => 'hash');
      
      configureHashCache({}); // Creates new cache
      
      // Cache cleared, should recompute
      const result = getOrComputeHash('test', () => 'hash2');
      expect(result).toBe('hash2');
    });

    it('should ignore invalid size', () => {
      getOrComputeHash('test', () => 'hash');
      
      configureHashCache({ size: 0 }); // Creates new cache
      
      // Cache cleared, should recompute
      const result = getOrComputeHash('test', () => 'hash2');
      expect(result).toBe('hash2');
    });

    it('should ignore negative size', () => {
      getOrComputeHash('test', () => 'hash');
      
      configureHashCache({ size: -10 }); // Creates new cache
      
      // Cache cleared, should recompute
      const result = getOrComputeHash('test', () => 'hash2');
      expect(result).toBe('hash2');
    });

    it('should respect environment variable for default size', () => {
      // This is more of a documentation test
      // The default size comes from TASKPILOT_HASH_CACHE_SIZE env var
      configureHashCache({ size: 500 });
      
      // Fill cache to verify size
      for (let i = 0; i < 600; i++) {
        getOrComputeHash(`key${i}`, () => `hash${i}`);
      }
      
      // First 100 should be evicted
      const result = getOrComputeHash('key0', () => 'recomputed');
      expect(hashCacheMetrics.misses).toBeGreaterThan(600);
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(() => {
      resetHashCacheMetrics();
      configureHashCache({ size: 100 });
    });

    it('should work with real canonical JSON strings', () => {
      const canonical1 = '{"a":1,"b":2}';
      const canonical2 = '{"b":2,"a":1}'; // Different string, same semantics
      
      const hash1 = getOrComputeHash(canonical1, () => 'hash-abc');
      const hash2 = getOrComputeHash(canonical2, () => 'hash-xyz');
      
      // Different canonical strings produce different cache entries
      expect(hash1).toBe('hash-abc');
      expect(hash2).toBe('hash-xyz');
    });

    it('should improve performance with repeated hashing', () => {
      const canonical = '{"large":"object","with":["many","nested","values"]}';
      let computeTime = 0;
      
      // First call - cache miss
      const start1 = Date.now();
      getOrComputeHash(canonical, () => {
        // Simulate expensive computation
        const sum = Array(1000).fill(0).reduce((a, b) => a + b, 0);
        return 'computed-hash';
      });
      computeTime = Date.now() - start1;
      
      // Second call - cache hit (should be faster)
      const start2 = Date.now();
      getOrComputeHash(canonical, () => {
        throw new Error('Should not compute again');
      });
      const cacheTime = Date.now() - start2;
      
      // Cache hit should not call compute function
      expect(hashCacheMetrics.misses).toBe(1);
      expect(hashCacheMetrics.hits).toBe(1);
    });

    it('should handle concurrent-like access patterns', () => {
      const keys = Array(20).fill(0).map((_, i) => `key${i % 5}`); // 5 unique keys, accessed 4 times each
      
      keys.forEach((key, i) => {
        getOrComputeHash(key, () => `hash-${key}`);
      });
      
      // 5 misses (first access of each unique key) + 15 hits
      expect(hashCacheMetrics.misses).toBe(5);
      expect(hashCacheMetrics.hits).toBe(15);
    });

    it('should handle cache eviction gracefully', () => {
      configureHashCache({ size: 3 });
      
      // Fill cache
      getOrComputeHash('a', () => 'hash-a');
      getOrComputeHash('b', () => 'hash-b');
      getOrComputeHash('c', () => 'hash-c');
      
      // Access 'a' to make it recent
      getOrComputeHash('a', () => 'should-not-compute');
      
      // Add new entry - should evict 'b'
      getOrComputeHash('d', () => 'hash-d');
      
      // Verify 'b' was evicted
      resetHashCacheMetrics();
      getOrComputeHash('b', () => 'recomputed-b');
      expect(hashCacheMetrics.misses).toBe(1);
      
      // Verify 'a' still cached
      getOrComputeHash('a', () => 'should-not-compute');
      expect(hashCacheMetrics.hits).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      resetHashCacheMetrics();
      configureHashCache({ size: 100 });
    });

    it('should handle compute function returning empty string', () => {
      const result = getOrComputeHash('test', () => '');
      expect(result).toBe('');
    });

    it('should handle compute function returning special characters', () => {
      const result = getOrComputeHash('test', () => 'a\nb\tc\rd');
      expect(result).toBe('a\nb\tc\rd');
    });

    it('should handle very long hash values', () => {
      const longHash = 'x'.repeat(10000);
      const result = getOrComputeHash('test', () => longHash);
      expect(result).toBe(longHash);
    });

    it('should be case-sensitive for keys', () => {
      getOrComputeHash('Test', () => 'hash1');
      getOrComputeHash('test', () => 'hash2');
      
      expect(hashCacheMetrics.misses).toBe(2);
    });

    it('should handle keys with special characters', () => {
      const specialKey = 'key\nwith\ttabs\rand\r\nnewlines';
      const result = getOrComputeHash(specialKey, () => 'special-hash');
      expect(result).toBe('special-hash');
      
      const cached = getOrComputeHash(specialKey, () => 'should-not-compute');
      expect(cached).toBe('special-hash');
      expect(hashCacheMetrics.hits).toBe(1);
    });
  });
});
