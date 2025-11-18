import { describe, it, expect, vi, afterEach } from 'vitest';

/* Mock sqlite3 native bindings to keep tests hermetic (prevents native load errors).
   Provide a default export shape to satisfy the module default import used in production code. */
vi.mock('sqlite3', () => ({
    default: {
        verbose: () => { },
        Database: class {
            constructor() { }
            close() { }
        }
    }
}));

import { executeToolCall, runCli } from '../cli.js';
import { DatabaseManager } from '../database/connection.js';
import { SpecEngine, SpecEngineErrorCode } from '../services/spec-engine.js';
import * as graphValidate from '../utils/graph-validate.js';
import NextStepTemplateGenerator from '../services/next-step-generator.js';

// Tiny local helper to avoid touching real drizzle manager in tests
function createFakeDrizzleManager() {
    return {
        initialize: async () => { },
        getDb: () => ({}),
        getSqlite: () => ({})
    };
}

describe('coverage finalize helpers', () => {
    afterEach(() => {
        // Restore all mocks to avoid cross-test leakage
        vi.restoreAllMocks();
    });

    it('cli: initializeTools handles invalid/absent drizzle manager', async () => {
        // Mocking getTestDatabaseInstances to avoid touching real DB/test fixtures
        vi.mock('../test-utils/database-test-helpers.js', () => ({ getTestDatabaseInstances: () => ({ isInitialized: false, drizzleManager: null, dbService: null }) }));
        // Mocking GlobalDatabaseService to return invalid drizzle manager; avoids real DB initialization
        vi.mock('../database/global-queries.js', () => ({ GlobalDatabaseService: class { async initialize() { } getDrizzleManager() { return null } } }));

        const result = await executeToolCall('specly_init', {});
        expect(result.isError).toBe(true);
        const text = Array.isArray(result.content) && result.content[0] && (result.content[0] as any).text;
        expect(String(text)).toContain('Drizzle manager error');
    });

    it('cli: runCli propagates tool error as exit/fatal path', async () => {
        // Spy on console.error to assert CLI surfaces inner tool error text
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        await expect(runCli('specly_init', {}, { executeOverride: async () => ({ isError: true, content: [{ type: 'text', text: 'tool err' }] }) })).rejects.toThrow('process.exit called with code 1');

        // Ensure the inner tool message was surfaced to stderr
        expect(errSpy.mock.calls.some(call => call.some(arg => String(arg).includes('tool err')))).toBe(true);
        errSpy.mockRestore();
    });

    it('db: connection guards throw on uninitialized manager', () => {
        // Ensure DatabaseManager guards prevent uninitialized access
        const db = new DatabaseManager();
        expect(() => db.getDb()).toThrow(/Database not initialized/);
    });

    it('spec-engine: handle GraphValidationError branch', async () => {
        // Mock validateToolGraph to throw GraphValidationError to exercise branch mapping to GRAPH_CYCLE
        vi.spyOn(graphValidate, 'validateToolGraph').mockImplementation(() => { throw new graphValidate.GraphValidationError('ERR_CYCLE', 'Cycle detected'); });

        const engine = new SpecEngine();
        const graph = { entry: 'a', nodes: { a: { hash: 'a', intent: 'autonomous', sideEffect: false } }, edges: [] };
        const result = await engine.run(graph as any);
        expect(result.status).toBe('error');
        expect(result.errorCode).toBe(SpecEngineErrorCode.GRAPH_CYCLE);
    });

    it('spec-engine: executor-failure retry/finalize path', async () => {
        // Executor that always throws to trigger finalize/failure path
        const engine = new SpecEngine({ executor: { execute: async () => { throw new Error('exec fail'); } }, retryPolicy: { maxAttempts: 1 } as any, planner: { buildPlan: () => ({ steps: [{ specHash: 'x', awaitingHuman: false }], warnings: [] }) } as any });

        const graph = { entry: 'x', nodes: { x: { hash: 'x', intent: 'autonomous', sideEffect: false } }, edges: [] };
        const result = await engine.run(graph as any);
        expect(result.status).toBe('error');
        expect(result.errorCode).toBe(SpecEngineErrorCode.EXECUTOR_FAILED);
    });

    it('spec-engine: resume lease/renewal failure path', async () => {
        // Lease provider that acquires but fails on renew
        const leaseProvider = {
            acquire: async () => ({ leaseId: 'lease-1' }),
            renew: async () => { throw new Error('renew failed'); },
            release: async () => { }
        };

        const planner = { buildPlan: () => ({ steps: [{ specHash: 'h', awaitingHuman: false }, { specHash: 'y', awaitingHuman: false }], warnings: [] }) };
        // Executor returns a value so the failure comes from renew
        const executor = { execute: async () => ({ ok: true }) };

        // Set leaseRenewEvery = 1 to force renew on first autonomous execution in resume
        const engine = new SpecEngine({ leaseProvider: leaseProvider as any, executor: executor as any, planner: planner as any, leaseRenewEvery: 1 });

        const serialized = {
            plan: { steps: [{ specHash: 'h', awaitingHuman: true }, { specHash: 'y', awaitingHuman: false }], warnings: [] },
            currentIndex: 0,
            executed: [],
            results: {},
            warnings: [],
            awaitingSpec: 'h',
            sessionContext: {}
        };

        const result = await engine.resume({ entry: 'h', nodes: { h: { hash: 'h', intent: 'human', sideEffect: false }, y: { hash: 'y', intent: 'autonomous', sideEffect: false } }, edges: [] } as any, serialized as any, { specHash: 'h', humanOutput: {} }, { sessionId: 's', clientId: 'c' } as any);
        expect(result.status).toBe('error');
        expect(result.errorCode).toBe(SpecEngineErrorCode.LEASE_RENEW_FAILED);
    });

    it('next-step-generator: branch triggered by toolFlow shape', async () => {
        const fakeDb = createFakeDrizzleManager();
        const gen = new NextStepTemplateGenerator(fakeDb as any);
        // Mock getToolFlow to return a simple flow with first step validate
        vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockResolvedValue({
            flow_steps: [{ system_tool_fn: 'specly_add:validate', step_order: 1 }]
        } as any);

        const instruction = await gen.generateNextStepInstructions('specly_add');
        expect(instruction).not.toBeNull();
        expect(instruction?.stepId).toBe('validate');
        expect(instruction?.instructionText).toContain("stepId='validate'");
    });
});