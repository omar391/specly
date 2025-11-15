import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createErrorResponse,
  createSuccessResponse,
  validateWorkspaceId,
  validateTaskId,
  rateLimit,
    rateLimitStore,
  ValidationError,
  NotFoundError,
  BadRequestError
} from '../api/middleware.js';

function makeCtx(headers: Record<string, string | undefined> = {}, params: Record<string, string> = {}) {
  const jsonCalls: Array<{ payload: any; status?: number }> = [];
  return {
    req: {
      header: (name: string) => headers[name as keyof typeof headers],
      param: () => params
    },
    json: (payload: any, status?: number) => {
      jsonCalls.push({ payload, status });
      return;
    },
    _jsonCalls: jsonCalls
  } as any;
}

describe('api/middleware helpers and validators', () => {
  it('createErrorResponse returns expected shape', () => {
    const r = createErrorResponse('CODE', 'msg', { a: 1 });
    expect(r).toEqual({ error: { code: 'CODE', message: 'msg', details: { a: 1 } } });
  });

  it('createSuccessResponse wraps data', () => {
    const r = createSuccessResponse({ ok: true });
    expect(r).toEqual({ data: { ok: true } });
  });

  it('validateWorkspaceId rejects empty workspaceId', async () => {
    const ctx = makeCtx({}, { workspaceId: '' });
    const next = vi.fn(() => Promise.resolve());
    await validateWorkspaceId(ctx, next as any);
    expect(next).not.toHaveBeenCalled();
    expect(ctx._jsonCalls.length).toBeGreaterThan(0);
    expect(ctx._jsonCalls[0].status).toBe(400);
    expect(ctx._jsonCalls[0].payload).toHaveProperty('error');
  });

  it('validateWorkspaceId calls next when present', async () => {
    const ctx = makeCtx({}, { workspaceId: '  abc  ' });
    const next = vi.fn(() => Promise.resolve());
    await validateWorkspaceId(ctx, next as any);
    expect(next).toHaveBeenCalled();
  });

  it('validateTaskId rejects empty taskId', async () => {
    const ctx = makeCtx({}, { taskId: '' });
    const next = vi.fn(() => Promise.resolve());
    await validateTaskId(ctx, next as any);
    expect(next).not.toHaveBeenCalled();
    expect(ctx._jsonCalls.length).toBeGreaterThan(0);
    expect(ctx._jsonCalls[0].status).toBe(400);
    expect(ctx._jsonCalls[0].payload).toHaveProperty('error');
  });

  it('validateTaskId calls next when present', async () => {
    const ctx = makeCtx({}, { taskId: 't-1' });
    const next = vi.fn(() => Promise.resolve());
    await validateTaskId(ctx, next as any);
    expect(next).toHaveBeenCalled();
  });
});

describe('rateLimit middleware', () => {
  let origNodeEnv: string | undefined;
  let origVitest: string | undefined;

  beforeEach(() => {
    origNodeEnv = process.env.NODE_ENV;
    origVitest = process.env.VITEST;
    // default to test environment for isolation; individual tests will override
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
  });

  afterEach(() => {
    process.env.NODE_ENV = origNodeEnv;
    if (origVitest === undefined) delete process.env.VITEST; else process.env.VITEST = origVitest;
  });

  it('skips rate limiting in test environment and calls next', async () => {
    const rl = rateLimit(1, 1000);
    const ctx = makeCtx({ 'x-forwarded-for': '1.1.1.1' });
    const next = vi.fn(async () => {});
    await rl(ctx as any, next as any);
    expect(next).toHaveBeenCalled();
  });

  it('enforces rate limit when not in test env', async () => {
    // enable real rate limiting
    process.env.NODE_ENV = 'development';
    delete process.env.VITEST;

    const clientIp = `127.0.0.${Math.floor(Math.random() * 254) + 1}`;
    const rl = rateLimit(1, 100000); // allow 1 request per window
    const ctx1 = makeCtx({ 'x-forwarded-for': clientIp });
    const next1 = vi.fn(async () => {});
    await rl(ctx1 as any, next1 as any);
    expect(next1).toHaveBeenCalled();

    // second immediate request should be blocked
    const ctx2 = makeCtx({ 'x-forwarded-for': clientIp });
    const next2 = vi.fn(async () => {});
    await rl(ctx2 as any, next2 as any);
    expect(next2).not.toHaveBeenCalled();
    expect(ctx2._jsonCalls.length).toBeGreaterThan(0);
    expect(ctx2._jsonCalls[0].status).toBe(429);
    expect(ctx2._jsonCalls[0].payload).toHaveProperty('error');
  });

  it('resets rate limit window after expiry and calls next again', async () => {
    // enable real rate limiting
    process.env.NODE_ENV = 'development';
    delete process.env.VITEST;

    // use fake timers to simulate expiry
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    const clientIp = `127.0.0.200`;
    const rl = rateLimit(1, 1000); // allow 1 request per 1s

    const ctx1 = makeCtx({ 'x-forwarded-for': clientIp });
    const next1 = vi.fn(async () => {});
    await rl(ctx1 as any, next1 as any);
    expect(next1).toHaveBeenCalled();

    // advance time beyond the window
    vi.setSystemTime(start + 1500);

    const ctx2 = makeCtx({ 'x-forwarded-for': clientIp });
    const next2 = vi.fn(async () => {});
    await rl(ctx2 as any, next2 as any);
    // because window expired, the request should be allowed
    expect(next2).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('hits reset-window branch when client entry is expired (pre-populated)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VITEST;

    const clientIp = '10.10.10.10';
    // pre-populate an expired entry for this client
      rateLimitStore.set(clientIp, { count: 2, resetTime: Date.now() - 1000 });

    // call the exported helper directly to explicitly exercise reset-window logic
    // import from module directly
    // @ts-ignore
      const { forceResetWindowForClient } = await import('../api/middleware.js');
    // ensure helper resets and returns true (we set an expired entry above)
      expect(forceResetWindowForClient(clientIp, Date.now(), 1000)).toBe(true);

    const rl = rateLimit(5, 1000);
    const ctx = makeCtx({ 'x-forwarded-for': clientIp });
    const next = vi.fn(async () => {});
    await rl(ctx as any, next as any);

    // After helper/reset, the middleware should allow the request and call next
    expect(next).toHaveBeenCalled();
  });

  it('cleans up expired entries from the internal rateLimitStore', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VITEST;

    // insert an expired entry
      rateLimitStore.set('9.9.9.9', { count: 1, resetTime: Date.now() - 1000 });

    const rl = rateLimit(1, 1000);
    const ctx = makeCtx({ 'x-forwarded-for': '1.1.1.2' });
    const next = vi.fn(async () => {});
    await rl(ctx as any, next as any);

    // expired key should be removed by cleanup loop
      expect(rateLimitStore.has('9.9.9.9')).toBe(false);
  });
});

describe('custom error classes', () => {
  it('ValidationError has proper name', () => {
    const e = new ValidationError('x');
    expect(e.name).toBe('ValidationError');
  });

  it('NotFoundError has proper name', () => {
    const e = new NotFoundError('y');
    expect(e.name).toBe('NotFoundError');
  });

  it('BadRequestError has proper name', () => {
    const e = new BadRequestError('z');
    expect(e.name).toBe('BadRequestError');
  });
});
