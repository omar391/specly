import { GlobalDatabaseService } from "../database/global-queries.js";
import { workspaceRulesNew } from "../database/schema/global-schema.js";
import { and, eq, desc } from "drizzle-orm";
import crypto from "crypto";

export interface UpsertWorkspaceRuleInput {
  workspaceId: string;
  relation: 'always-do' | 'never-do' | 'is-a' | 'has-a';
  rule: string;
  originalText?: string | null;
  sourceSessionId?: string | null;
}

export class WorkspaceRulesRepository {
  constructor(private globalDb: GlobalDatabaseService) {}
  private uuid(): string { return crypto.randomUUID(); }

  async addOrReinforce(input: UpsertWorkspaceRuleInput): Promise<{ id: string; created: boolean; confidence: number }> {
    const db = this.globalDb.getDrizzleManager().getDb();
    const existing = await db.select().from(workspaceRulesNew).where(and(
      eq(workspaceRulesNew.workspaceId, input.workspaceId),
      eq(workspaceRulesNew.relation, input.relation),
      eq(workspaceRulesNew.rule, input.rule)
    )).limit(1);
    if (existing.length > 0) {
      // Logarithmic reinforcement: new_conf = 1 - (1 - old_conf) * (1 - baseDelta)
      // baseDelta ≈ 0.3, so (1 - baseDelta) = 0.7
      // Formula works on 0-1 scale, so normalize from 1-100 range
      const oldConf = existing[0].confidence ?? 1;
      const normalizedOld = oldConf / 100; // Convert to 0-1
      const normalizedNew = 1 - (1 - normalizedOld) * 0.7;
      const confidence = Math.min(100, Math.max(1, Math.round(normalizedNew * 100))); // Convert back to 1-100
      await db.update(workspaceRulesNew).set({ confidence, lastReinforcedAt: new Date().toISOString() }).where(eq(workspaceRulesNew.id, existing[0].id));
      return { id: existing[0].id, created: false, confidence };
    }
    const id = this.uuid();
    const [row] = await db.insert(workspaceRulesNew).values({
      id,
      workspaceId: input.workspaceId,
      relation: input.relation as any,
      rule: input.rule,
      originalText: input.originalText ?? null,
      sourceSessionId: input.sourceSessionId ?? null,
      confidence: 1,
      active: true
    } as any).returning();
    return { id: row.id, created: true, confidence: (row.confidence as number) ?? 1 };
  }

  async list(workspaceId: string, activeOnly = true): Promise<any[]> {
    const db = this.globalDb.getDrizzleManager().getDb();
    const query = db.select().from(workspaceRulesNew).where(eq(workspaceRulesNew.workspaceId, workspaceId)).orderBy(desc(workspaceRulesNew.confidence), desc(workspaceRulesNew.createdAt));
    const rows = await query;
    return activeOnly ? rows.filter(r => r.active) : rows;
  }
}
