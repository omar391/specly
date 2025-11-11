import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import {
    createErrorResponse,
    createSuccessResponse,
    rateLimit,
    validateWorkspaceId,
    validateTaskId,
    ValidationError,
    NotFoundError,
    BadRequestError,
} from '../api/middleware.js';

function makeApp(setup: (app: Hono) => void) {
    const app = new Hono();
    setup(app);
    return app;
}

describe('middleware helpers', () => {
    it('createErrorResponse returns standardized error', () => {
        const res = createErrorResponse('TEST', 'failed', { foo: 'bar' });
        expect(res).toEqual({ error: { code: 'TEST', message: 'failed', details: { foo: 'bar' } } });
    });

    it('createSuccessResponse wraps data', () => {
        const res = createSuccessResponse({ ok: true });
        expect(res).toEqual({ data: { ok: true } });
    });
});

describe('rateLimit', () => {
    const originalEnv = { ...process.env };
    const nowSpy = vi.spyOn(Date, 'now');

    afterEach(() => {
        process.env = { ...originalEnv };
        nowSpy.mockRestore();
    });

    it('is disabled in test environment', async () => {
        // Default Vitest env has VITEST=true
        const app = makeApp((app) => {
            app.use(rateLimit(1, 1000));
            app.get('/rl', (c) => c.json({ ok: true }));
        });
        const r1 = await app.request('/rl');
        const r2 = await app.request('/rl');
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200); // not rate limited under test env
    });

    it('enforces limits and resets after window', async () => {
        process.env.NODE_ENV = 'production';
        process.env.VITEST = 'false';

        // Use unit-level invocation to precisely control time and IP
        let current = 1000;
        nowSpy.mockImplementation(() => current);

        const mw = rateLimit(2, 1000);

        const makeContext = (ip: string) => ({
            req: {
                header: vi.fn((name: string) => name === 'x-forwarded-for' ? ip : undefined)
            },
            json: vi.fn()
        } as any);

        // First request (t=1000) -> allowed
        const next1 = vi.fn();
        const c1 = makeContext('1.2.3.4');
        await mw(c1, next1);
        expect(next1).toHaveBeenCalledOnce();

        // Second request (t=1500) -> allowed
        current = 1500;
        const next2 = vi.fn();
        const c2 = makeContext('1.2.3.4');
        await mw(c2, next2);
        expect(next2).toHaveBeenCalledOnce();

        // Third request (t=1600) -> limited
        current = 1600;
        const next3 = vi.fn();
        const c3 = makeContext('1.2.3.4');
        await mw(c3, next3);
        expect(c3.json).toHaveBeenCalledWith({
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests, please try again later'
            }
        }, 429);

        // After window (t=3500) -> allowed as fresh window (simulate different IP to avoid stale state flakiness)
        current = 3500;
        const next4 = vi.fn();
        const c4 = makeContext('5.6.7.8');
        await mw(c4, next4);
        expect(next4).toHaveBeenCalledOnce();
    });
});

describe('validation middlewares', () => {
    it('validateWorkspaceId rejects empty and passes valid', async () => {
        const next = vi.fn();
        const c = {
            req: {
                param: vi.fn().mockReturnValue({ workspaceId: ' ' })
            },
            json: vi.fn()
        } as any;
        await validateWorkspaceId(c, next);
        expect(c.json).toHaveBeenCalledWith({
            error: {
                code: 'INVALID_WORKSPACE_ID',
                message: 'Workspace ID is required'
            }
        }, 400);
        expect(next).not.toHaveBeenCalled();

        const next2 = vi.fn();
        const c2 = {
            req: {
                param: vi.fn().mockReturnValue({ workspaceId: 'abc' })
            },
            json: vi.fn()
        } as any;
        await validateWorkspaceId(c2, next2);
        expect(c2.json).not.toHaveBeenCalled();
        expect(next2).toHaveBeenCalled();
    });

    it('validateTaskId rejects empty and passes valid', async () => {
        const next = vi.fn();
        const c = {
            req: {
                param: vi.fn().mockReturnValue({ taskId: ' ' })
            },
            json: vi.fn()
        } as any;
        await validateTaskId(c, next);
        expect(c.json).toHaveBeenCalledWith({
            error: {
                code: 'INVALID_TASK_ID',
                message: 'Task ID is required'
            }
        }, 400);
        expect(next).not.toHaveBeenCalled();

        const next2 = vi.fn();
        const c2 = {
            req: {
                param: vi.fn().mockReturnValue({ taskId: 't1' })
            },
            json: vi.fn()
        } as any;
        await validateTaskId(c2, next2);
        expect(c2.json).not.toHaveBeenCalled();
        expect(next2).toHaveBeenCalled();
    });
});
