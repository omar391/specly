import { getGlobalDatabase } from '../database/drizzle-connection.js';
import { specs } from '../database/schema/global-schema.js';

/**
 * ensureSpecs - idempotently inserts spec rows needed for tests.
 * Accepts minimal spec descriptors; ignores duplicates.
 */
export async function ensureSpecs(list: { hash: string; intent?: 'human'|'autonomous'; sideEffect?: boolean; idempotencyKeyTemplate?: string }[]) {
  const dbMgr = getGlobalDatabase();
  if (!dbMgr.initialized) await dbMgr.initialize();
  const db = dbMgr.getDb();
  for (const s of list) {
    try {
      await db.insert(specs).values({
        hash: s.hash,
        executorType: 'noop',
        executorVersion: '1',
        intent: s.intent ?? 'autonomous',
        sideEffect: s.sideEffect ?? false,
        idempotencyKeyTemplate: s.idempotencyKeyTemplate,
        staticParams: {},
        metadata: {}
      } as any);
    } catch {
      // ignore duplicates
    }
  }
}
