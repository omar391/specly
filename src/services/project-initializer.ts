import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../database/connection.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { getGlobalDatabase } from '../database/drizzle-connection.js';
import type { Task } from '../types/index.js';
import { SeedManager } from './seed-manager.js';
import { workspaces, sessions, workspaceRulesNew, type Workspace, type NewWorkspace, type NewSession } from '../database/schema/global-schema.js';
import { tasks, type Task as DrizzleTask, type NewTask } from '../database/schema/workspace-schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';

// Database representation of Task (with JSON fields as strings)
interface DatabaseTask {
  id: string;
  title: string;
  description?: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Backlog' | 'In-Progress' | 'Blocked' | 'Review' | 'Done' | 'Dropped';
  progress: number;
  parent_task_id?: string;
  blocked_by_task_id?: string;
  connected_files: string; // JSON string in database
  notes?: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

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
  initialTasks: Task[];
  workspaceRulesCreated: boolean;
  isEmpty?: boolean;
}

/**
 * ProjectInitializer Service
 * 
 * Handles the initialization of new TaskPilot projects including:
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
   * Initialize a new TaskPilot project
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
        initialTasks: [], // No initial tasks created during init
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
   * Create initial project tasks based on requirements and tech stack
   */
  private async createInitialTasks(workspaceId: string, requirements: string, techStack: string): Promise<Task[]> {
    // CRITICAL FIX: Get workspace from global DB to get the workspace path
    const globalDb = getGlobalDatabase();
    const workspace = await globalDb.getDb().select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .get();

    if (!workspace) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }

    // Import and initialize the workspace database service for the correct workspace
    const { getWorkspaceDatabase, initializeWorkspaceDatabase } = await import('../database/drizzle-connection.js');
    const workspaceDb = await initializeWorkspaceDatabase(workspace.path);

    const initialTasks: Partial<DatabaseTask>[] = [
      {
        id: this.generateTaskId(),
        title: 'Project Setup and Configuration',
        description: `Set up initial project structure and configuration for ${techStack} development environment. Includes package management with bun, build tools, and development dependencies setup.`,
        priority: 'High',
        status: 'Backlog',
        progress: 0,
        workspace_id: workspaceId,
        connected_files: JSON.stringify(['package.json', 'bun.lockb', 'tsconfig.json', '.gitignore', 'README.md']),
        notes: 'Foundation task for project initialization - use bun for package management'
      },
      {
        id: this.generateTaskId(),
        title: 'Requirements Analysis and Documentation',
        description: `Analyze and document project requirements: ${requirements}. Create detailed specifications and architectural decisions.`,
        priority: 'High',
        status: 'Backlog',
        progress: 0,
        workspace_id: workspaceId,
        connected_files: JSON.stringify(['docs/requirements.md', 'docs/architecture.md']),
        notes: 'Critical for project planning and scope definition'
      },
      {
        id: this.generateTaskId(),
        title: 'Development Environment Setup',
        description: `Configure development environment for ${techStack}. Set up linting, formatting, testing frameworks, and development workflows.`,
        priority: 'Medium',
        status: 'Backlog',
        progress: 0,
        workspace_id: workspaceId,
        connected_files: JSON.stringify(['.eslintrc.js', '.prettierrc', 'jest.config.js']),
        notes: 'Ensures consistent development practices'
      }
    ];

    // Add tech-stack specific tasks
    if (techStack.toLowerCase().includes('react')) {
      initialTasks.push({
        id: this.generateTaskId(),
        title: 'React Application Structure',
        description: 'Set up React application structure with components, routing, and state management.',
        priority: 'Medium',
        status: 'Backlog',
        progress: 0,
        workspace_id: workspaceId,
        connected_files: JSON.stringify(['src/App.tsx', 'src/components/', 'src/pages/']),
        notes: 'React-specific setup'
      });
    }

    if (techStack.toLowerCase().includes('node') || techStack.toLowerCase().includes('typescript')) {
      initialTasks.push({
        id: this.generateTaskId(),
        title: 'Node.js/TypeScript Backend Setup',
        description: 'Configure Node.js backend with TypeScript, Express/Fastify, and database connections.',
        priority: 'Medium',
        status: 'Backlog',
        progress: 0,
        workspace_id: workspaceId,
        connected_files: JSON.stringify(['src/index.ts', 'src/routes/', 'src/services/']),
        notes: 'Backend foundation'
      });
    }

    // Insert tasks into WORKSPACE database using correct Drizzle connection
    const createdTasks: Task[] = [];
    for (const task of initialTasks) {
      const taskData: NewTask = {
        id: task.id!,
        title: task.title!,
        description: task.description,
        priority: (task.priority as 'High' | 'Medium' | 'Low')?.toLowerCase() as 'high' | 'medium' | 'low' || 'medium',
        status: (task.status as 'Backlog' | 'In-Progress' | 'Blocked' | 'Review' | 'Done' | 'Dropped')?.toLowerCase().replace('-', '-') as 'backlog' | 'in-progress' | 'blocked' | 'review' | 'done' | 'dropped' || 'backlog',
        progress: task.progress || 0,
        dependencies: JSON.stringify([]),
        notes: task.notes,
        connectedFiles: JSON.stringify(task.connected_files ? JSON.parse(task.connected_files) : []),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null
      };

      await workspaceDb.getDb().insert(tasks).values(taskData);

      // Fetch the created task from workspace database
      const dbTask = await workspaceDb.getDb().select()
        .from(tasks)
        .where(eq(tasks.id, task.id!))
        .get();
      
      if (dbTask) {
        // Convert database task to API task format - mapping Drizzle types to legacy API types
        const apiTask: Task = {
          id: dbTask.id,
          title: dbTask.title,
          description: dbTask.description || undefined,
          priority: (dbTask.priority ?
            (dbTask.priority.charAt(0).toUpperCase() + dbTask.priority.slice(1)) as 'High' | 'Medium' | 'Low'
            : 'Medium'),
          status: (dbTask.status ?
            dbTask.status.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-') as 'Backlog' | 'In-Progress' | 'Blocked' | 'Review' | 'Done' | 'Dropped'
            : 'Backlog'),
          progress: dbTask.progress || 0,
          connected_files: Array.isArray(dbTask.connectedFiles) ? dbTask.connectedFiles : [],
          notes: dbTask.notes || undefined,
          workspace_id: workspaceId, // Add workspace_id from method parameter
          created_at: dbTask.createdAt || new Date().toISOString(),
          updated_at: dbTask.updatedAt || new Date().toISOString(),
          completed_at: dbTask.completedAt || undefined
        };
        createdTasks.push(apiTask);
      }
    }

    return createdTasks;
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
   * Generate task ID with TP prefix
   */
  private generateTaskId(): string {
    // Generate a simple incremental ID (in production, this could be more sophisticated)
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 900) + 100;
    return `TP-${timestamp}${random}`;
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

    // Preserve existing tasks if requested
    let existingTasks: Task[] = [];
    if (preserveTasks) {
      const dbTasks = await workspaceDb.getDb().select()
        .from(tasks)
        .all();
      
      // Convert database tasks to API format
      existingTasks = dbTasks.map((dbTask: DrizzleTask) => ({
        id: dbTask.id,
        title: dbTask.title,
        description: dbTask.description || undefined,
        priority: (dbTask.priority ?
          (dbTask.priority.charAt(0).toUpperCase() + dbTask.priority.slice(1)) as 'High' | 'Medium' | 'Low'
          : 'Medium'),
        status: (dbTask.status ?
          dbTask.status.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join('-') as 'Backlog' | 'In-Progress' | 'Blocked' | 'Review' | 'Done' | 'Dropped'
          : 'Backlog'),
        progress: dbTask.progress || 0,
        connected_files: Array.isArray(dbTask.connectedFiles) ? dbTask.connectedFiles : [],
        notes: dbTask.notes || undefined,
        workspace_id: workspace.id,
        created_at: dbTask.createdAt || new Date().toISOString(),
        updated_at: dbTask.updatedAt || new Date().toISOString(),
        completed_at: dbTask.completedAt || undefined
      }));
    } else {
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
      initialTasks: existingTasks,
      workspaceRulesCreated
    };
  }
}
