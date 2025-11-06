import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';

/**
 * Database Service
 * 
 * Provides unified access to both global and workspace databases.
 * This service manages the dual database architecture and provides
 * a clean interface for tools to access the appropriate database.
 */
export class DatabaseService {
  private globalDb: GlobalDatabaseService;
  private workspaceDbCache = new Map<string, WorkspaceDatabaseService>();

  constructor(globalDrizzleDb: DrizzleDatabaseManager) {
    this.globalDb = new GlobalDatabaseService(globalDrizzleDb);
  }

  /**
   * Get global database service
   */
  getGlobal(): GlobalDatabaseService {
    return this.globalDb;
  }

  /**
   * Get workspace database service
   * Caches workspace database instances for efficiency
   */
  async getWorkspace(workspacePath: string): Promise<WorkspaceDatabaseService> {
    // Check cache first
    if (this.workspaceDbCache.has(workspacePath)) {
      return this.workspaceDbCache.get(workspacePath)!;
    }

    // Create new workspace database service
    const workspaceDb = new WorkspaceDatabaseService(workspacePath);
    await workspaceDb.initialize();

    // Cache it
    this.workspaceDbCache.set(workspacePath, workspaceDb);

    return workspaceDb;
  }

  /**
   * Clear workspace database cache
   */
  clearWorkspaceCache(): void {
    this.workspaceDbCache.clear();
  }

  /**
   * Check if global database is ready
   */
  async isGlobalReady(): Promise<boolean> {
    try {
      await this.globalDb.getAllWorkspaces();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if workspace database is ready
   */
  async isWorkspaceReady(workspacePath: string): Promise<boolean> {
    try {
      const workspaceDb = await this.getWorkspace(workspacePath);
      await workspaceDb.getAllTasks();
      return true;
    } catch {
      return false;
    }
  }
}
