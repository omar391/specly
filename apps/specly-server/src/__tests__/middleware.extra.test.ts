import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimit, validateWorkspaceId, validateTaskId, ValidationError } from '../api/middleware.js';
import { createErrorResponse, createSuccessResponse, NotFoundError, BadRequestError } from '../api/middleware.js';

describe('Middleware extra tests', () => {
  let origNodeEnv: string | undefined;
  let origVitest: string | undefined;

  beforeEach(() => {
    origNodeEnv = process.env.NODE_ENV;
    origVitest = process.env.VITEST;
    // Ensure we exercise non-test branches by default in these tests
    process.env.NODE_ENV = 'production';
    process.env.VITEST = 'false';
  });

  afterEach(() => {
    process.env.NODE_ENV = origNodeEnv;
    process.env.VITEST = origVitest;
    vi.useRealTimers();
  });

  it('rateLimit allows up to maxRequests and then blocks', async () => {
    const mw = rateLimit(2, 10000); // large window
    const next = vi.fn(async () => undefined);
    const ctx = {
      req: {
        header: (h: string) => (h === 'x-forwarded-for' ? '1.2.3.4' : undefined)
      },
      json: vi.fn()
    } as any;

    // First request -> allowed
    await mw(ctx, next);
    // Second request -> allowed
    await mw(ctx, next);
    // Third request -> should be blocked
    await mw(ctx, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(ctx.json).toHaveBeenCalled();
    const callArgs = (ctx.json as any).mock.calls[0];
    expect(callArgs[1]).toBe(429);
    expect(callArgs[0]).toHaveProperty('error');
    expect(callArgs[0].error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('rateLimit resets after window elapses', async () => {
    vi.useFakeTimers();
    const windowMs = 1000;
    const mw = rateLimit(1, windowMs);
    const next = vi.fn(async () => undefined);
    const ctx = {
      req: {
        header: (h: string) => (h === 'x-forwarded-for' ? '9.9.9.9' : undefined)
      },
      json: vi.fn()
    } as any;

    // First request -> allowed
    await mw(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Advance time beyond window and call again
    vi.setSystemTime(Date.now() + windowMs + 10);
    await mw(ctx, next);
    // Next should have been called a second time after reset
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('validateWorkspaceId rejects missing or empty workspaceId', async () => {
    const next = vi.fn(async () => undefined);
    const ctx1 = { req: { param: () => ({ workspaceId: '' }) }, json: vi.fn() } as any;
    await validateWorkspaceId(ctx1, next);
    expect(ctx1.json).toHaveBeenCalled();

    const ctx2 = { req: { param: () => ({ workspaceId: '  ' }) }, json: vi.fn() } as any;
    await validateWorkspaceId(ctx2, next);
    expect(ctx2.json).toHaveBeenCalled();

    const ctx3 = { req: { param: () => ({ workspaceId: 'ws-1' }) }, json: vi.fn() } as any;
    await validateWorkspaceId(ctx3, next);
    expect(next).toHaveBeenCalled();
  });

  it('validateTaskId rejects missing or empty taskId', async () => {
    const next = vi.fn(async () => undefined);
    const ctx1 = { req: { param: () => ({ taskId: '' }) }, json: vi.fn() } as any;
    await validateTaskId(ctx1, next);
    expect(ctx1.json).toHaveBeenCalled();

    const ctx2 = { req: { param: () => ({ taskId: 't-1' }) }, json: vi.fn() } as any;
    await validateTaskId(ctx2, next);
    expect(next).toHaveBeenCalled();
  });

  it('rateLimit is disabled in test env or when VITEST=true', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origVitest = process.env.VITEST;
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'false';
    const mw = rateLimit(1, 1000);
    const next = vi.fn(async () => undefined);
    const ctx = { req: { header: () => undefined }, json: vi.fn() } as any;
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();

    // also when VITEST=true
    process.env.NODE_ENV = 'production';
    process.env.VITEST = 'true';
    const mw2 = rateLimit(1, 1000);
    const next2 = vi.fn(async () => undefined);
    const ctx2 = { req: { header: () => undefined }, json: vi.fn() } as any;
    await mw2(ctx2, next2);
    expect(next2).toHaveBeenCalled();

    process.env.NODE_ENV = origNodeEnv;
    process.env.VITEST = origVitest;
  });

  it('rateLimit falls back to cf-connecting-ip and unknown when headers missing', async () => {
    const mw = rateLimit(2, 10000);
    const next = vi.fn(async () => undefined);
    // Use cf-connecting-ip
    const ctx = { req: { header: (h: string) => (h === 'cf-connecting-ip' ? '5.6.7.8' : undefined) }, json: vi.fn() } as any;
    await mw(ctx, next);
    expect(next).toHaveBeenCalled();

    // Use unknown when both headers missing
    const ctx2 = { req: { header: () => undefined }, json: vi.fn() } as any;
    await mw(ctx2, next);
    expect(next).toHaveBeenCalled();
  });

  it('createErrorResponse/createSuccessResponse and custom errors behave as expected', () => {
    const err = createErrorResponse('E', 'msg', { x: 1 });
    expect(err).toHaveProperty('error');
    expect(err.error.code).toBe('E');
    const ok = createSuccessResponse({ a: 1 });
    expect(ok).toHaveProperty('data');

    const ve = new ValidationError('bad');
    expect(ve.name).toBe('ValidationError');
    const nf = new NotFoundError('no');
    expect(nf.name).toBe('NotFoundError');
    const br = new BadRequestError('br');
    expect(br.name).toBe('BadRequestError');
  });
});
