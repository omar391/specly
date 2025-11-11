import { randomUUID } from 'crypto';
import type { ActionJournalAdapter, MetricsCollector } from './spec-engine.js';
import { getGlobalDatabaseService } from '../database/global-queries.js';
import { actionJournal, specs } from '../database/schema/global-schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * PersistentJournalService
 * Minimal implementation storing per-spec attempt lifecycle in action_journal table.
 * Reuses existing schema (id, sessionId, specHash, idempotencyKey, status, attempts, ...).
 * Assumptions:
 *  - sessionId provided externally (run options); fallback to 'default-session'.
 *  - idempotency key = `${specHash}` for now (can evolve to include attempt if we retain multi-attempt rows).
 *  - For multiple attempts we update same row incrementing attempts and updating lastErrorCode / result.
 */
export class PersistentJournalService implements ActionJournalAdapter {
    private initialized = false;
    private initializing?: Promise<void>;
    private globalService = getGlobalDatabaseService();
    private metrics?: MetricsCollector; // optional metrics collector injected externally

    constructor(private sessionId: string = 'default-session', opts?: { metrics?: MetricsCollector }) {
        this.metrics = opts?.metrics;
    }

    private async ensureInitialized() {
        if (this.initialized) return;
        if (!this.initializing) {
            this.initializing = (async () => {
                try {
                    // Always invoke initialize (idempotent) to guarantee schema present before writes
                    await this.globalService.initialize();
                    this.initialized = true;
                } catch {
                    this.initialized = false; // allow retry on next call
                } finally {
                    this.initializing = undefined;
                }
            })();
        }
        await this.initializing;
    }

    private specCache: Record<string, any> = {};
    private async resolveIdempotencyKey(specHash: string): Promise<string> {
        // Fetch spec to see if it has idempotencyKeyTemplate
        try {
            const mgr = this.globalService.getDrizzleManager();
            if (!mgr.initialized) return specHash; // fallback
            if (this.specCache[specHash]) return this.specCache[specHash];
            const db = mgr.getDb();
            const [row] = await db.select().from(specs).where(eq(specs.hash, specHash)).limit(1);
            if (!row) {
                const allowAuto = process.env.SPECLY_JOURNAL_AUTOCREATE_SPEC !== 'false';
                if (allowAuto) {
                    try {
                        await db.insert(specs).values({
                            hash: specHash,
                            executorType: 'noop',
                            executorVersion: '1',
                            intent: 'autonomous',
                            sideEffect: 0,
                            metadata: {}
                        } as any);
                    } catch { /* ignore duplicate */ }
                }
                return specHash;
            }
            let key = specHash;
            if (row.idempotencyKeyTemplate) {
                // Simple template: replace {{spec_hash}}
                key = row.idempotencyKeyTemplate.replace(/{{\s*spec_hash\s*}}/g, specHash);
            }
            this.specCache[specHash] = key;
            return key;
        } catch { return specHash; }
    }

    private async upsert(specHash: string, mut: (row: any) => any, seed: (idemKey: string) => any) {
        try {
            await this.ensureInitialized();
            const mgr = this.globalService.getDrizzleManager();
            if (!mgr.initialized) return; // give up silently
            const db = mgr.getDb();
            const idemKey = await this.resolveIdempotencyKey(specHash);
            const [existing] = await db.select().from(actionJournal)
                .where(and(eq(actionJournal.sessionId, this.sessionId), eq(actionJournal.specHash, specHash), eq(actionJournal.idempotencyKey, idemKey)))
                .limit(1);
            if (!existing) {
                const row = seed(idemKey);
                await db.insert(actionJournal).values(row);
            } else {
                const updated = mut(existing);
                await db.update(actionJournal).set(updated).where(eq(actionJournal.id, existing.id));
            }
        } catch {
            // Silent swallow – journal must never surface as unhandled rejection
            try { this.metrics?.inc('specly_engine_journal_failures_total'); } catch { /* ignore metrics errors */ }
        }
    }

    /**
     * Returns prior successful result row (including resultJson) if one exists for this (sessionId,specHash,idempotencyKey).
     */
    async getSuccessfulResult(specHash: string): Promise<any | undefined> {
        try {
            await this.ensureInitialized();
            const mgr = this.globalService.getDrizzleManager();
            if (!mgr.initialized) return undefined;
            const db = mgr.getDb();
            const idemKey = await this.resolveIdempotencyKey(specHash);
            const [row] = await db.select().from(actionJournal)
                .where(and(
                    eq(actionJournal.sessionId, this.sessionId),
                    eq(actionJournal.specHash, specHash),
                    eq(actionJournal.idempotencyKey, idemKey),
                    eq(actionJournal.status, 'success')
                )).limit(1);
            return row;
        } catch { return undefined; }
    }

    async recordStart(specHash: string, attempt: number) {
        await this.upsert(
            specHash,
            (row) => ({ ...row, attempts: attempt, status: 'pending', startedAt: new Date().toISOString() }),
            (idemKey) => ({ id: randomUUID(), sessionId: this.sessionId, specHash, idempotencyKey: idemKey, status: 'pending', attempts: attempt, startedAt: new Date().toISOString() })
        );
    }
    async recordSuccess(specHash: string, attempt: number, output: unknown) {
        await this.upsert(
            specHash,
            (row) => ({ ...row, attempts: attempt, status: 'success', resultJson: output, completedAt: new Date().toISOString() }),
            (idemKey) => ({ id: randomUUID(), sessionId: this.sessionId, specHash, idempotencyKey: idemKey, status: 'success', attempts: attempt, resultJson: output, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() })
        );
    }
    async recordFailure(specHash: string, attempt: number, error: { message: string }) {
        await this.upsert(
            specHash,
            (row) => ({ ...row, attempts: attempt, status: 'failed', lastErrorCode: error.message, errorJson: error, completedAt: new Date().toISOString() }),
            (idemKey) => ({ id: randomUUID(), sessionId: this.sessionId, specHash, idempotencyKey: idemKey, status: 'failed', attempts: attempt, lastErrorCode: error.message, errorJson: error, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() })
        );
    }
}

export function createPersistentJournal(sessionId?: string, opts?: { metrics?: MetricsCollector }) {
    return new PersistentJournalService(sessionId, opts);
}