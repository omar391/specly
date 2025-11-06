/**
 * Tests for Hash Utilities
 * 
 * Tests canonical JSON stringification, SHA256 hashing, and stable hash functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { canonicalStringify, sha256, hashSpec, hashToolVersion, stableHash } from '../utils/hash.js';
import { resetHashCacheMetrics, hashCacheMetrics } from '../utils/hash-cache.js';

describe('Hash Utilities', () => {
  beforeEach(() => {
    resetHashCacheMetrics();
  });

  describe('canonicalStringify', () => {
    it('should stringify primitives', () => {
      expect(canonicalStringify(null)).toBe('null');
      expect(canonicalStringify(true)).toBe('true');
      expect(canonicalStringify(false)).toBe('false');
      expect(canonicalStringify(42)).toBe('42');
      expect(canonicalStringify('hello')).toBe('"hello"');
    });

    it('should stringify arrays preserving order', () => {
      const arr = [1, 2, 3];
      expect(canonicalStringify(arr)).toBe('[1,2,3]');
    });

    it('should stringify nested arrays', () => {
      const nested = [[1, 2], [3, 4]];
      expect(canonicalStringify(nested)).toBe('[[1,2],[3,4]]');
    });

    it('should stringify objects with sorted keys', () => {
      const obj = { z: 3, a: 1, m: 2 };
      expect(canonicalStringify(obj)).toBe('{"a":1,"m":2,"z":3}');
    });

    it('should stringify nested objects with sorted keys', () => {
      const nested = { outer: { z: 1, a: 2 }, first: 'value' };
      expect(canonicalStringify(nested)).toBe('{"first":"value","outer":{"a":2,"z":1}}');
    });

    it('should produce same output for equivalent objects regardless of key order', () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { c: 3, a: 1, b: 2 };
      expect(canonicalStringify(obj1)).toBe(canonicalStringify(obj2));
    });

    it('should handle empty objects', () => {
      expect(canonicalStringify({})).toBe('{}');
    });

    it('should handle empty arrays', () => {
      expect(canonicalStringify([])).toBe('[]');
    });

    it('should handle mixed types', () => {
      const mixed = {
        str: 'hello',
        num: 42,
        bool: true,
        nil: null,
        arr: [1, 2, 3],
        obj: { nested: 'value' }
      };
      const result = canonicalStringify(mixed);
      expect(result).toContain('"str":"hello"');
      expect(result).toContain('"num":42');
      expect(result).toContain('"bool":true');
      expect(result).toContain('"nil":null');
    });

    it('should distinguish between null and undefined', () => {
      expect(canonicalStringify(null)).not.toBe(canonicalStringify(undefined));
    });

    it('should handle unicode strings', () => {
      const unicode = { text: '你好世界 🌍' };
      const result = canonicalStringify(unicode);
      expect(result).toContain('你好世界 🌍');
    });

    it('should handle special characters', () => {
      const special = { quote: '"', newline: '\n', tab: '\t' };
      const result = canonicalStringify(special);
      expect(result).toContain('\\"');
      expect(result).toContain('\\n');
      expect(result).toContain('\\t');
    });

    it('should produce consistent output across multiple calls', () => {
      const obj = { z: [3, 2, 1], a: { nested: true }, m: 'middle' };
      const result1 = canonicalStringify(obj);
      const result2 = canonicalStringify(obj);
      expect(result1).toBe(result2);
    });

    it('should handle deeply nested structures', () => {
      const deep = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep'
              }
            }
          }
        }
      };
      const result = canonicalStringify(deep);
      expect(result).toContain('"value":"deep"');
    });
  });

  describe('sha256', () => {
    it('should produce 64-character hex hash', () => {
      const hash = sha256('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hash for same input', () => {
      const hash1 = sha256('hello');
      const hash2 = sha256('hello');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = sha256('hello');
      const hash2 = sha256('world');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = sha256('');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle unicode', () => {
      const hash = sha256('你好世界');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce known hash for known input', () => {
      // SHA256 of 'test' is well-known
      const hash = sha256('test');
      expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });

    it('should be case-sensitive', () => {
      const hash1 = sha256('Test');
      const hash2 = sha256('test');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashSpec', () => {
    it('should return hash and canonical form', () => {
      const spec = { name: 'test', value: 42 };
      const result = hashSpec(spec);
      
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('canonical');
      expect(result.hash).toHaveLength(64);
      expect(result.canonical).toBe('{"name":"test","value":42}');
    });

    it('should produce same hash for equivalent specs', () => {
      const spec1 = { b: 2, a: 1 };
      const spec2 = { a: 1, b: 2 };
      const result1 = hashSpec(spec1);
      const result2 = hashSpec(spec2);
      
      expect(result1.hash).toBe(result2.hash);
      expect(result1.canonical).toBe(result2.canonical);
    });

    it('should use cache on repeated calls', () => {
      const spec = { name: 'test' };
      
      hashSpec(spec);
      expect(hashCacheMetrics.misses).toBe(1);
      expect(hashCacheMetrics.hits).toBe(0);
      
      hashSpec(spec);
      expect(hashCacheMetrics.misses).toBe(1);
      expect(hashCacheMetrics.hits).toBe(1);
    });

    it('should handle complex spec objects', () => {
      const spec = {
        executor_type: 'function',
        content_template: 'code here',
        input_schema: { type: 'object', properties: {} },
        output_schema: { type: 'string' },
        metadata: { version: '1.0' }
      };
      const result = hashSpec(spec);
      expect(result.hash).toHaveLength(64);
      expect(result.canonical).toContain('executor_type');
    });

    it('should handle null values', () => {
      const spec = { value: null };
      const result = hashSpec(spec);
      expect(result.canonical).toContain('null');
    });

    it('should handle arrays in specs', () => {
      const spec = { items: [1, 2, 3], tags: ['a', 'b'] };
      const result = hashSpec(spec);
      expect(result.canonical).toContain('[1,2,3]');
    });
  });

  describe('hashToolVersion', () => {
    it('should return hash and canonical form', () => {
      const input = {
        ordered_specs: ['spec1', 'spec2'],
        edges: [{ from: 'spec1', to: 'spec2', priority: 1 }]
      };
      const result = hashToolVersion(input);
      
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('canonical');
      expect(result.hash).toHaveLength(64);
    });

    it('should sort edges deterministically', () => {
      const input1 = {
        ordered_specs: ['a', 'b', 'c'],
        edges: [
          { from: 'b', to: 'c', priority: 2 },
          { from: 'a', to: 'b', priority: 1 }
        ]
      };
      const input2 = {
        ordered_specs: ['a', 'b', 'c'],
        edges: [
          { from: 'a', to: 'b', priority: 1 },
          { from: 'b', to: 'c', priority: 2 }
        ]
      };
      
      const result1 = hashToolVersion(input1);
      const result2 = hashToolVersion(input2);
      
      expect(result1.hash).toBe(result2.hash);
    });

    it('should preserve ordered_specs order', () => {
      const input = {
        ordered_specs: ['z', 'a', 'm'],
        edges: []
      };
      const result = hashToolVersion(input);
      expect(result.canonical).toContain('["z","a","m"]');
    });

    it('should handle missing priority', () => {
      const input = {
        ordered_specs: ['a', 'b'],
        edges: [{ from: 'a', to: 'b' }]
      };
      
      const result = hashToolVersion(input);
      expect(result.hash).toHaveLength(64);
      // Priority defaults to 0 in sorting logic
    });

    it('should include extra properties', () => {
      const input = {
        ordered_specs: ['a'],
        edges: [],
        version: '1.0',
        metadata: { author: 'test' }
      };
      const result = hashToolVersion(input);
      expect(result.canonical).toContain('version');
      expect(result.canonical).toContain('metadata');
    });

    it('should sort edges deterministically', () => {
      const input = {
        ordered_specs: ['a', 'b', 'c', 'd'],
        edges: [
          { from: 'c', to: 'd', priority: 5 },
          { from: 'a', to: 'b', priority: 1 },
          { from: 'a', to: 'c', priority: 2 }
        ]
      };
      const result = hashToolVersion(input);
      
      // Just verify it produces a consistent hash
      expect(result.hash).toHaveLength(64);
      expect(result.canonical).toContain('edges');
      
      // Same input should produce same hash
      const result2 = hashToolVersion(input);
      expect(result2.hash).toBe(result.hash);
    });

    it('should use cache on repeated calls', () => {
      const input = {
        ordered_specs: ['a', 'b'],
        edges: [{ from: 'a', to: 'b' }]
      };
      
      const result1 = hashToolVersion(input);
      const initialMisses = hashCacheMetrics.misses;
      
      const result2 = hashToolVersion(input);
      
      // Should get cache hit on second call
      expect(result2.hash).toBe(result1.hash);
      expect(hashCacheMetrics.hits).toBeGreaterThan(0);
    });
  });

  describe('stableHash', () => {
    it('should produce 64-character hex hash', () => {
      const hash = stableHash({ test: 'value' });
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce same hash for equivalent objects', () => {
      const hash1 = stableHash({ b: 2, a: 1 });
      const hash2 = stableHash({ a: 1, b: 2 });
      expect(hash1).toBe(hash2);
    });

    it('should handle primitives', () => {
      expect(stableHash(42)).toHaveLength(64);
      expect(stableHash('test')).toHaveLength(64);
      expect(stableHash(true)).toHaveLength(64);
      expect(stableHash(null)).toHaveLength(64);
    });

    it('should handle arrays', () => {
      const hash = stableHash([1, 2, 3]);
      expect(hash).toHaveLength(64);
    });

    it('should handle nested structures', () => {
      const complex = {
        users: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 }
        ],
        metadata: { version: 2 }
      };
      const hash = stableHash(complex);
      expect(hash).toHaveLength(64);
    });

    it('should use cache', () => {
      const obj = { cached: true };
      
      resetHashCacheMetrics();
      stableHash(obj);
      expect(hashCacheMetrics.misses).toBe(1);
      
      stableHash(obj);
      expect(hashCacheMetrics.hits).toBe(1);
    });

    it('should produce different hashes for different objects', () => {
      const hash1 = stableHash({ value: 1 });
      const hash2 = stableHash({ value: 2 });
      expect(hash1).not.toBe(hash2);
    });

    it('should be consistent across calls', () => {
      const obj = { consistent: 'hash' };
      const hash1 = stableHash(obj);
      const hash2 = stableHash(obj);
      const hash3 = stableHash(obj);
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });

  describe('Integration Scenarios', () => {
    it('should produce different hashes for semantically different specs', () => {
      const spec1 = { name: 'spec1', version: 1 };
      const spec2 = { name: 'spec1', version: 2 };
      
      const hash1 = hashSpec(spec1);
      const hash2 = hashSpec(spec2);
      
      expect(hash1.hash).not.toBe(hash2.hash);
    });

    it('should handle large objects', () => {
      const large = {
        data: Array(1000).fill(0).map((_, i) => ({ id: i, value: `item${i}` }))
      };
      const hash = stableHash(large);
      expect(hash).toHaveLength(64);
    });

    it('should handle deeply nested objects', () => {
      let deep: any = { value: 'leaf' };
      for (let i = 0; i < 50; i++) {
        deep = { nested: deep };
      }
      const hash = stableHash(deep);
      expect(hash).toHaveLength(64);
    });

    it('should work with real tool version data', () => {
      const toolVersion = {
        ordered_specs: ['init', 'validate', 'process', 'cleanup'],
        edges: [
          { from: 'init', to: 'validate', priority: 1 },
          { from: 'validate', to: 'process', priority: 2 },
          { from: 'process', to: 'cleanup', priority: 3 }
        ],
        entry_spec: 'init',
        version: '1.0.0',
        created_at: '2024-01-01'
      };
      
      const result = hashToolVersion(toolVersion);
      expect(result.hash).toHaveLength(64);
      expect(result.canonical).toContain('init');
    });
  });
});
