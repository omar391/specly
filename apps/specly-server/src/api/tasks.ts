/**
 * Tasks API Routes
 * GET /api/workspaces/{id}/tasks - Get tasks for workspace
 * POST /api/workspaces/{id}/tasks - Create new task
 * PUT /api/workspaces/{id}/tasks/{taskId} - Update task
 */

import type { Context } from 'hono';
import { DatabaseService } from '../services/database-service.js';
import { TasksResponse, Task, CreateTaskRequest, UpdateTaskRequest, TasksQueryParams } from './types.js';
import { createSuccessResponse, createErrorResponse, NotFoundError, ValidationError, BadRequestError } from './middleware.js';
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
  async getTasks(c: Context) {
    try {
      const { workspaceId } = c.req.param();
      const query: TasksQueryParams = c.req.query();

      // Verify workspace exists
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);

      // Build SQL query based on filters
      const limit = query.limit ? Math.min(Number(query.limit), 100) : 50; // Max 100, default 50
      const offset = Number(query.offset) || 0;
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

      return c.json(createSuccessResponse(response));
    } catch (error) {
      console.error('Error fetching tasks:', error);
      throw error;
    }
  }

  /**
   * POST /api/workspaces/{workspaceId}/tasks
   * Create a new task in the workspace
   */
  async createTask(c: Context) {
    try {
      const { workspaceId } = c.req.param();
      const taskData: CreateTaskRequest = await c.req.json();

      // Validate required fields
      if (!taskData.title?.trim()) {
        return c.json(createErrorResponse('VALIDATION_ERROR', 'Task title is required'), 422);
      }
      if (!taskData.description?.trim()) {
        return c.json(createErrorResponse('VALIDATION_ERROR', 'Task description is required'), 422);
      }
      if (!['high', 'medium', 'low'].includes(taskData.priority)) {
        return c.json(createErrorResponse('VALIDATION_ERROR', 'Priority must be high, medium, or low'), 422);
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

      return c.json(createSuccessResponse({ task: responseTask }), 201);
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  /**
   * GET /api/workspaces/{workspaceId}/tasks/{taskId}
   * Fetch a single task
   */
  async getTask(c: Context) {
    try {
      const { workspaceId, taskId } = c.req.param();
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const task = await workspaceDb.getTask(taskId);
      if (!task) {
        return c.json(createErrorResponse('NOT_FOUND', `Task not found: ${taskId}`), 404);
      }
      return c.json(createSuccessResponse({ task: this.mapTaskDbToApi(task) }));
    } catch (error) {
      console.error('Error fetching task:', error);
      throw error;
    }
  }

  /**
   * PATCH /api/workspaces/{workspaceId}/tasks/{taskId}/status
   * Update task status with validation and dependency guardrails
   */
  async patchTaskStatus(c: Context) {
    try {
      const { workspaceId, taskId } = c.req.param();
      const { status } = await c.req.json() as { status?: string };
      if (!status || typeof status !== 'string') {
        return c.json(createErrorResponse('VALIDATION_ERROR', 'Status is required'), 422);
      }
      try {
        assertValidStatus(status);
      } catch (e: any) {
        return c.json(createErrorResponse('VALIDATION_ERROR', e?.message || 'Invalid status value'), 422);
      }
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const existingTask = await workspaceDb.getTask(taskId);
      if (!existingTask) {
        return c.json(createErrorResponse('NOT_FOUND', `Task not found: ${taskId}`), 404);
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
        return c.json(createErrorResponse('VALIDATION_ERROR', check.reason || `Invalid status transition: ${fromSpecly} -> ${status}`), 422);
      }
      const now = new Date().toISOString();
      const updates: any = { status, updatedAt: now };
      if (status === 'completed') {
        updates.completedAt = now;
      }
      await workspaceDb.updateTask(taskId, updates);
      const updatedTask = await workspaceDb.getTask(taskId);
      return c.json(createSuccessResponse({ task: this.mapTaskDbToApi(updatedTask) }));
    } catch (error) {
      console.error('Error updating task status:', error);
      throw error;
    }
  }

  /**
   * POST /api/workspaces/{workspaceId}/tasks/{taskId}/dependencies
   */
  async addDependency(c: Context) {
    try {
      const { workspaceId, taskId } = c.req.param();
      const { depends_on } = await c.req.json() as { depends_on?: string };
      if (!depends_on) { return c.json(createErrorResponse('VALIDATION_ERROR', 'depends_on is required'), 422); }
      if (depends_on === taskId) { return c.json(createErrorResponse('VALIDATION_ERROR', 'Task cannot depend on itself'), 422); }
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      // Ensure both tasks exist
      const t1 = await workspaceDb.getTask(taskId);
      const t2 = await workspaceDb.getTask(depends_on);
      if (!t1) { return c.json(createErrorResponse('NOT_FOUND', `Task not found: ${taskId}`), 404); }
      if (!t2) { return c.json(createErrorResponse('NOT_FOUND', `Task not found: ${depends_on}`), 404); }
      // Cycle detection: check if there is a path from depends_on to taskId
      const seen = new Set<string>();
      const stack = [depends_on];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === taskId) {
          return c.json(createErrorResponse('VALIDATION_ERROR', 'Dependency would create a cycle'), 422);
        }
        if (seen.has(cur)) continue;
        seen.add(cur);
        const edges = await workspaceDb.listTaskDependencies(cur);
        for (const e of edges) stack.push(e.depends_on_task_id);
      }
      await workspaceDb.addTaskDependency(taskId, depends_on);
      return c.json(createSuccessResponse({ task_id: taskId, depends_on }), 201);
    } catch (error) {
      console.error('Error adding dependency:', error);
      throw error;
    }
  }

  /**
   * DELETE /api/workspaces/{workspaceId}/tasks/{taskId}/dependencies/:dependsOn
   */
  async removeDependency(c: Context) {
    try {
      const { workspaceId, taskId, dependsOn } = c.req.param();
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      await workspaceDb.removeTaskDependency(taskId, dependsOn);
      c.status(204);
      return c.body(null);
    } catch (error) {
      console.error('Error removing dependency:', error);
      throw error;
    }
  }

  /**
   * GET /api/workspaces/{workspaceId}/tasks/{taskId}/dependencies
   */
  async listDependencies(c: Context) {
    try {
      const { workspaceId, taskId } = c.req.param();
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const deps = await workspaceDb.listTaskDependencies(taskId);
      return c.json(createSuccessResponse({ task_id: taskId, dependencies: deps }));
    } catch (error) {
      console.error('Error listing dependencies:', error);
      throw error;
    }
  }

  /**
   * PUT /api/workspaces/{workspaceId}/tasks/{taskId}
   * Update a task property
   */
  async updateTask(c: Context) {
    try {
      const { workspaceId, taskId } = c.req.param();
      const updateData: UpdateTaskRequest = await c.req.json();

      // Validate required fields
      if (!updateData.field) {
        return c.json(createErrorResponse('VALIDATION_ERROR', 'Field to update is required'), 422);
      }
      if (updateData.value === undefined || updateData.value === null) {
        return c.json(createErrorResponse('VALIDATION_ERROR', 'Value is required'), 422);
      }
      if (!updateData.reason?.trim()) {
        return c.json(createErrorResponse('VALIDATION_ERROR', 'Reason for update is required'), 422);
      }

      // Verify workspace exists
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);

      // Verify task exists
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const existingTask = await workspaceDb.getTask(taskId);

      if (!existingTask) {
        return c.json(createErrorResponse('NOT_FOUND', `Task not found: ${taskId}`), 404);
      }

      // Validate field and value
      const allowedFields = ['title', 'description', 'priority', 'status', 'progress', 'notes'];
      if (!allowedFields.includes(updateData.field)) {
        return c.json(createErrorResponse('VALIDATION_ERROR', `Invalid field: ${updateData.field}`), 422);
      }

      // Validate specific field values
      if (updateData.field === 'priority' && !['high', 'medium', 'low'].includes(updateData.value as string)) {
        return c.json(createErrorResponse('VALIDATION_ERROR', 'Priority must be high, medium, or low'), 422);
      }

      if (updateData.field === 'status' && !['queued', 'in_progress', 'awaiting_input', 'blocked', 'paused', 'completed', 'failed'].includes((updateData.value as string))) {
        return c.json(createErrorResponse('VALIDATION_ERROR', 'Invalid status value'), 422);
      }

      if (updateData.field === 'progress') {
        const progress = Number(updateData.value);
        if (isNaN(progress) || progress < 0 || progress > 100) {
          return c.json(createErrorResponse('VALIDATION_ERROR', 'Progress must be a number between 0 and 100'), 422);
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

      return c.json(createSuccessResponse({
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
