/**
 * Tasks API Routes
 * GET /api/workspaces/{id}/tasks - Get tasks for workspace
 * POST /api/workspaces/{id}/tasks - Create new task
 * PUT /api/workspaces/{id}/tasks/{taskId} - Update task
 */

import { Request, Response } from 'express';
import { DatabaseService } from '../services/database-service.js';
import { TasksResponse, Task, CreateTaskRequest, UpdateTaskRequest, TasksQueryParams } from './types.js';
import { createSuccessResponse, createErrorResponse, NotFoundError, ValidationError } from './middleware.js';
import { WorkspacesController } from './workspaces.js';
import { assertValidStatus, canTransition } from '../utils/task-status.js';

export class TasksController {
  constructor(
    private databaseService: DatabaseService,
    private workspacesController: WorkspacesController
  ) { }

  // Private helper to map DB task row (camelCase from Drizzle) to API Task shape (snake_case)
  private mapTaskDbToApi(task: any): Task {
    // Support both camelCase (Drizzle) and snake_case (raw) just in case
    const get = (camel: string, snake: string) => task?.[camel] ?? task?.[snake] ?? null;
    const dbStatus = get('status', 'status') as string | null;
    const publicStatus = (dbStatus ?? 'queued') as any;
    return {
      id: task.id,
      title: task.title,
      description: get('description', 'description') ?? '',
      priority: get('priority', 'priority') ?? 'medium',
      status: publicStatus as any,
      progress: get('progress', 'progress') ?? 0,
      // Specly-first class fields
      assets: get('assets', 'assets') ?? [],
      external_references: get('externalReferences', 'external_references') ?? [],
      metadata: get('metadata', 'metadata') ?? {},
      tags: get('tags', 'tags') ?? [],
      notes: get('notes', 'notes'),
      created_at: get('createdAt', 'created_at'),
      updated_at: get('updatedAt', 'updated_at'),
      completed_at: get('completedAt', 'completed_at'),
    } as Task;
  }

  /**
   * GET /api/workspaces/{workspaceId}/tasks
   * Get all tasks for a workspace with optional filtering
   */
  async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId } = req.params;
      const query: TasksQueryParams = req.query;

      // Verify workspace exists
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);

      // Build SQL query based on filters
      const limit = query.limit ? Math.min(query.limit, 100) : 50; // Max 100, default 50
      const offset = query.offset || 0;
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const tasks = await workspaceDb.getTasksPaginated(query.status, limit, offset);
      const total = await workspaceDb.countTasks(query.status);
      const transformedTasks: Task[] = tasks.map((task: any) => this.mapTaskDbToApi(task));

      const response: TasksResponse = {
        tasks: transformedTasks,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          path: workspace.path
        },
        total,
        page: Math.floor(offset / limit) + 1
      };


      // Only one response object needed, already declared above.
      res.json(createSuccessResponse(response));
    } catch (error) {
      console.error('Error fetching tasks:', error);
      throw error;
    }
  }

  /**
   * POST /api/workspaces/{workspaceId}/tasks
   * Create a new task in the workspace
   */
  async createTask(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId } = req.params;
      const taskData: CreateTaskRequest = req.body;

      // Validate required fields
      if (!taskData.title?.trim()) {
        throw new ValidationError('Task title is required');
      }
      if (!taskData.description?.trim()) {
        throw new ValidationError('Task description is required');
      }
      if (!['high', 'medium', 'low'].includes(taskData.priority)) {
        throw new ValidationError('Priority must be high, medium, or low');
      }

      // Verify workspace exists
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);

      // Generate task ID and timestamp
      const taskId = `TP-${Date.now().toString().slice(-6)}`;
      const now = new Date().toISOString();

      // Insert new task into tasks_new (Specly model)
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const createdTask = await workspaceDb.createTask({
        id: taskId,
        title: taskData.title.trim(),
        description: taskData.description.trim(),
        priority: taskData.priority as 'high' | 'medium' | 'low',
        status: 'queued',
        progress: 0,
        assets: (taskData as any).assets ?? [],
        externalReferences: (taskData as any).external_references ?? [],
        metadata: (taskData as any).metadata ?? {},
        tags: (taskData as any).tags ?? [],
        createdAt: now,
        updatedAt: now
      } as any);

      if (!createdTask) {
        throw new Error('Failed to create task');
      }

      // Map DB result to camelCase for API response
      const responseTask: Task = this.mapTaskDbToApi(createdTask);

      res.status(201).json(createSuccessResponse({ task: responseTask }));
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  /**
   * GET /api/workspaces/{workspaceId}/tasks/{taskId}
   * Fetch a single task
   */
  async getTask(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId, taskId } = req.params as { workspaceId: string; taskId: string };
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const task = await workspaceDb.getTask(taskId);
      if (!task) {
        throw new NotFoundError(`Task not found: ${taskId}`);
      }
      res.json(createSuccessResponse({ task: this.mapTaskDbToApi(task) }));
    } catch (error) {
      console.error('Error fetching task:', error);
      throw error;
    }
  }

  /**
   * PATCH /api/workspaces/{workspaceId}/tasks/{taskId}/status
   * Update task status with validation and dependency guardrails
   */
  async patchTaskStatus(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId, taskId } = req.params as { workspaceId: string; taskId: string };
      const { status } = req.body as { status?: string };
      if (!status || typeof status !== 'string') {
        throw new ValidationError('Status is required');
      }
      try {
        assertValidStatus(status);
      } catch (e: any) {
        throw new ValidationError(e?.message || 'Invalid status value');
      }
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const existingTask = await workspaceDb.getTask(taskId);
      if (!existingTask) {
        throw new NotFoundError(`Task not found: ${taskId}`);
      }
      const fromSpecly: string = (existingTask.status as string) ?? 'queued';
      const deps = await workspaceDb.listTaskDependencies(taskId);
      let hasUnresolvedDeps = false;
      if (Array.isArray(deps) && deps.length > 0) {
        for (const d of deps) {
          const depTask = await workspaceDb.getTask(d.depends_on_task_id);
          if (!depTask || depTask.status !== 'completed') {
            hasUnresolvedDeps = true;
            break;
          }
        }
      }
      const check = canTransition(fromSpecly as any, status as any, { hasUnresolvedDependencies: hasUnresolvedDeps });
      if (!check.ok) {
        throw new ValidationError(check.reason || `Invalid status transition: ${fromSpecly} -> ${status}`);
      }
      const now = new Date().toISOString();
      const updates: any = { status, updatedAt: now };
      if (status === 'completed') {
        updates.completedAt = now;
      }
      await workspaceDb.updateTask(taskId, updates);
      const updatedTask = await workspaceDb.getTask(taskId);
      res.json(createSuccessResponse({ task: this.mapTaskDbToApi(updatedTask) }));
    } catch (error) {
      console.error('Error updating task status:', error);
      throw error;
    }
  }

  /**
   * POST /api/workspaces/{workspaceId}/tasks/{taskId}/dependencies
   */
  async addDependency(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId, taskId } = req.params as { workspaceId: string; taskId: string };
      const { depends_on } = req.body as { depends_on?: string };
      if (!depends_on) { throw new ValidationError('depends_on is required'); }
      if (depends_on === taskId) { throw new ValidationError('Task cannot depend on itself'); }
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      // Ensure both tasks exist
      const t1 = await workspaceDb.getTask(taskId);
      const t2 = await workspaceDb.getTask(depends_on);
      if (!t1) { throw new NotFoundError(`Task not found: ${taskId}`); }
      if (!t2) { throw new NotFoundError(`Task not found: ${depends_on}`); }
      // Cycle detection: check if there is a path from depends_on to taskId
      const seen = new Set<string>();
      const stack = [depends_on];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === taskId) {
          throw new ValidationError('Dependency would create a cycle');
        }
        if (seen.has(cur)) continue;
        seen.add(cur);
        const edges = await workspaceDb.listTaskDependencies(cur);
        for (const e of edges) stack.push(e.depends_on_task_id);
      }
      await workspaceDb.addTaskDependency(taskId, depends_on);
      res.status(201).json(createSuccessResponse({ task_id: taskId, depends_on }));
    } catch (error) {
      console.error('Error adding dependency:', error);
      throw error;
    }
  }

  /**
   * DELETE /api/workspaces/{workspaceId}/tasks/{taskId}/dependencies/:dependsOn
   */
  async removeDependency(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId, taskId, dependsOn } = req.params as { workspaceId: string; taskId: string; dependsOn: string };
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      await workspaceDb.removeTaskDependency(taskId, dependsOn);
      res.status(204).send();
    } catch (error) {
      console.error('Error removing dependency:', error);
      throw error;
    }
  }

  /**
   * GET /api/workspaces/{workspaceId}/tasks/{taskId}/dependencies
   */
  async listDependencies(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId, taskId } = req.params as { workspaceId: string; taskId: string };
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const deps = await workspaceDb.listTaskDependencies(taskId);
      res.json(createSuccessResponse({ task_id: taskId, dependencies: deps }));
    } catch (error) {
      console.error('Error listing dependencies:', error);
      throw error;
    }
  }

  /**
   * PUT /api/workspaces/{workspaceId}/tasks/{taskId}
   * Update a task property
   */
  async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId, taskId } = req.params;
      const updateData: UpdateTaskRequest = req.body;

      // Validate required fields
      if (!updateData.field) {
        throw new ValidationError('Field to update is required');
      }
      if (updateData.value === undefined || updateData.value === null) {
        throw new ValidationError('Value is required');
      }
      if (!updateData.reason?.trim()) {
        throw new ValidationError('Reason for update is required');
      }

      // Verify workspace exists
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);

      // Verify task exists
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const existingTask = await workspaceDb.getTask(taskId);

      if (!existingTask) {
        throw new NotFoundError(`Task not found: ${taskId}`);
      }

      // Validate field and value
      const allowedFields = ['title', 'description', 'priority', 'status', 'progress', 'notes'];
      if (!allowedFields.includes(updateData.field)) {
        throw new ValidationError(`Invalid field: ${updateData.field}`);
      }

      // Validate specific field values
      if (updateData.field === 'priority' && !['High', 'Medium', 'Low'].includes(updateData.value as string)) {
        throw new ValidationError('Priority must be High, Medium, or Low');
      }

      if (updateData.field === 'status' && !['queued', 'in_progress', 'awaiting_input', 'blocked', 'paused', 'completed', 'failed'].includes((updateData.value as string))) {
        throw new ValidationError('Invalid status value');
      }

      if (updateData.field === 'progress') {
        const progress = Number(updateData.value);
        if (isNaN(progress) || progress < 0 || progress > 100) {
          throw new ValidationError('Progress must be a number between 0 and 100');
        }
      }

      // Update task
      const now = new Date().toISOString();
      // Reuse workspaceDb, do not redeclare
      let updates: any = { [updateData.field]: updateData.value, updatedAt: now };
      if (updateData.field === 'status') {
        updates = { status: updateData.value, updatedAt: now };
        if (updateData.value === 'completed') {
          updates.completedAt = now;
        }
      }

      await workspaceDb.updateTask(taskId, updates);

      // Fetch updated task
      const updatedTask = await workspaceDb.getTask(taskId);

      if (!updatedTask) {
        throw new Error('Failed to update task');
      }

      res.json(createSuccessResponse({
        task: {
          id: (updatedTask as any).id,
          updatedAt: (updatedTask as any).updatedAt,
          [updateData.field]: (updatedTask as any)[updateData.field]
        }
      }));
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }
}
