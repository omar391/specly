import { v4 as uuidv4 } from 'uuid';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { getGlobalDatabase } from '../database/drizzle-connection.js';
import { SeedManager } from './seed-manager.js';
import { workspaces, sessions, workspaceRulesNew, type Workspace, type NewWorkspace, type NewSession } from '../database/schema/global-schema.js';
import { tasks } from '../database/schema/workspace-schema.js';
import { eq, sql } from 'drizzle-orm';

// Remove legacy DB Task representation; initializer will not create legacy-shaped tasks

export interface ProjectInitializationInput {
  workspace_path: string;
  project_requirements: string;
  tech_stack: string;
  project_name: string;
}

export interface ProjectInitializationResult {
  workspace: {
    id: string;
    path: string;
    name: string;
  };
  workspaceRulesCreated: boolean;
  isEmpty?: boolean;
}

/**
 * ProjectInitializer Service
 * 
 * Handles the initialization of new Specly projects including:
 * - Workspace setup and configuration
 * - Initial task creation
 * - Workspace rules establishment
 * - Standard project structure setup
 */
export class ProjectInitializer {
  private seedManager: SeedManager;

  constructor(private drizzleManager: DrizzleDatabaseManager) {
    this.seedManager = new SeedManager(drizzleManager);
  }

  /**
   * Initialize a new Specly project
   */
  async initializeProject(input: ProjectInitializationInput): Promise<ProjectInitializationResult> {
    const { workspace_path, project_requirements, tech_stack, project_name } = input;

    try {
      // Step 1: Create or ensure workspace exists
      const workspace = await this.ensureWorkspace(workspace_path, project_name);

      // Step 2: Initialize database structure (no initial tasks created here)
      await this.initializeWorkspaceDatabase(workspace.id, workspace_path);

      // Step 3: Check if project is empty or needs reinitialization  
      const isEmpty = await this.checkIfProjectIsEmpty(workspace_path);

      // Step 4: Create initial session
      await this.createInitialSession(workspace.id);

      return {
        workspace: {
          id: workspace.id,
          path: workspace.path,
          name: workspace.name
        },
        workspaceRulesCreated: false, // Will be handled by init_feedback flow
        isEmpty
      };
    } catch (error) {
      console.error('Error initializing project:', error);
      throw error;
    }
  }

  /**
   * Initialize workspace database structure
   */
  private async initializeWorkspaceDatabase(workspaceId: string, workspacePath: string): Promise<void> {
    // Import and initialize the workspace database service for the workspace
    const { initializeWorkspaceDatabase } = await import('../database/drizzle-connection.js');
    await initializeWorkspaceDatabase(workspacePath);
  }

  /**
   * Check if project is empty (for determining init flow)
   */
  private async checkIfProjectIsEmpty(workspacePath: string): Promise<boolean> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const entries = await fs.readdir(workspacePath);
      // Consider project empty if only has common build/config files
      const meaningfulFiles = entries.filter(entry =>
        !entry.startsWith('.') &&
        !['node_modules', 'package.json', 'package-lock.json', 'bun.lockb',
          'tsconfig.json', 'README.md', 'build', 'dist'].includes(entry)
      );
      return meaningfulFiles.length === 0;
    } catch (error) {
      // If directory doesn't exist or can't be read, consider it empty
      return true;
    }
  }

  /**
   * Ensure workspace exists, create if necessary
   */
  private async ensureWorkspace(workspacePath: string, projectName: string): Promise<Workspace> {
    const globalDb = getGlobalDatabase();

    // Check if workspace already exists
    let workspace = await globalDb.getDb().select()
      .from(workspaces)
      .where(eq(workspaces.path, workspacePath))
      .get();

    if (!workspace) {
      // Create new workspace
      const workspaceId = uuidv4();
      const currentTime = new Date().toISOString();
      
      const newWorkspaceData: NewWorkspace = {
        id: workspaceId,
        path: workspacePath,
        name: projectName,
        status: 'active',
        createdAt: currentTime,
        updatedAt: currentTime,
        lastActivity: currentTime,
        taskCount: 0
      };

      await globalDb.getDb().insert(workspaces).values(newWorkspaceData);

      workspace = await globalDb.getDb().select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .get();
    } else {
      // Update existing workspace
      const currentTime = new Date().toISOString();
      
      await globalDb.getDb().update(workspaces)
        .set({
          name: projectName,
          status: 'active',
          lastActivity: currentTime,
          updatedAt: currentTime
        })
        .where(eq(workspaces.id, workspace.id));

      workspace = await globalDb.getDb().select()
        .from(workspaces)
        .where(eq(workspaces.id, workspace.id))
        .get();
    }

    return workspace!;
  }


  /**
   * Create workspace-specific rules based on tech stack
   */
  private async createWorkspaceRules(workspaceId: string, techStack: string): Promise<boolean> {
    try {
      // Get workspace from global DB to get the workspace path
      const globalDb = getGlobalDatabase();
      const workspace = await globalDb.getDb().select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .get();

      if (!workspace) {
        throw new Error(`Workspace with ID ${workspaceId} not found`);
      }

      // Store a summarized rule entry into new workspace_rules table (Specly schema)
      const ruleId = uuidv4();
      await globalDb.getDb().insert(workspaceRulesNew).values({
        id: ruleId,
        workspaceId: workspace.id,
        relation: 'always-do',
        rule: `Adopt ${techStack} best practices and maintain consistent code style.`,
        originalText: `Auto-generated initial workspace rule set for tech stack: ${techStack}`,
        confidence: 1,
        active: true,
        createdAt: new Date().toISOString(),
        lastReinforcedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Error creating workspace rules:', error);
      return false;
    }
  }

  /**
   * Create initial session for the workspace
   */
  private async createInitialSession(workspaceId: string): Promise<void> {
    const globalDb = getGlobalDatabase();

    // Deactivate any existing sessions using Drizzle
    await globalDb.getDb().update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.workspaceId, workspaceId));

    // Create new session using Drizzle
    const sessionId = uuidv4();
    const currentTime = new Date().toISOString();

    const sessionData: NewSession = {
      id: sessionId,
      workspaceId: workspaceId,
      createdAt: currentTime,
      lastActivity: currentTime,
      isActive: true
    };

    await globalDb.getDb().insert(sessions).values(sessionData);
  }

  /**
   * Check if workspace is already initialized
   */
  async isWorkspaceInitialized(workspacePath: string): Promise<boolean> {
    const globalDb = getGlobalDatabase();

    const workspace = await globalDb.getDb().select()
      .from(workspaces)
      .where(eq(workspaces.path, workspacePath))
      .get();

    if (!workspace) {
      return false;
    }

    // Check if workspace has tasks and rules using workspace database
    const { initializeWorkspaceDatabase } = await import('../database/drizzle-connection.js');
    const workspaceDb = await initializeWorkspaceDatabase(workspace.path);

    const taskCountResult = await workspaceDb.getDb().select({ count: sql<number>`COUNT(*)` })
      .from(tasks)
      .get();

    // Determine initialized status by presence of at least one workspace rule in new global workspace_rules table
    const existingRules = await globalDb.getDb().select().from(workspaceRulesNew).where(eq(workspaceRulesNew.workspaceId, workspace.id));
    return (taskCountResult?.count || 0) > 0 && existingRules.length > 0;
  }

  /**
   * Reinitialize existing workspace (useful for project updates)
   */
  async reinitializeWorkspace(workspacePath: string, preserveTasks: boolean = true): Promise<ProjectInitializationResult> {
    const globalDb = getGlobalDatabase();

    const workspace = await globalDb.getDb().select()
      .from(workspaces)
      .where(eq(workspaces.path, workspacePath))
      .get();

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspacePath}`);
    }

    // Use correct workspace database for task operations
    const { initializeWorkspaceDatabase } = await import('../database/drizzle-connection.js');
    const workspaceDb = await initializeWorkspaceDatabase(workspace.path);

    // Preserve existing tasks branch removed; initializer no longer returns tasks
    if (!preserveTasks) {
      // Clear existing tasks from workspace database
      await workspaceDb.getDb().delete(tasks);
    }

    // Update workspace rules
    const workspaceRulesCreated = await this.createWorkspaceRules(workspace.id, 'Updated Configuration');

    // Create new session
    await this.createInitialSession(workspace.id);

    return {
      workspace: {
        id: workspace.id,
        path: workspace.path,
        name: workspace.name
      },
      // No task list returned; Specly-only initializer concerns workspaces/rules/sessions
      workspaceRulesCreated
    };
  }
}
