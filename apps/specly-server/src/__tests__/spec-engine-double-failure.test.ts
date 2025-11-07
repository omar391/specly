import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph } from '../services/spec-engine.js';
import { createPersistentJournal } from '../services/persistent-journal-service.js';
import { getGlobalDatabaseService } from '../database/global-queries.js';
import { actionJournal } from '../database/schema/global-schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * SP-005 Phase 8: Double failure idempotency test.
 * Ensures two separate runs that both fail the same spec update the same journal row (attempts reflect latest run's attempts).
 */

describe('SpecEngine double failure idempotency', () => {
    it('does not create duplicate rows for same failing spec across runs', async () => {
        const sessionId = 'double-fail-session';
        const failingExecutor = { execute: async () => { throw new Error('err'); } };
        const graph: ToolGraph = { entry: 'spec_fail', nodes: { spec_fail: { hash: 'spec_fail', intent: 'autonomous', sideEffect: true } }, edges: [] };

        const globalSvc = getGlobalDatabaseService();
        await globalSvc.initialize();

        const runOnce = async () => {
            const journal = createPersistentJournal(sessionId);
            const engine = new SpecEngine({ executor: failingExecutor, journalAdapter: journal, retryPolicy: { maxAttempts: 2 } });
            await engine.run(graph, { sessionId, clientId: 'c1' });
        };

        await runOnce();
        await runOnce();

        const db = globalSvc.getDrizzleManager().getDb();
        const rows = await db.select().from(actionJournal).where(and(eq(actionJournal.sessionId, sessionId), eq(actionJournal.specHash, 'spec_fail')));
        expect(rows.length).toBe(1);
        const row = rows[0];
        // After two runs each with maxAttempts=2, the final attempts should be 2 (latest run overwrote) not 4 (we do not accumulate across distinct runs)
        expect(row.attempts).toBe(2);
        expect(row.status).toBe('failed');
    });
});
