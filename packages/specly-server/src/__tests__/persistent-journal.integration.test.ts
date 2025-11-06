import { describe, it, expect } from 'vitest';
import { SpecEngine } from '../services/spec-engine.js';
import { buildToolGraph } from '../utils/tool-graph-builder.js';
import { initializeGlobalDatabaseService, getGlobalDatabaseService } from '../database/global-queries.js';
import { getGlobalDatabase } from '../database/drizzle-connection.js';
import { specs } from '../database/schema/global-schema.js';

/**
 * Integration tests for PersistentJournalService auto-injection when sessionId is provided.
 */

describe('PersistentJournalService Integration', () => {
    it('persists start/success rows for autonomous run with sessionId', async () => {
        await initializeGlobalDatabaseService();
        // Persist specs (simulate prior graph registration)
        const db = getGlobalDatabase();
        if (!db.initialized) await db.initialize();
        const drizzle = db.getDb();
        try {
            await drizzle.insert(specs).values([
                { hash: 'S1', executorType: 'noop', executorVersion: '1', intent: 'autonomous', sideEffect: false, staticParams: {}, metadata: {} },
                { hash: 'S2', executorType: 'noop', executorVersion: '1', intent: 'autonomous', sideEffect: false, staticParams: {}, metadata: {} }
            ] as any);
        } catch { /* ignore if already inserted in prior test run within same process */ }
        const sessionId = `sess-autonomous-${Date.now()}`;
        const graph = buildToolGraph(b => b
            .addSpec({ hash: 'S1', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'S2', intent: 'autonomous' })
            .addEdge('S1', 'S2')
        );

        const engine = new SpecEngine(); // no explicit journal adapter provided -> auto persistent
        const ctx = await engine.run(graph, { sessionId });
        expect(ctx.status).toBe('completed');

        const rows = await getGlobalDatabaseService().getActionJournalEntries(sessionId);
        // We expect one row per spec hash (upsert model) with final status success
        const byHash: Record<string, any> = {};
        for (const r of rows) byHash[r.specHash] = r;
        expect(Object.keys(byHash).sort()).toEqual(['S1', 'S2']);
        expect(byHash.S1.status).toBe('success');
        expect(byHash.S2.status).toBe('success');
        expect(byHash.S1.attempts).toBeGreaterThan(0);
    });

    it('persists failure row when executor fails', async () => {
        await initializeGlobalDatabaseService();
        const db = getGlobalDatabase();
        if (!db.initialized) await db.initialize();
        const drizzle = db.getDb();
        try {
            await drizzle.insert(specs).values([
                { hash: 'A', executorType: 'noop', executorVersion: '1', intent: 'autonomous', sideEffect: false, staticParams: {}, metadata: {} },
                { hash: 'B', executorType: 'noop', executorVersion: '1', intent: 'autonomous', sideEffect: false, staticParams: {}, metadata: {} }
            ] as any);
        } catch { }
        const sessionId = `sess-fail-${Date.now()}`;
        const graph = buildToolGraph(b => b
            .addSpec({ hash: 'A', intent: 'autonomous', entry: true })
            .addSpec({ hash: 'B', intent: 'autonomous' })
            .addEdge('A', 'B')
        );
        // Custom executor that fails on B
        const failingExec = { execute: async (hash: string) => { if (hash === 'B') throw new Error('boom'); return { ok: true }; } };
        const engine = new SpecEngine({ executor: failingExec });
        const ctx = await engine.run(graph, { sessionId });
        expect(ctx.status).toBe('error');
        const rows = await getGlobalDatabaseService().getActionJournalEntries(sessionId);
        const byHash: Record<string, any> = {};
        for (const r of rows) byHash[r.specHash] = r;
        expect(byHash.A.status).toBe('success');
        expect(byHash.B.status).toBe('failed');
        expect(byHash.B.lastErrorCode).toBe('boom');
    });

    it('uses idempotency key template when provided', async () => {
        await initializeGlobalDatabaseService();
        const db = getGlobalDatabase();
        if (!db.initialized) await db.initialize();
        const drizzle = db.getDb();
        try {
            await drizzle.insert(specs).values([
                { hash: 'K1', executorType: 'noop', executorVersion: '1', intent: 'autonomous', sideEffect: false, idempotencyKeyTemplate: 'node-{{spec_hash}}', staticParams: {}, metadata: {} }
            ] as any);
        } catch { }
        const graph = buildToolGraph(b => b.addSpec({ hash: 'K1', intent: 'autonomous', entry: true }));
        const sessionId = `sess-idem-${Date.now()}`;
        const engine = new SpecEngine();
        const ctx = await engine.run(graph, { sessionId });
        expect(ctx.status).toBe('completed');
        const rows = await getGlobalDatabaseService().getActionJournalEntries(sessionId);
        expect(rows.length).toBe(1);
        expect(rows[0].idempotencyKey).toBe('node-K1');
    });
});
