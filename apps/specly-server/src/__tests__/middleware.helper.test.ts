import { expect, test } from 'vitest';
import { rateLimitStore, forceResetWindowForClient } from '../api/middleware';

test('forceResetWindowForClient returns true when entry expired and false otherwise', () => {
    const clientId = 'helper-client';
    const now = Date.now();
    const windowMs = 5000;

    // absent entry -> helper returns false
    rateLimitStore.delete(clientId);
    expect(forceResetWindowForClient(clientId, now, windowMs)).toBe(false);

    // expired entry -> helper returns true and resets entry
    rateLimitStore.set(clientId, { count: 2, resetTime: now - 1000 });
    const didReset = forceResetWindowForClient(clientId, now, windowMs);
    expect(didReset).toBe(true);
    const post = rateLimitStore.get(clientId)!;
    expect(post.count).toBe(1);
    expect(post.resetTime).toBeGreaterThan(now);

    // non-expired entry -> helper returns false
    rateLimitStore.set(clientId, { count: 3, resetTime: now + 10000 });
    expect(forceResetWindowForClient(clientId, now, windowMs)).toBe(false);
});
