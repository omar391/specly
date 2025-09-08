# Next Steps (as of 2025-09-08)

Focus: SP-002 Hashing & Canonicalization Optimization (single-task focus per instructions)

1. Implement in-memory LRU cache (~500 entries)
   - New utility (e.g., `src/utils/hash-cache.ts`) wrapping stable hash functions; bounded size with simple eviction.

2. Wire cache into hot paths
   - Integrate with `hashSpec`/`hashToolVersion` usage in repositories/services where repeated hashing occurs.

3. Add tests and micro-benchmark
   - Unit tests: hit/miss behavior and determinism unchanged; add a tiny benchmark script to compare cached vs uncached.

4. Observability (optional but small)
   - Add counters (hash_cache_hits/misses) to the in-memory metrics collector; assert basic increments in one test.

5. Docs and flags
   - Note cache behavior in README/architecture if needed; add env knob for cache size with safe default.
