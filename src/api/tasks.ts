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
import { v4 as uuidv4 } from 'uuid';

export class TasksController {
  constructor(
    private databaseService: DatabaseService,
    private workspacesController: WorkspacesController
  ) {}

  // Private helper to map DB task row (camelCase from Drizzle) to API Task shape (snake_case)
  private mapTaskDbToApi(task: any): Task {
    // Support both camelCase (Drizzle) and snake_case (raw) just in case
    const get = (camel: string, snake: string) => task?.[camel] ?? task?.[snake] ?? null;
    const parseJson = (value: any) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return []; }
      }
      return value ?? [];
    };
    return {
      id: task.id,
      title: task.title,
      description: get('description', 'description') ?? '',
      priority: get('priority', 'priority') ?? 'medium',
      status: get('status', 'status') ?? 'backlog',
      progress: get('progress', 'progress') ?? 0,
      parent_task_id: get('parentTaskId', 'parent_task_id'),
      blocked_by_task_id: get('blockedByTaskId', 'blocked_by_task_id'),
      connected_files: parseJson(get('connectedFiles', 'connected_files')),
      notes: get('notes', 'notes'),
      github_issue_number: get('githubIssueNumber', 'github_issue_number'),
      github_url: get('githubUrl', 'github_url'),
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

      // Transform tasks (parse connected_files JSON)

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
      if (!['High', 'Medium', 'Low'].includes(taskData.priority)) {
        throw new ValidationError('Priority must be High, Medium, or Low');
      }

      // Verify workspace exists
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);

      // Generate task ID and timestamp
      const taskId = `TP-${Date.now().toString().slice(-6)}`;
      const now = new Date().toISOString();

      // Verify parent task exists if specified
      if (taskData.parent_task_id) {
        const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
        const parentTask = await workspaceDb.getTask(taskData.parent_task_id);

        if (!parentTask) {
          throw new ValidationError(`Parent task not found: ${taskData.parent_task_id}`);
        }
      }

      // Insert new task
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      // Prepare DB object in snake_case
      const dbTask = {
        id: taskId,
        title: taskData.title.trim(),
        description: taskData.description.trim(),
        priority: (taskData.priority ? taskData.priority.toLowerCase() : undefined) as 'high' | 'medium' | 'low' | null | undefined,
        status: 'backlog' as 'backlog',
        progress: 0,
        parent_task_id: taskData.parent_task_id || null,
        connected_files: '[]',
        created_at: now,
        updated_at: now,
        notes: null,
        github_issue_number: null,
        github_url: null,
        blocked_by_task_id: null,
        completed_at: null,
      };

      const createdTask = await workspaceDb.createTask(dbTask as any);

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
      // Verify workspace exists
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
   * Update task status with simple allowed transitions
   */
  async patchTaskStatus(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId, taskId } = req.params as { workspaceId: string; taskId: string };
      const { status } = req.body as { status?: string };
      if (!status || typeof status !== 'string') {
        throw new ValidationError('Status is required');
      }
      const allowedStatuses = ['backlog', 'in-progress', 'blocked', 'review', 'done', 'dropped'];
      if (!allowedStatuses.includes(status)) {
        throw new ValidationError(`Invalid status value: ${status}`);
      }
      // Verify workspace & task
      const workspace = await this.workspacesController.getWorkspaceById(workspaceId);
      const workspaceDb = await this.databaseService.getWorkspace(workspace.path);
      const existingTask = await workspaceDb.getTask(taskId);
      if (!existingTask) {
        throw new NotFoundError(`Task not found: ${taskId}`);
      }
      const from: string = existingTask.status ?? 'backlog';
      // Define minimal allowed transitions
      const canTransition: Record<string, string[]> = {
        'backlog': ['in-progress', 'dropped'],
        'in-progress': ['blocked', 'review', 'done', 'dropped'],
        'blocked': ['in-progress', 'dropped'],
        'review': ['in-progress', 'done', 'dropped'],
        'done': [],
        'dropped': []
      };
      if (!canTransition[from] || !canTransition[from].includes(status)) {
        throw new ValidationError(`Invalid status transition: ${from} -> ${status}`);
      }
      const now = new Date().toISOString();
      const updates: any = { status, updatedAt: now };
      if (status === 'done') {
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

      if (updateData.field === 'status' && !['Backlog', 'In-Progress', 'Blocked', 'Review', 'Done', 'Dropped'].includes(updateData.value as string)) {
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
      let updates: any = { [updateData.field]: updateData.value, updated_at: now };
      if (updateData.field === 'status' && updateData.value === 'Done') {
        updates.completed_at = now;
      }

      await workspaceDb.updateTask(taskId, updates);

      // Fetch updated task
      const updatedTask = await workspaceDb.getTask(taskId);

      if (!updatedTask) {
        throw new Error('Failed to update task');
      }

      res.json(createSuccessResponse({
        task: {
          id: updatedTask.id,
          updatedAt: updatedTask.updatedAt,
          [updateData.field]: updatedTask[updateData.field]
        }
      }));
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }
}
