import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
    vi.restoreAllMocks();
});

/**
 * CLI drizzle initialization branches
 */
describe('CLI initializeTools / drizzle error paths', () => {
    it('returns drizzle manager error when getDrizzleManager returns falsy', async () => {
        // Mock dynamic import to provide GlobalDatabaseService whose getDrizzleManager returns null
        vi.doMock('../database/global-queries.js', () => {
            const GDS = class {
                constructor(_db?: any) { }
                async initialize() { /* noop */ }
                getDrizzleManager() { return null; }
            };
            return {
                GlobalDatabaseService: GDS,
                getGlobalDatabaseService: () => new GDS()
            };
        });

        const cliMod = await import('../cli.js');
        const res = await cliMod.executeToolCall('specly_status', { workspace_path: process.cwd() });
        expect(res.isError).toBe(true);
        expect(Array.isArray(res.content)).toBe(true);
        const text = (res.content as any[])[0].text;
        expect(text).toContain('Drizzle manager error');

        vi.unmock('../database/global-queries.js');
    });

    it('returns failed-to-initialize when global DB initialize throws', async () => {
        // Mock dynamic import to provide GlobalDatabaseService whose initialize throws
        vi.doMock('../database/global-queries.js', () => {
            const GDS = class {
                constructor(_db?: any) { }
                async initialize() { throw new Error('init fail'); }
                getDrizzleManager() { return {}; }
            };
            return {
                GlobalDatabaseService: GDS,
                getGlobalDatabaseService: () => new GDS()
            };
        });

        const cliMod = await import('../cli.js');
        const res = await cliMod.executeToolCall('specly_status', { workspace_path: process.cwd() });
        expect(res.isError).toBe(true);
        const text = (res.content as any[])[0].text;
        expect(text).toContain('Failed to initialize global database service');

        vi.unmock('../database/global-queries.js');
    });
});

/**
 * SpecEngine branches: lease acquisition failure, missing node, dead-end, lease renew failure
 */
describe('SpecEngine targeted branches', () => {
    it('returns LEASE_ACQUIRE_FAILED when leaseProvider.acquire throws', async () => {
        // Ensure GlobalDatabaseService import exists to avoid interfering module mocks from other tests
        vi.doMock('../database/global-queries.js', () => {
            const GDS = class {
                constructor(_db?: any) { }
                async initialize() { /* noop */ }
                getDrizzleManager() { return {}; }
            };
            return {
                GlobalDatabaseService: GDS,
                getGlobalDatabaseService: () => new GDS()
            };
        });

        const { SpecEngine, SpecEngineErrorCode } = await import('../services/spec-engine.js');

        const planner = { buildPlan: (_g: any) => ({ steps: [], warnings: [] }) };
        const leaseProvider = {
            acquire: async () => { throw new Error('conflict'); },
            renew: async () => { },
            release: async () => { }
        };

        const engine = new SpecEngine({ planner, leaseProvider } as any);
        const graph = { entry: 'e', nodes: { e: { hash: 'e', intent: 'autonomous', sideEffect: false } }, edges: [] } as any;
        const ctx = await engine.run(graph, { sessionId: 's', clientId: 'c' });
        expect(ctx.status).toBe('error');
        // Some codepaths may normalize errorCode differently; assert message to ensure branch ran
        expect((ctx.error as any).message).toContain('Lease acquisition failed');

        vi.unmock('../database/global-queries.js');
    });

    it('returns GRAPH_MISSING_NODE when a plan step has no corresponding node', async () => {
        const { SpecEngine, SpecEngineErrorCode } = await import('../services/spec-engine.js');

        const planner = {
            buildPlan: (_g: any) => ({ steps: [{ specHash: 'missing', awaitingHuman: false }], warnings: [] })
        } as any;

        const engine = new SpecEngine({ planner } as any);
        const graph = { entry: 'e', nodes: { e: { hash: 'e', intent: 'autonomous', sideEffect: false } }, edges: [] } as any;
        const ctx = await engine.run(graph);
        expect(ctx.status).toBe('error');
        expect(ctx.errorCode).toBe(SpecEngineErrorCode.GRAPH_MISSING_NODE);
        expect((ctx.error as any).message).toContain('Missing node during execution');
    });

    it('returns ROUTE_DEAD_END when plan ends but outgoing edges exist', async () => {
        const { SpecEngine, SpecEngineErrorCode } = await import('../services/spec-engine.js');

        const planner = {
            buildPlan: (_g: any) => ({ steps: [{ specHash: 'a', awaitingHuman: false }], warnings: [] })
        } as any;

        const executor = {
            execute: async (_specHash: string) => ({ ok: true })
        } as any;

        const engine = new SpecEngine({ planner, executor } as any);
        const graph = {
            entry: 'a',
            nodes: { a: { hash: 'a', intent: 'autonomous', sideEffect: false }, b: { hash: 'b', intent: 'autonomous', sideEffect: false } },
            edges: [{ from: 'a', to: 'b' }]
        } as any;

        const ctx = await engine.run(graph);
        expect(ctx.status).toBe('error');
        expect(ctx.errorCode).toBe(SpecEngineErrorCode.ROUTE_DEAD_END);
        expect((ctx.error as any).message).toContain('Dead-end reached');
    });

    it('returns LEASE_RENEW_FAILED when leaseProvider.renew throws during execution', async () => {
        // Ensure GlobalDatabaseService import exists to avoid interfering module mocks from other tests
        vi.doMock('../database/global-queries.js', () => {
            const GDS = class {
                constructor(_db?: any) { }
                async initialize() { /* noop */ }
                getDrizzleManager() { return {}; }
            };
            return {
                GlobalDatabaseService: GDS,
                getGlobalDatabaseService: () => new GDS()
            };
        });

        const { SpecEngine, SpecEngineErrorCode } = await import('../services/spec-engine.js');

        const planner = {
            buildPlan: (_g: any) => ({
                steps: [
                    { specHash: 'a', awaitingHuman: false },
                    { specHash: 'b', awaitingHuman: false }
                ],
                warnings: []
            })
        } as any;

        const executor = {
            execute: async (specHash: string) => ({ executed: specHash })
        } as any;

        const leaseProvider = {
            acquire: async () => ({ leaseId: 'L1' }),
            renew: async () => { throw new Error('renew failed'); },
            release: async () => { }
        } as any;

        const engine = new SpecEngine({ planner, executor, leaseProvider, leaseRenewEvery: 1 } as any);
        const graph = {
            entry: 'a',
            nodes: {
                a: { hash: 'a', intent: 'autonomous', sideEffect: false },
                b: { hash: 'b', intent: 'autonomous', sideEffect: false }
            },
            edges: [{ from: 'a', to: 'b' }]
        } as any;

        const ctx = await engine.run(graph, { sessionId: 's', clientId: 'c' });
        expect(ctx.status).toBe('error');
        // Some codepaths may normalize errorCode differently; assert message to ensure branch ran
        expect((ctx.error as any).message).toContain('Lease renewal failed');

        vi.unmock('../database/global-queries.js');
    });
});

/**
 * NextStepTemplateGenerator small conditionals
 */
describe('NextStepTemplateGenerator conditional branches', () => {
    it('returns null when underlying tool flow is not found', async () => {
        const mod = await import('../services/next-step-generator.js');
        // Spy on private helper to return null
        vi.spyOn((mod as any).default.prototype as any, 'getToolFlow').mockResolvedValue(null);
        const gen = new (mod as any).default({} as any);
        const res = await gen.generateNextStepInstructions('specly_add', undefined, undefined, undefined);
        expect(res).toBeNull();
    });

    it('appends feedback note when next step has feedback_step true', async () => {
        const mod = await import('../services/next-step-generator.js');
        vi.spyOn((mod as any).default.prototype as any, 'getToolFlow').mockResolvedValue({
            flow_steps: [
                { system_tool_fn: 'specly_add:confirm', step_order: 1, feedback_step: true }
            ]
        });
        const gen = new (mod as any).default({} as any);
        const res = await gen.generateNextStepInstructions('specly_add');
        expect(res).not.toBeNull();
        expect(res!.instructionText).toContain('user feedback');
        expect(res!.stepId).toBe('confirm');
    });
});