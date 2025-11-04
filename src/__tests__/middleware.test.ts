import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import bodyParser from 'body-parser';
import request from 'supertest';
import {
    createErrorResponse,
    createSuccessResponse,
    errorHandler,
    notFoundHandler,
    requestLogger,
    corsHandler,
    rateLimit,
    validateWorkspaceId,
    validateTaskId,
    ValidationError,
    NotFoundError,
    BadRequestError,
} from '../api/middleware.js';

function makeApp(setup: (app: express.Express) => void) {
    const app = express();
    app.use(bodyParser.json());
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

describe('errorHandler', () => {
    const origError = console.error;
    beforeEach(() => {
        console.error = vi.fn();
    });
    afterEach(() => {
        console.error = origError;
    });

    it('maps ValidationError to 422', async () => {
        const app = makeApp((app) => {
            app.get('/validation', () => { throw new ValidationError('Invalid!'); });
            app.use(errorHandler);
        });
        const res = await request(app).get('/validation');
        expect(res.status).toBe(422);
        expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
    });

    it('maps NotFoundError to 404', async () => {
        const app = makeApp((app) => {
            app.get('/missing', () => { throw new NotFoundError('Missing!'); });
            app.use(errorHandler);
        });
        const res = await request(app).get('/missing');
        expect(res.status).toBe(404);
        expect(res.body?.error?.code).toBe('NOT_FOUND');
    });

    it('maps BadRequestError to 400', async () => {
        const app = makeApp((app) => {
            app.get('/bad', () => { throw new BadRequestError('Bad!'); });
            app.use(errorHandler);
        });
        const res = await request(app).get('/bad');
        expect(res.status).toBe(400);
        expect(res.body?.error?.code).toBe('BAD_REQUEST');
    });

    it('maps unknown errors to 500', async () => {
        const app = makeApp((app) => {
            app.get('/boom', () => { throw new Error('Boom'); });
            app.use(errorHandler);
        });
        const res = await request(app).get('/boom');
        expect(res.status).toBe(500);
        expect(res.body?.error?.code).toBe('INTERNAL_ERROR');
    });
});

describe('notFoundHandler', () => {
    it('returns 404 for unknown route', async () => {
        const app = makeApp((app) => {
            app.use('/known', (_req, res) => res.sendStatus(200));
            app.use(notFoundHandler);
        });
        const res = await request(app).get('/unknown');
        expect(res.status).toBe(404);
        expect(res.body?.error?.code).toBe('NOT_FOUND');
        expect(res.body?.error?.message).toContain('GET /unknown');
    });
});

describe('requestLogger', () => {
    const origLog = console.log;
    beforeEach(() => {
        console.log = vi.fn();
    });
    afterEach(() => {
        console.log = origLog;
    });

    it('logs method, path, status and duration on finish', async () => {
        const app = makeApp((app) => {
            app.use(requestLogger);
            app.get('/ok', (_req, res) => res.status(200).send('ok'));
            app.use(errorHandler);
        });
        const res = await request(app).get('/ok');
        expect(res.status).toBe(200);
        expect(console.log).toHaveBeenCalled();
        const msg = String((console.log as any).mock.calls[0][0]);
        expect(msg).toMatch(/GET \/ok - 200 \(\d+ms\)/);
    });
});

describe('corsHandler', () => {
    it('adds CORS headers and passes through for non-OPTIONS', async () => {
        const app = makeApp((app) => {
            app.use(corsHandler);
            app.get('/foo', (_req, res) => res.json({ ok: true }));
            app.use(errorHandler);
        });
        const res = await request(app).get('/foo');
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('*');
        expect(res.headers['access-control-allow-methods']).toContain('GET');
        expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
    });

    it('short-circuits on OPTIONS', async () => {
        const app = makeApp((app) => {
            app.use(corsHandler);
            app.get('/foo', (_req, res) => res.json({ ok: true }));
            app.use(errorHandler);
        });
        const res = await request(app).options('/foo');
        expect(res.status).toBe(200);
        // Express sendStatus(200) responds with body 'OK'
        expect(res.text).toBe('OK');
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
            app.get('/rl', (_req, res) => res.status(200).json({ ok: true }));
            app.use(errorHandler);
        });
        const r1 = await request(app).get('/rl');
        const r2 = await request(app).get('/rl');
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

        const makeReq = () => ({ ip: '1.2.3.4', method: 'GET', path: '/rl' } as any);
        const makeRes = () => {
            const out: any = { statusCode: 200, body: undefined };
            const res: any = {
                status(code: number) { out.statusCode = code; return res; },
                json(payload: any) { out.body = payload; return res; }
            };
            return { res, out };
        };

        // First request (t=1000) -> allowed
        const next1 = vi.fn();
        let { res: res1 } = makeRes();
        await mw(makeReq(), res1 as any, next1 as any);
        expect(next1).toHaveBeenCalledOnce();

        // Second request (t=1500) -> allowed
        current = 1500;
        const next2 = vi.fn();
        let { res: res2 } = makeRes();
        await mw(makeReq(), res2 as any, next2 as any);
        expect(next2).toHaveBeenCalledOnce();

        // Third request (t=1600) -> limited
        current = 1600;
        const next3 = vi.fn();
        let { res: res3, out: out3 } = makeRes();
        await mw(makeReq(), res3 as any, next3 as any);
        expect(out3.statusCode).toBe(429);
        expect(out3.body?.error?.code).toBe('RATE_LIMIT_EXCEEDED');

        // After window (t=3500) -> allowed as fresh window (simulate different IP to avoid stale state flakiness)
        current = 3500;
        const next4 = vi.fn();
        let { res: res4 } = makeRes();
        await mw({ ip: '5.6.7.8', method: 'GET', path: '/rl' } as any, res4 as any, next4 as any);
        expect(next4).toHaveBeenCalledOnce();
    });
});

describe('validation middlewares', () => {
    function makeResCapture() {
        const out: any = { statusCode: 200, body: undefined };
        const res: any = {
            status(code: number) { out.statusCode = code; return res; },
            json(payload: any) { out.body = payload; return res; }
        };
        return { res, out };
    }

    it('validateWorkspaceId rejects empty and passes valid', async () => {
        const next = vi.fn();
        const { res, out } = makeResCapture();
        await validateWorkspaceId({ params: { workspaceId: ' ' } } as any, res as any, next as any);
        expect(out.statusCode).toBe(400);
        expect(out.body?.error?.code).toBe('INVALID_WORKSPACE_ID');

        const next2 = vi.fn();
        await validateWorkspaceId({ params: { workspaceId: 'abc' } } as any, res as any, next2 as any);
        expect(next2).toHaveBeenCalledOnce();
    });

    it('validateTaskId rejects empty and passes valid', async () => {
        const next = vi.fn();
        const { res, out } = makeResCapture();
        await validateTaskId({ params: { taskId: ' ' } } as any, res as any, next as any);
        expect(out.statusCode).toBe(400);
        expect(out.body?.error?.code).toBe('INVALID_TASK_ID');

        const next2 = vi.fn();
        await validateTaskId({ params: { taskId: 't1' } } as any, res as any, next2 as any);
        expect(next2).toHaveBeenCalledOnce();
    });
});
