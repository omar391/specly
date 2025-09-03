import { GlobalDatabaseService } from "../database/global-queries.js";
import { actionJournal } from "../database/schema/global-schema.js";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";

export interface CreateJournalEntryInput {
  sessionId: string;
  specHash: string;
  idempotencyKey: string;
}

export class ActionJournalRepository {
  constructor(private globalDb: GlobalDatabaseService) {}
  private uuid(): string { return crypto.randomUUID(); }

  async createOrGetPending(input: CreateJournalEntryInput): Promise<{ id: string; created: boolean; status: string }> {
    const db = this.globalDb.getDrizzleManager().getDb();
    const existing = await db.select().from(actionJournal).where(and(
      eq(actionJournal.specHash, input.specHash),
      eq(actionJournal.idempotencyKey, input.idempotencyKey)
    )).limit(1);
    if (existing.length > 0) {
      return { id: existing[0].id, created: false, status: existing[0].status };
    }
    const id = this.uuid();
    const [row] = await db.insert(actionJournal).values({
      id,
      sessionId: input.sessionId,
      specHash: input.specHash,
      idempotencyKey: input.idempotencyKey,
      status: 'pending',
      attempts: 0
    }).returning();
    return { id: row.id, created: true, status: row.status };
  }

  async updateStatus(id: string, status: 'pending' | 'success' | 'failed', data?: { resultJson?: any; errorJson?: any; lastErrorCode?: string }): Promise<void> {
    const db = this.globalDb.getDrizzleManager().getDb();
    await db.update(actionJournal).set({
      status,
      resultJson: data?.resultJson ? JSON.stringify(data.resultJson) : undefined,
      errorJson: data?.errorJson ? JSON.stringify(data.errorJson) : undefined,
      lastErrorCode: data?.lastErrorCode ?? undefined,
      completedAt: status !== 'pending' ? new Date().toISOString() : undefined
    }).where(eq(actionJournal.id, id));
  }
}
