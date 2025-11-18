// Lightweight LRU cache and helper for hashing canonical strings

type ComputeFn<V> = () => V;

export class LRUCache<K, V> {
  protected map = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Refresh recency by moving to end
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V) {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      // evict oldest
      const oldestKey = this.map.keys().next().value as K | undefined;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
  }

  clear() {
    this.map.clear();
  }
}

// Metrics (simple in-memory counters for tests/observability)
export const hashCacheMetrics = {
  hits: 0,
  misses: 0,
};

export function resetHashCacheMetrics() {
  hashCacheMetrics.hits = 0;
  hashCacheMetrics.misses = 0;
}

const DEFAULT_SIZE = Number.parseInt(process.env.SPECLY_HASH_CACHE_SIZE || "500", 10) || 500;
let cache = new LRUCache<string, string>(DEFAULT_SIZE);

export function configureHashCache(opts: { size?: number } = {}) {
  if (opts.size && opts.size > 0) {
    cache = new LRUCache<string, string>(opts.size);
  }
}

/**
 * Returns cached value for the canonical string key if present, otherwise
 * computes it using the provided function, stores it, and returns it.
 */
export function getOrComputeHash(canonicalKey: string, compute: ComputeFn<string>): string {
  const cached = cache.get(canonicalKey);
  if (cached !== undefined) {
    hashCacheMetrics.hits++;
    return cached;
  }
  hashCacheMetrics.misses++;
  const value = compute();
  cache.set(canonicalKey, value);
  return value;
}
