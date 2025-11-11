import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('index.ts additional coverage', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('SPECLY_VERSION is a non-empty string', async () => {
        const mod = await import('../index.js');
        expect(typeof mod.SPECLY_VERSION).toBe('string');
        expect(mod.SPECLY_VERSION.length).toBeGreaterThan(0);
    });

    it('SPECLY_VERSION falls back when read fails', async () => {
        vi.mock('fs', () => ({
            readFileSync: () => { throw new Error('enoent'); },
        }));

        const mod = await import('../index.js');
        expect(mod.SPECLY_VERSION).toBe('0.1.0');
    });

    it('getGlobalDbService throws if server not initialized', async () => {
        // Import without mocking fs here
        const mod = await import('../index.js');
        const { SpeclyServer } = mod as any;
        const s = new SpeclyServer();
        expect(() => s.getGlobalDbService()).toThrow('Server not initialized');
    });

    it('configureSpeclyApp onError maps Validation/NotFound/BadRequest', async () => {
        const mod = await import('../index.js');
        const { SpeclyServer } = mod as any;
        const s = new SpeclyServer();

        // Capture handler set by onError
        let registeredHandler: any = null;
        const fakeApp: any = {
            onError: (fn: any) => { registeredHandler = fn; }
        };

        await s.configureSpeclyApp(fakeApp, { local: false });
        expect(typeof registeredHandler).toBe('function');

        // Mock context.json to capture response
        const jsonCalls: any[] = [];
        const fakeCtx = { json: (body: any, status: number) => { jsonCalls.push({ body, status }); return { body, status }; } } as any;

        // ValidationError
        await registeredHandler.call(null, Object.assign(new Error('bad'), { name: 'ValidationError', message: 'x' }), fakeCtx);
        expect(jsonCalls.pop()).toMatchObject({ status: 422 });

        // NotFoundError
        await registeredHandler.call(null, Object.assign(new Error('nope'), { name: 'NotFoundError', message: 'no' }), fakeCtx);
        expect(jsonCalls.pop()).toMatchObject({ status: 404 });

        // BadRequestError
        await registeredHandler.call(null, Object.assign(new Error('badreq'), { name: 'BadRequestError', message: 'br' }), fakeCtx);
        expect(jsonCalls.pop()).toMatchObject({ status: 400 });

        // Generic error
        await registeredHandler.call(null, new Error('boom'), fakeCtx);
        expect(jsonCalls.pop()).toMatchObject({ status: 500 });
    });
});
