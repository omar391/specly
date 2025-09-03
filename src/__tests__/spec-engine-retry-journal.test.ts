import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph } from '../services/spec-engine.js';
import { createPersistentJournal } from '../services/persistent-journal-service.js';
import { getGlobalDatabaseService } from '../database/global-queries.js';
import { actionJournal } from '../database/schema/global-schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * SP-005 Phase 8 hardening: verify retry attempts journal entries.
 * Scenario: one spec that fails twice (maxAttempts=2) with persistent journal.
 * Assertions:
 *  - Journal row attempts=2, status='failed'
 *  - resultJson absent, lastErrorCode populated
 *  - No duplicate rows (single idempotency key upsert pattern)
 */

describe('SpecEngine retry + journal integration', () => {
  it('records attempts and failure status after exhausting retries', async () => {
    const sessionId = 'retry-test-session';
    // Executor that always fails
    const failingExecutor = { execute: async () => { throw new Error('boom'); } };

    const graph: ToolGraph = {
      entry: 'spec_a',
      nodes: { spec_a: { hash: 'spec_a', intent: 'autonomous', sideEffect: true } },
      edges: []
    };

  const journal = createPersistentJournal(sessionId);
  // Ensure global DB initialized before engine starts so journal upserts don't silently skip
  const globalSvc = getGlobalDatabaseService();
  await globalSvc.initialize();
  const engine = new SpecEngine({ executor: failingExecutor, journalAdapter: journal, retryPolicy: { maxAttempts: 2, strategy: 'immediate' } });
  const result = await engine.run(graph, { sessionId, clientId: 'client1' });
  // Micro-wait to allow async journal upsert resolution (best-effort)
  await new Promise(r => setTimeout(r, 5));

    expect(result.status).toBe('error');

    // Query DB for journal row
  // globalSvc already initialized above
    const db = globalSvc.getDrizzleManager().getDb();
    const rows = await db.select().from(actionJournal).where(and(eq(actionJournal.sessionId, sessionId), eq(actionJournal.specHash, 'spec_a')));
    expect(rows.length).toBe(1); // single upserted row
    const row = rows[0];
    expect(row.attempts).toBe(2);
    expect(row.status).toBe('failed');
    expect(row.resultJson).toBeNull();
    expect(row.lastErrorCode).toBe('boom');
  });
});
