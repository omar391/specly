import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { hashSpec, hashToolVersion } from '../utils/hash.js';

// Golden test ensures hash stability across commits. If this fails after intentional spec change, update fixture & document.

describe('Golden Hash Fixtures (SP-002 / SP-200)', () => {
  const fixturesDir = join(__dirname, 'fixtures');

  // Load all spec fixtures
  const fixtureFiles = readdirSync(fixturesDir).filter(f => f.startsWith('spec-') && f.endsWith('.json'));
  
  // Golden hash baselines (locked after initial computation)
  // These values establish regression guards. If a hash changes, verify it's intentional and document in SP-200.
  const GOLDEN_HASHES: Record<string, string> = {
    'spec-example.json': 'eeb78aa4958ca7bd3009c8e17bca2bd56023630b99285bc3fe56c497c1f89f13',
    'spec-unicode.json': '2e0fc2d016fce0eb03a93b92f492a904ebc2539cd95417e224880987d8dfdf9e',
    'spec-deep-nesting.json': '9f13f67f92765b273e03bcb4937b51f8a9eb9e448215f12c080e1d230e358079',
    'spec-array-ordering.json': 'b08430d1e2b7368837dbc1dd7fdd2db9138fd39f0962d7b8804c05b18d3174bf',
    'spec-special-chars.json': 'cfd5b5f7dce96405c7d6c777a79d0692ee205a96c7079890c8ed042c281f92f9',
    'spec-empty-values.json': '1efd72a75d728b13542590861ca3790c81c5039a5f0408df1d8c488b337bc600'
  };

  describe('Spec fixture stability', () => {
    fixtureFiles.forEach(file => {
      it(`should hash ${file} consistently`, () => {
        const specPath = join(fixturesDir, file);
        const specObj = JSON.parse(readFileSync(specPath, 'utf-8'));
        const { hash } = hashSpec(specObj);

        // If golden hash is placeholder, compute and display for manual update
        if (GOLDEN_HASHES[file] === 'computed-on-first-run') {
          console.log(`Golden hash for ${file}: ${hash}`);
          console.log('Update GOLDEN_HASHES in hash.golden.test.ts with this value');
        }

        // First run establishes baseline (always passes)
        // Subsequent runs verify stability
        if (GOLDEN_HASHES[file] && GOLDEN_HASHES[file] !== 'computed-on-first-run') {
          expect(hash).toEqual(GOLDEN_HASHES[file]);
        } else {
          // Record current hash for visibility
          expect(hash).toBeDefined();
          expect(hash).toHaveLength(64); // SHA-256 hex length
        }
      });
    });
  });

  describe('Edge case vectors (SP-200)', () => {
    it('unicode characters should hash consistently', () => {
      const spec1 = { name: '🚀', data: '测试' };
      const spec2 = { name: '🚀', data: '测试' };
      expect(hashSpec(spec1).hash).toEqual(hashSpec(spec2).hash);
    });

    it('key order should not affect hash (canonical ordering)', () => {
      const spec1 = { b: 2, a: 1, c: 3 };
      const spec2 = { a: 1, c: 3, b: 2 };
      expect(hashSpec(spec1).hash).toEqual(hashSpec(spec2).hash);
    });

    it('array order should affect hash (arrays not sorted)', () => {
      const spec1 = { items: [1, 2, 3] };
      const spec2 = { items: [3, 2, 1] };
      expect(hashSpec(spec1).hash).not.toEqual(hashSpec(spec2).hash);
    });

    it('empty values should hash consistently', () => {
      const spec1 = { str: '', arr: [], obj: {} };
      const spec2 = { str: '', arr: [], obj: {} };
      expect(hashSpec(spec1).hash).toEqual(hashSpec(spec2).hash);
    });

    it('special characters should be escaped properly', () => {
      const spec = { text: 'Line1\nLine2\tTab"Quote\'Single\\Back' };
      const { hash } = hashSpec(spec);
      expect(hash).toBeDefined();
      // Re-hash to verify stability
      expect(hashSpec(spec).hash).toEqual(hash);
    });
  });

  describe('Tool version hash stability (SP-200)', () => {
    it('tool version hash should vary when ordered_specs order changes', () => {
      const base = {
        ordered_specs: ['a', 'b', 'c'],
        edges: [ { from: 'a', to: 'b', priority: 1 }, { from: 'b', to: 'c', priority: 1 } ],
        version: 1
      };
      const reorder = {
        ordered_specs: ['b', 'a', 'c'], // changed order
        edges: [ { from: 'a', to: 'b', priority: 1 }, { from: 'b', to: 'c', priority: 1 } ],
        version: 1
      };
      const h1 = hashToolVersion(base).hash;
      const h2 = hashToolVersion(reorder).hash;
      expect(h1).not.toEqual(h2); // order matters for ordered_specs semantics
    });

    it('edge order should be normalized (sorted by from, to, priority)', () => {
      const base = {
        ordered_specs: ['a', 'b', 'c'],
        edges: [
          { from: 'a', to: 'b', priority: 1 },
          { from: 'b', to: 'c', priority: 1 }
        ],
        entry_spec: 'a',
        tool_name: 'test'
      };
      const reordered = {
        ordered_specs: ['a', 'b', 'c'],
        edges: [
          { from: 'b', to: 'c', priority: 1 },
          { from: 'a', to: 'b', priority: 1 }
        ], // different order
        entry_spec: 'a',
        tool_name: 'test'
      };
      const h1 = hashToolVersion(base).hash;
      const h2 = hashToolVersion(reordered).hash;
      expect(h1).toEqual(h2); // edges should be canonically sorted
    });

    it('priority values should affect hash', () => {
      const base = {
        ordered_specs: ['a', 'b'],
        edges: [ { from: 'a', to: 'b', priority: 1 } ],
        entry_spec: 'a',
        tool_name: 'test'
      };
      const different = {
        ordered_specs: ['a', 'b'],
        edges: [ { from: 'a', to: 'b', priority: 2 } ],
        entry_spec: 'a',
        tool_name: 'test'
      };
      expect(hashToolVersion(base).hash).not.toEqual(hashToolVersion(different).hash);
    });
  });
});
