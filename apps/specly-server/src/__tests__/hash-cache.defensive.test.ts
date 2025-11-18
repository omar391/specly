import { test, expect } from 'vitest';
import * as hashCache from '../utils/hash-cache.js';

test('getOrComputeHash uses compute when iterator returns undefined (defensive branch)', async () => {
    // Replace Map.prototype.keys to return an iterator whose next().value is undefined
    const originalKeys = Map.prototype.keys;
    Map.prototype.keys = function () {
        return {
            next: () => ({ done: false, value: undefined })
        } as any;
    };

    try {
        hashCache.configureHashCache({ size: 1 });
        hashCache.resetHashCacheMetrics();
        const v = hashCache.getOrComputeHash('k1', () => 'computed-value');
        expect(v).toBe('computed-value');
        expect(hashCache.hashCacheMetrics.misses).toBe(1);
        // Second call should hit cache
        const v2 = hashCache.getOrComputeHash('k1', () => 'other');
        expect(v2).toBe('computed-value');
        expect(hashCache.hashCacheMetrics.hits).toBe(1);
    } finally {
        // Restore original Map.prototype.keys
        Map.prototype.keys = originalKeys;
    }
});