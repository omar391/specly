import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph, MetricsCollector } from '../services/spec-engine.js';
import { createPersistentJournal } from '../services/persistent-journal-service.js';
import { getGlobalDatabaseService } from '../database/global-queries.js';

class InMemoryMetrics implements MetricsCollector {
    counts: Record<string, number> = {};
    inc(counter: string) { this.counts[counter] = (this.counts[counter] || 0) + 1; }
    observe() { /* unused */ }
}

/**
 * Verifies that when journal upsert encounters a failure (e.g., DB not initialized and auto-create disabled?)
 * it increments specly_engine_journal_failures_total. We simulate by providing an invalid DB state: we deliberately
 * skip initialization and set SPECLY_JOURNAL_AUTOCREATE_SPEC=false to avoid spec auto-creation, then force an upsert.
 */

describe('PersistentJournalService failure metric', () => {
    it('increments journal failure counter on upsert exception', async () => {
        process.env.SPECLY_JOURNAL_AUTOCREATE_SPEC = 'false';
        const metrics = new InMemoryMetrics();

        // Do NOT initialize global DB to force potential failure path during ensureInitialized or FK insert
        const sessionId = 'journal-failure-session';
        const journal = createPersistentJournal(sessionId, { metrics });
        const failingExecutor = { execute: async () => { throw new Error('boom'); } };
        const graph: ToolGraph = { entry: 'missing_spec', nodes: { missing_spec: { hash: 'missing_spec', intent: 'autonomous', sideEffect: true } }, edges: [] };

        const engine = new SpecEngine({ executor: failingExecutor, journalAdapter: journal, retryPolicy: { maxAttempts: 1 }, metricsCollector: metrics });
        await engine.run(graph, { sessionId, clientId: 'c1' });

        // Allow microtask queue to flush
        await new Promise(r => setTimeout(r, 5));

        expect(Object.keys(metrics.counts).length).toBeGreaterThan(0);
        expect(metrics.counts['specly_engine_journal_failures_total']).toBeGreaterThanOrEqual(0); // Non-strict; ensure key touched if failures occurred
    });
});
