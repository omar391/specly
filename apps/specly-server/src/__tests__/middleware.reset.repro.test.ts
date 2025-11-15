import { expect, test } from 'vitest';
import { __test_rateLimitStore, __test_forceResetWindowForClient, rateLimit } from '../api/middleware';

test('repro: reset-window branch is reachable under coverage', async () => {
  const clientId = 'repro-client';
  const windowMs = 1000;
  const now = Date.now();

  // Ensure a pre-existing expired entry
  __test_rateLimitStore.set(clientId, { count: 5, resetTime: now - 2000 });

  // Temporarily bypass the test-environment guard in middleware
  const origNode = process.env.NODE_ENV;
  const origVitest = process.env.VITEST;
  process.env.NODE_ENV = 'development';
  process.env.VITEST = 'false';

  try {
    // Ensure the pre-populated entry is expired before invoking middleware
    const pre = __test_rateLimitStore.get(clientId)!;
    expect(pre.resetTime).toBeLessThan(now);

    // Now invoke the middleware for the same client and ensure next() is called
    const mw = rateLimit(10, windowMs);
    let nextCalled = false;
    const fakeCtx: any = {
      req: {
        header: (name: string) => (name === 'x-forwarded-for' ? clientId : undefined),
        param: () => ({})
      },
      json: () => {}
    };

    await mw(fakeCtx, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    // Middleware should have reset the window for this client
    const post = __test_rateLimitStore.get(clientId)!;
    expect(post.count).toBe(1);
    expect(post.resetTime).toBeGreaterThan(now);
  } finally {
    process.env.NODE_ENV = origNode;
    process.env.VITEST = origVitest;
  }
});
