/**
 * Workspace Registry Service
 * 
 * Manages global workspace discovery, registration, and lifecycle.
 * Scans filesystem for Specly workspaces and maintains their status
 * in the global database for UI discovery.
 */

import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Workspace } from '../database/schema/global-schema.js';

export interface WorkspaceMetadata {
  id: string;
  path: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  lastActivity: Date;
  isActive: boolean;
  taskCount?: number;
  activeTask?: string | null;
}

export interface WorkspaceRegistryOptions {
  scanPaths?: string[];
  autoRegister?: boolean;
  activityTimeoutMs?: number; // Time before workspace becomes inactive
  cleanupIntervalMs?: number; // How often to check for status updates
}

export class WorkspaceRegistry {
  private globalDb: GlobalDatabaseService;
  private options: Required<WorkspaceRegistryOptions>;
  private activityTimers = new Map<string, NodeJS.Timeout>();
  private scanInterval?: NodeJS.Timeout;

  constructor(drizzleDb: DrizzleDatabaseManager, options: WorkspaceRegistryOptions = {}) {
    this.globalDb = new GlobalDatabaseService(drizzleDb);
    this.options = {
      scanPaths: options.scanPaths || [],
      autoRegister: options.autoRegister || false,
      activityTimeoutMs: options.activityTimeoutMs || 5 * 60 * 1000, // 5 minutes
      cleanupIntervalMs: options.cleanupIntervalMs || 60 * 1000 // 1 minute
    };
  }

  /**
   * Start the workspace registry service
   */
  async start(): Promise<void> {
    console.log('Starting Workspace Registry service...');
    
    // Initial scan if auto-register is enabled
    if (this.options.autoRegister && this.options.scanPaths.length > 0) {
      await this.scanAndRegisterWorkspaces();
    }

    // Start periodic cleanup
    this.scanInterval = setInterval(async () => {
      await this.updateWorkspaceStatuses();
    }, this.options.cleanupIntervalMs);

    console.log(`Workspace Registry started with ${this.options.scanPaths.length} scan paths`);
  }

  /**
   * Stop the workspace registry service
   */
  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }

    // Clear all activity timers
    for (const timer of this.activityTimers.values()) {
      clearTimeout(timer);
    }
    this.activityTimers.clear();

    console.log('Workspace Registry stopped');
  }

  /**
   * Register a workspace in the global registry
   */
  async registerWorkspace(workspacePath: string, name?: string): Promise<string> {
    const resolvedPath = resolve(workspacePath);
    
    // Check if workspace already exists
    const existing = await this.globalDb.getWorkspaceByPath(resolvedPath);

    if (existing) {
      console.log(`Workspace already registered: ${resolvedPath}`);
      return existing.id;
    }

    // Generate workspace metadata
    const workspaceId = uuidv4();
    const workspaceName = name || this.extractWorkspaceName(resolvedPath);
    const now = new Date().toISOString();

    // Determine initial status
    const status = this.checkWorkspaceHealth(resolvedPath);

    // Create workspace using Drizzle ORM
    const workspace = await this.globalDb.createWorkspace({
      id: workspaceId,
      path: resolvedPath,
      name: workspaceName,
      status,
      createdAt: now,
      updatedAt: now,
      lastActivity: now,
      taskCount: 0,
      activeTask: null
    });

    console.log(`Registered workspace: ${workspaceName} at ${resolvedPath}`);
    
    // Start activity monitoring
    this.startActivityMonitoring(workspaceId);

    return workspace.id;
  }

  /**
   * Update workspace activity (called when workspace is accessed)
   */
  async updateWorkspaceActivity(workspaceId: string): Promise<void> {
    await this.globalDb.updateWorkspaceActivity(workspaceId);

    // Reset activity timer
    this.startActivityMonitoring(workspaceId);
  }

  /**
   * Update workspace activity by path
   */
  async updateWorkspaceActivityByPath(workspacePath: string): Promise<void> {
    const resolvedPath = resolve(workspacePath);
    const workspace = await this.globalDb.getWorkspaceByPath(resolvedPath);

    if (workspace) {
      await this.updateWorkspaceActivity(workspace.id);
    }
  }

  /**
   * Get all registered workspaces
   */
  async getAllWorkspaces(): Promise<WorkspaceMetadata[]> {
    const workspaces = await this.globalDb.getAllWorkspaces();

    return workspaces.map((ws: Workspace) => ({
      id: ws.id,
      path: ws.path,
      name: ws.name,
      status: ws.status as 'connected' | 'disconnected' | 'error',
      lastActivity: new Date(ws.lastActivity || ws.createdAt || new Date().toISOString()),
      isActive: ws.status === 'active',
      taskCount: ws.taskCount || 0,
      activeTask: ws.activeTask
    }));
  }

  /**
   * Get workspace by path
   */
  async getWorkspaceByPath(workspacePath: string): Promise<WorkspaceMetadata | null> {
    const resolvedPath = resolve(workspacePath);
    const workspace = await this.globalDb.getWorkspaceByPath(resolvedPath);

    if (!workspace) {
      return null;
    }

    return {
      id: workspace.id,
      path: workspace.path,
      name: workspace.name,
      status: workspace.status as 'connected' | 'disconnected' | 'error',
      lastActivity: new Date(workspace.lastActivity || workspace.createdAt || new Date().toISOString()),
      isActive: workspace.status === 'active',
      taskCount: workspace.taskCount || 0,
      activeTask: workspace.activeTask
    };
  }

  /**
   * Scan specified paths for Specly workspaces and register them
   */
  async scanAndRegisterWorkspaces(): Promise<string[]> {
    const registeredIds: string[] = [];

    for (const scanPath of this.options.scanPaths) {
      try {
        const workspacePaths = await this.scanForWorkspaces(scanPath);
        
        for (const workspacePath of workspacePaths) {
          try {
            const workspaceId = await this.registerWorkspace(workspacePath);
            registeredIds.push(workspaceId);
          } catch (error) {
            console.warn(`Failed to register workspace at ${workspacePath}:`, error);
          }
        }
      } catch (error) {
        console.warn(`Failed to scan path ${scanPath}:`, error);
      }
    }

    return registeredIds;
  }

  /**
   * Scan a directory for Specly workspaces
   */
  private async scanForWorkspaces(basePath: string): Promise<string[]> {
    const workspaces: string[] = [];

    if (!existsSync(basePath)) {
      return workspaces;
    }

    try {
      const entries = readdirSync(basePath);
      
      for (const entry of entries) {
        const fullPath = join(basePath, entry);
        
        try {
          const stat = statSync(fullPath);
          
          if (stat.isDirectory()) {
            // Check if this directory is a Specly workspace
            if (this.isSpeclyWorkspace(fullPath)) {
              workspaces.push(fullPath);
            }
            
            // Recursively scan subdirectories (max depth 2 to avoid performance issues)
            if (fullPath.split('/').length - basePath.split('/').length < 3) {
              const subWorkspaces = await this.scanForWorkspaces(fullPath);
              workspaces.push(...subWorkspaces);
            }
          }
        } catch (error) {
          // Skip entries that can't be accessed
          continue;
        }
      }
    } catch (error) {
      console.warn(`Cannot scan directory ${basePath}:`, error);
    }

    return workspaces;
  }

  /**
   * Check if a directory is a Specly workspace
   */
  private isSpeclyWorkspace(dirPath: string): boolean {
    // Look for .task directory
    const taskDir = join(dirPath, '.task');
    if (existsSync(taskDir)) {
      return true;
    }

    // Look for .specly directory
    const speclyDir = join(dirPath, '.specly');
    if (existsSync(speclyDir)) {
      return true;
    }

    return false;
  }

  /**
   * Extract workspace name from path
   */
  private extractWorkspaceName(workspacePath: string): string {
    const parts = workspacePath.split('/');
    return parts[parts.length - 1] || 'workspace';
  }

  /**
   * Check workspace health status
   */
  private checkWorkspaceHealth(workspacePath: string): 'active' | 'idle' | 'inactive' | 'disconnected' | 'error' {
    try {
      if (!existsSync(workspacePath)) {
        return 'error';
      }

      if (this.isSpeclyWorkspace(workspacePath)) {
        return 'disconnected'; // Exists but not currently active
      }

      return 'error';
    } catch (error) {
      return 'error';
    }
  }

  /**
   * Start activity monitoring for a workspace
   */
  private startActivityMonitoring(workspaceId: string): void {
    // Clear existing timer
    const existingTimer = this.activityTimers.get(workspaceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      try {
        await this.globalDb.updateWorkspace(workspaceId, {
          status: 'inactive',
          updatedAt: new Date().toISOString()
        });
        
        this.activityTimers.delete(workspaceId);
        console.log(`Workspace ${workspaceId} marked as inactive due to timeout`);
      } catch (error) {
        console.error(`Failed to update workspace ${workspaceId} status:`, error);
      }
    }, this.options.activityTimeoutMs);

    this.activityTimers.set(workspaceId, timer);
  }

  /**
   * Update workspace statuses periodically
   */
  private async updateWorkspaceStatuses(): Promise<void> {
    try {
      const workspaces = await this.getAllWorkspaces();
      
      for (const workspace of workspaces) {
        const status = this.checkWorkspaceHealth(workspace.path);
        
        if (workspace.status !== status) {
          await this.globalDb.updateWorkspace(workspace.id, {
            status,
            updatedAt: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Error updating workspace statuses:', error);
    }
  }

  /**
   * Remove workspace from registry
   */
  async unregisterWorkspace(workspaceId: string): Promise<void> {
    // Clear activity timer
    const timer = this.activityTimers.get(workspaceId);
    if (timer) {
      clearTimeout(timer);
      this.activityTimers.delete(workspaceId);
    }

    // Remove from database
    await this.globalDb.deleteWorkspace(workspaceId);
    
    console.log(`Unregistered workspace: ${workspaceId}`);
  }

  /**
   * Get workspace statistics
   */
  async getWorkspaceStats(): Promise<{
    total: number;
    active: number;
    connected: number;
    disconnected: number;
    error: number;
  }> {
    const allWorkspaces = await this.globalDb.getAllWorkspaces();

    return {
      total: allWorkspaces.length,
      active: allWorkspaces.filter(ws => ws.status === 'active').length,
      connected: allWorkspaces.filter(ws => ws.status === 'active' || ws.status === 'idle').length,
      disconnected: allWorkspaces.filter(ws => ws.status === 'disconnected' || ws.status === 'inactive').length,
      error: allWorkspaces.filter(ws => ws.status === 'error').length
    };
  }
}
