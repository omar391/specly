import { eq, and, or, desc, asc, inArray, notInArray, sql } from 'drizzle-orm';
import { DrizzleDatabaseManager, getWorkspaceDatabase } from './drizzle-connection.js';
import {
  tasks,
  githubConfigs,
  remoteInterfaces,
  taskDependencies,
  type Task,
  type NewTask,

  type GithubConfig,
  type NewGithubConfig,
  type RemoteInterface,
  type NewRemoteInterface
} from './schema/workspace-schema.js';

export class WorkspaceDatabaseService {

  // ========== CONSTRUCTOR & DB INIT ==========
  private db: DrizzleDatabaseManager;

  constructor(workspacePath: string, dbInstance?: DrizzleDatabaseManager) {
    this.db = dbInstance || getWorkspaceDatabase(workspacePath);
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    await this.db.initialize();
  }

  // ========================================
  // TASK OPERATIONS (Final Specly)
  // ========================================

  async getTasksPaginated(status: string | undefined, limit: number, offset: number): Promise<Task[]> {
    const db = this.db.getDb();
    let whereClause = undefined as any;
    if (status === 'current') {
      whereClause = notInArray(tasks.status, ['completed', 'failed']);
    } else if (status === 'history') {
      whereClause = inArray(tasks.status, ['completed', 'failed']);
    } else if (status) {
      whereClause = eq(tasks.status, status as any);
    }
    return db.select().from(tasks).where(whereClause).orderBy(desc(tasks.updatedAt)).limit(limit).offset(offset);
  }

  async countTasks(status: string | undefined): Promise<number> {
    const db = this.db.getDb();
    let whereClause = undefined as any;
    if (status === 'current') {
      whereClause = notInArray(tasks.status, ['completed', 'failed']);
    } else if (status === 'history') {
      whereClause = inArray(tasks.status, ['completed', 'failed']);
    } else if (status) {
      whereClause = eq(tasks.status, status as any);
    }
    const result = await db.select({ total: sql<number>`count(*) as total` }).from(tasks).where(whereClause);
    return result?.[0]?.total ?? 0;
  }

  async createTask(task: NewTask): Promise<Task> {
    const db = this.db.getDb();
    // Some sqlite/drizzle environments return the inserted row via `returning()`,
    // while others (or certain test mocks) expect `.returning()` to be called.
    // Try to use `.returning()` if available; otherwise fall back to selecting by id.
    const insertBuilder: any = db.insert(tasks).values(task as any);

    if (insertBuilder && typeof insertBuilder.returning === 'function') {
      try {
        const returned = await insertBuilder.returning();
        if (Array.isArray(returned) && returned.length) {
          return returned[0] as Task;
        }
      } catch (e) {
        // If returning() throws or isn't supported in this environment, ignore and fallback
      }
    }

    // Fallback: perform insert without relying on returning(), then fetch by id
    await db.insert(tasks).values(task as any);
    const rows: any = await db.select().from(tasks).where(eq(tasks.id, (task as any).id)).limit(1);
    // Some query builders return the result directly, others return a promise resolving to an array
    const created = Array.isArray(rows) ? rows[0] : (rows && rows[0]) ? rows[0] : rows;
    return created as Task;
  }

  async getTask(id: string): Promise<Task | null> {
    const db = this.db.getDb();
    const [result] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return result || null;
  }

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | null> {
    const db = this.db.getDb();
    const [result] = await db.update(tasks).set({ ...updates, updatedAt: new Date().toISOString() } as any).where(eq(tasks.id, id)).returning();
    return result || null;
  }

  async deleteTask(id: string): Promise<boolean> {
    const db = this.db.getDb();
    const result = await db.delete(tasks).where(eq(tasks.id, id));
    return result.changes > 0;
  }

  // Back-compat wrappers removed per Specly-only directive

  // Dependencies (task_dependencies)
  async addTaskDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    const db = this.db.getDb();
    await db.insert(taskDependencies).values({ taskId, dependsOnTaskId } as any).onConflictDoNothing();
  }

  async removeTaskDependency(taskId: string, dependsOnTaskId: string): Promise<boolean> {
    const db = this.db.getDb();
    const result = await db.delete(taskDependencies).where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnTaskId, dependsOnTaskId)));
    return result.changes > 0;
  }

  async listTaskDependencies(taskId: string): Promise<{ depends_on_task_id: string }[]> {
    const db = this.db.getDb();
    const rows = await db.select().from(taskDependencies).where(eq(taskDependencies.taskId, taskId));
    return rows.map((r: any) => ({ depends_on_task_id: r.dependsOnTaskId }));
  }

  // Convenience wrappers for common queries (final model)
  async getAllTasks(): Promise<Task[]> {
    const db = this.db.getDb();
    return db.select().from(tasks).orderBy(desc(tasks.updatedAt));
  }

  // ========================================
  // GITHUB CONFIG OPERATIONS
  // ========================================

  /**
   * Create GitHub config
   */
  async createGithubConfig(config: NewGithubConfig): Promise<GithubConfig> {
    const db = this.db.getDb();
    const [result] = await db.insert(githubConfigs).values(config).returning();
    return result;
  }

  /**
   * Get GitHub config
   */
  async getGithubConfig(): Promise<GithubConfig | null> {
    const db = this.db.getDb();
    const [result] = await db.select().from(githubConfigs).limit(1);
    return result || null;
  }

  /**
   * Update GitHub config
   */
  async updateGithubConfig(id: string, updates: Partial<Omit<GithubConfig, 'id' | 'createdAt'>>): Promise<GithubConfig | null> {
    const db = this.db.getDb();
    const [result] = await db.update(githubConfigs)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(githubConfigs.id, id))
      .returning();
    return result || null;
  }

  /**
   * Delete GitHub config
   */
  async deleteGithubConfig(id: string): Promise<boolean> {
    const db = this.db.getDb();
    const result = await db.delete(githubConfigs).where(eq(githubConfigs.id, id));
    return result.changes > 0;
  }

  // ========================================
  // REMOTE INTERFACE OPERATIONS
  // ========================================

  /**
   * Create remote interface
   */
  async createRemoteInterface(remoteInterface: NewRemoteInterface): Promise<RemoteInterface> {
    const db = this.db.getDb();
    const [result] = await db.insert(remoteInterfaces).values(remoteInterface).returning();
    return result;
  }

  /**
   * Get remote interface by ID
   */
  async getRemoteInterface(id: string): Promise<RemoteInterface | null> {
    const db = this.db.getDb();
    const [result] = await db.select().from(remoteInterfaces).where(eq(remoteInterfaces.id, id)).limit(1);
    return result || null;
  }

  /**
   * Get all remote interfaces
   */
  async getAllRemoteInterfaces(): Promise<RemoteInterface[]> {
    const db = this.db.getDb();
    return db.select().from(remoteInterfaces).orderBy(asc(remoteInterfaces.interfaceType));
  }

  /**
   * Get remote interfaces by type
   */
  async getRemoteInterfacesByType(interfaceType: string): Promise<RemoteInterface[]> {
    const db = this.db.getDb();
    return db.select()
      .from(remoteInterfaces)
      .where(eq(remoteInterfaces.interfaceType, interfaceType as any))
      .orderBy(asc(remoteInterfaces.name));
  }

  /**
   * Update remote interface
   */
  async updateRemoteInterface(id: string, updates: Partial<Omit<RemoteInterface, 'id' | 'createdAt'>>): Promise<RemoteInterface | null> {
    const db = this.db.getDb();
    const [result] = await db.update(remoteInterfaces)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(remoteInterfaces.id, id))
      .returning();
    return result || null;
  }

  /**
   * Delete remote interface
   */
  async deleteRemoteInterface(id: string): Promise<boolean> {
    const db = this.db.getDb();
    const result = await db.delete(remoteInterfaces).where(eq(remoteInterfaces.id, id));
    return result.changes > 0;
  }

  // Legacy workspace tool flow & feedback step operations removed (Specly schema migration).

  // ========================================
  // UTILITY OPERATIONS
  // ========================================

  /**
   * Get task statistics
   */
  async getTaskStatistics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    completionRate: number;
  }> {
    const db = this.db.getDb();
    const allTasks = await db.select().from(tasks);

    const stats = {
      total: allTasks.length,
      byStatus: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      completionRate: 0
    };

    let completedCount = 0;

    for (const task of allTasks) {
      // Count by status
      if (task.status) {
        stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
      }

      // Count by priority
      if (task.priority) {
        stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;
      }

      // Count completed tasks
      if (task.status === 'completed') {
        completedCount++;
      }
    }

    // Calculate completion rate
    stats.completionRate = stats.total > 0 ? (completedCount / stats.total) * 100 : 0;

    return stats;
  }

  /**
   * Get high-priority in-progress tasks (for focus mode)
   */
  async getFocusTasks(): Promise<Task[]> {
    const db = this.db.getDb();
    return db.select()
      .from(tasks)
      .where(and(
        eq(tasks.status, 'in_progress'),
        eq(tasks.priority, 'high')
      ))
      .orderBy(desc(tasks.updatedAt));
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (service: WorkspaceDatabaseService) => Promise<T>): Promise<T> {
    return this.db.transaction(async () => {
      return callback(this);
    });
  }
}

/**
 * Get workspace database service instance
 */
export function getWorkspaceDatabaseService(workspacePath: string): WorkspaceDatabaseService {
  return new WorkspaceDatabaseService(workspacePath);
}

/**
 * Initialize workspace database service
 */
export async function initializeWorkspaceDatabaseService(workspacePath: string): Promise<WorkspaceDatabaseService> {
  const service = new WorkspaceDatabaseService(workspacePath);
  await service.initialize();
  return service;
}
