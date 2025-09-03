import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { DrizzleDatabaseManager, getGlobalDatabase } from './drizzle-connection.js';
import {
  workspaces,
  sessions,
  mcpServerMappings,
  toolVersions,
  specs
} from './schema/global-schema.js';
import type {
  Workspace,
  NewWorkspace,
  Session,
  NewSession,
  McpServerMapping,
  NewMcpServerMapping
} from './schema/global-schema.js';

export class GlobalDatabaseService {
  private db: DrizzleDatabaseManager;

  constructor(dbInstance?: DrizzleDatabaseManager) {
    this.db = dbInstance || getGlobalDatabase();
  }

  // ========================================
  // SPEC & TOOL VERSION OPERATIONS (for execute path)
  // ========================================

  /** Fetch tool version by hash */
  async getToolVersion(hash: string) {
    const db = this.db.getDb();
    const [result] = await db.select().from(toolVersions).where(eq(toolVersions.hash, hash)).limit(1);
    return result || null;
  }

  /** Fetch multiple specs by hashes (returns map hash -> spec) */
  async getSpecsByHashes(hashes: string[]) {
    if (!hashes.length) return {} as Record<string, typeof specs.$inferSelect>;
    const db = this.db.getDb();
    const rows = await db.select().from(specs).where(inArray(specs.hash, hashes));
    const map: Record<string, typeof specs.$inferSelect> = {};
    for (const r of rows) map[r.hash] = r;
    return map;
  }

  // ========================================
  // ACTION JOURNAL OPERATIONS (read-only helper for SP-010 tests)
  // ========================================
  async getActionJournalEntries(sessionId: string) {
    const db = this.db.getDb();
    // dynamic import to avoid circular type issues
    const { actionJournal } = await import('./schema/global-schema.js');
    return db.select().from(actionJournal).where(eq(actionJournal.sessionId, sessionId));
  }

  /**
   * Run a raw SQL query and return all results
   */
  async all(query: string): Promise<any[]> {
    // @ts-ignore
    return this.db.queryRaw?.(query) ?? [];
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    await this.db.initialize();
  }

  /**
   * Get the underlying DrizzleDatabaseManager instance
   */
  getDrizzleManager(): DrizzleDatabaseManager {
    return this.db;
  }

  // ========================================
  // WORKSPACE OPERATIONS
  // ========================================

  /**
   * Create a new workspace
   */
  async createWorkspace(workspace: NewWorkspace): Promise<Workspace> {
    const db = this.db.getDb();
    const [result] = await db.insert(workspaces).values(workspace).returning();
    return result;
  }

  /**
   * Get workspace by ID
   */
  async getWorkspace(id: string): Promise<Workspace | null> {
    const db = this.db.getDb();
    const [result] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return result || null;
  }

  /**
   * Get workspace by path
   */
  async getWorkspaceByPath(path: string): Promise<Workspace | null> {
    const db = this.db.getDb();
    const [result] = await db.select().from(workspaces).where(eq(workspaces.path, path)).limit(1);
    return result || null;
  }

  /**
   * Get all workspaces
   */
  async getAllWorkspaces(): Promise<Workspace[]> {
    const db = this.db.getDb();
    return db.select().from(workspaces).orderBy(desc(workspaces.updatedAt));
  }

  /**
   * Update workspace
   */
  async updateWorkspace(id: string, updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>): Promise<Workspace | null> {
    const db = this.db.getDb();
    const [result] = await db.update(workspaces)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(workspaces.id, id))
      .returning();
    return result || null;
  }

  /**
   * Delete workspace
   */
  async deleteWorkspace(id: string): Promise<boolean> {
    const db = this.db.getDb();
    const result = await db.delete(workspaces).where(eq(workspaces.id, id));
    return result.changes > 0;
  }

  /**
   * Update workspace activity
   */
  async updateWorkspaceActivity(id: string, taskCount?: number, activeTask?: string): Promise<void> {
    const updates: any = {
      lastActivity: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (taskCount !== undefined) {
      updates.taskCount = taskCount;
    }

    if (activeTask !== undefined) {
      updates.activeTask = activeTask;
    }

    const db = this.db.getDb();
    await db.update(workspaces).set(updates).where(eq(workspaces.id, id));
  }

  // ========================================
  // SESSION OPERATIONS
  // ========================================

  /**
   * Create a new session
   */
  async createSession(session: NewSession): Promise<Session> {
    const db = this.db.getDb();
    const [result] = await db.insert(sessions).values(session).returning();
    return result;
  }

  /**
   * Get active session for workspace
   */
  async getActiveSession(workspaceId: string): Promise<Session | null> {
    const db = this.db.getDb();
    const [result] = await db.select()
      .from(sessions)
      .where(and(eq(sessions.workspaceId, workspaceId), eq(sessions.isActive, true)))
      .orderBy(desc(sessions.lastActivity))
      .limit(1);
    return result || null;
  }

  /**
   * Get all sessions for workspace
   */
  async getWorkspaceSessions(workspaceId: string): Promise<Session[]> {
    const db = this.db.getDb();
    return db.select()
      .from(sessions)
      .where(eq(sessions.workspaceId, workspaceId))
      .orderBy(desc(sessions.lastActivity));
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    const db = this.db.getDb();
    await db.update(sessions)
      .set({ lastActivity: new Date().toISOString() })
      .where(eq(sessions.id, sessionId));
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    const db = this.db.getDb();
    await db.update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.id, sessionId));
  }

  // Legacy tool flow & feedback step operations removed (Specly schema migration).



  // ========================================
  // MCP SERVER MAPPING OPERATIONS
  // ========================================

  /**
   * Create a new MCP server mapping
   */
  async createMcpServerMapping(mapping: NewMcpServerMapping): Promise<McpServerMapping> {
    const db = this.db.getDb();
    const [result] = await db.insert(mcpServerMappings).values(mapping).returning();
    return result;
  }

  /**
   * Get all MCP server mappings
   */
  async getAllMcpServerMappings(): Promise<McpServerMapping[]> {
    const db = this.db.getDb();
    return db.select()
      .from(mcpServerMappings)
      .orderBy(asc(mcpServerMappings.interfaceType));
  }

  /**
   * Get MCP server mappings by interface type
   */
  async getMcpServerMappingsByType(interfaceType: string): Promise<McpServerMapping[]> {
    const db = this.db.getDb();
    return db.select()
      .from(mcpServerMappings)
      .where(eq(mcpServerMappings.interfaceType, interfaceType as any))
      .orderBy(desc(mcpServerMappings.isDefault));
  }

  /**
   * Get default MCP server mapping for interface type
   */
  async getDefaultMcpServerMapping(interfaceType: string): Promise<McpServerMapping | null> {
    const db = this.db.getDb();
    const [result] = await db.select()
      .from(mcpServerMappings)
      .where(and(
        eq(mcpServerMappings.interfaceType, interfaceType as any),
        eq(mcpServerMappings.isDefault, true)
      ))
      .limit(1);
    return result || null;
  }

  /**
   * Set default MCP server mapping
   */
  async setDefaultMcpServerMapping(id: string): Promise<void> {
    const db = this.db.getDb();

    // Get the mapping to find its interface type
    const [mapping] = await db.select()
      .from(mcpServerMappings)
      .where(eq(mcpServerMappings.id, id))
      .limit(1);

    if (!mapping) {
      throw new Error('MCP server mapping not found');
    }

    // Use transaction to ensure consistency
    await this.db.transaction(async (tx) => {
      // Clear all defaults for this interface type
      await tx.update(mcpServerMappings)
        .set({ isDefault: false })
        .where(eq(mcpServerMappings.interfaceType, mapping.interfaceType));

      // Set new default
      await tx.update(mcpServerMappings)
        .set({ isDefault: true })
        .where(eq(mcpServerMappings.id, id));
    });
  }

  /**
   * Update MCP server mapping
   */
  async updateMcpServerMapping(id: string, updates: Partial<Omit<McpServerMapping, 'id' | 'createdAt'>>): Promise<McpServerMapping | null> {
    const db = this.db.getDb();
    const [result] = await db.update(mcpServerMappings)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(mcpServerMappings.id, id))
      .returning();
    return result || null;
  }

  /**
   * Delete MCP server mapping
   */
  async deleteMcpServerMapping(id: string): Promise<boolean> {
    const db = this.db.getDb();
    const result = await db.delete(mcpServerMappings).where(eq(mcpServerMappings.id, id));
    return result.changes > 0;
  }
}

// Singleton instance
let globalDbService: GlobalDatabaseService | null = null;

/**
 * Get singleton global database service instance
 */
export function getGlobalDatabaseService(): GlobalDatabaseService {
  if (!globalDbService) {
    globalDbService = new GlobalDatabaseService();
  }
  return globalDbService;
}

/**
 * Initialize global database service
 */
export async function initializeGlobalDatabaseService(): Promise<GlobalDatabaseService> {
  try {
    const service = getGlobalDatabaseService();
    if (!service) {
      throw new Error('Failed to get global database service instance');
    }
    await service.initialize();
    return service;
  } catch (error) {
    console.error('Error initializing global database service:', error);
    throw error;
  }
}
