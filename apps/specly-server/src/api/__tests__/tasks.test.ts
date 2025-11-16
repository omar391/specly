import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies at module level
vi.mock('../../services/database-service.js');
vi.mock('../../api/workspaces.js');
vi.mock('../../utils/task-status.js');

import { TasksController } from '../tasks.js';
import { DatabaseService } from '../../services/database-service.js';
import { WorkspacesController } from '../../api/workspaces.js';
import { canTransition, assertValidStatus } from '../../utils/task-status.js';

const mockDatabaseService = vi.mocked(DatabaseService);
const mockWorkspacesController = vi.mocked(WorkspacesController);
const mockCanTransition = vi.mocked(canTransition);
const mockAssertValidStatus = vi.mocked(assertValidStatus);

describe('TasksController', () => {
  let controller: TasksController;
  let mockWorkspaceDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCanTransition.mockReset();
    mockAssertValidStatus.mockReset();

    // Set up assertValidStatus to throw for invalid status
    mockAssertValidStatus.mockImplementation((status: string) => {
      if (status === 'invalid') {
        throw new Error('Invalid status value');
      }
      // For valid statuses, do nothing
    });

    // Create mock workspace database
    mockWorkspaceDb = {
      getTasksPaginated: vi.fn(),
      countTasks: vi.fn(),
      createTask: vi.fn(),
      getTask: vi.fn(),
      updateTask: vi.fn(),
      addTaskDependency: vi.fn(),
      removeTaskDependency: vi.fn(),
      listTaskDependencies: vi.fn()
    };

    // Set up mock implementations
    mockDatabaseService.prototype.getWorkspace = vi.fn().mockResolvedValue(mockWorkspaceDb);
    mockWorkspacesController.prototype.getWorkspaceById = vi.fn().mockResolvedValue({
      id: 'ws-1',
      name: 'Workspace 1',
      path: '/path/to/ws'
    });

    // Create controller instance
    controller = new TasksController(
      new mockDatabaseService(),
      new mockWorkspacesController()
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createTask', () => {
    it('should return 422 for missing title', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1' })),
          json: vi.fn().mockResolvedValue({
            description: 'desc',
            priority: 'high'
          })
        },
        json: vi.fn(),
      };

      await controller.createTask(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Task title is required'
          })
        }),
        422
      );
    });

    it('should return 422 for empty title', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1' })),
          json: vi.fn().mockResolvedValue({
            title: '   ',
            description: 'desc',
            priority: 'high'
          })
        },
        json: vi.fn(),
      };

      await controller.createTask(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Task title is required'
          })
        }),
        422
      );
    });

    it('should return 422 for missing description', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1' })),
          json: vi.fn().mockResolvedValue({
            title: 'title',
            priority: 'high'
          })
        },
        json: vi.fn(),
      };

      await controller.createTask(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Task description is required'
          })
        }),
        422
      );
    });

    it('should return 422 for empty description', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1' })),
          json: vi.fn().mockResolvedValue({
            title: 'title',
            description: '   ',
            priority: 'high'
          })
        },
        json: vi.fn(),
      };

      await controller.createTask(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Task description is required'
          })
        }),
        422
      );
    });

    it('should return 422 for invalid priority', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1' })),
          json: vi.fn().mockResolvedValue({
            title: 'title',
            description: 'desc',
            priority: 'invalid'
          })
        },
        json: vi.fn(),
      };

      await controller.createTask(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Priority must be high, medium, or low'
          })
        }),
        422
      );
    });

    it('should create task successfully', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1' })),
          json: vi.fn().mockResolvedValue({
            title: 'Test Task',
            description: 'Test Description',
            priority: 'high',
            assets: ['asset1'],
            external_references: ['ref1'],
            metadata: { key: 'value' },
            tags: ['tag1']
          })
        },
        json: vi.fn(),
      };

      mockWorkspaceDb.createTask.mockResolvedValue({
        id: 'TP-123456',
        title: 'Test Task',
        description: 'Test Description',
        priority: 'high',
        status: 'queued',
        progress: 0,
        assets: ['asset1'],
        externalReferences: ['ref1'],
        metadata: { key: 'value' },
        tags: ['tag1'],
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      });

      await controller.createTask(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            task: expect.objectContaining({
              id: 'TP-123456',
              title: 'Test Task'
            })
          })
        }),
        201
      );
    });
  });

  describe('getTasks', () => {
    it('should return tasks with pagination', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1' })),
          query: vi.fn(() => ({ limit: '10', offset: '5', status: 'in_progress' }))
        },
        json: vi.fn(),
      };

      mockWorkspaceDb.getTasksPaginated.mockResolvedValue([
        { id: 'task-1', title: 'Task 1', description: 'Desc 1', status: 'in_progress', priority: 'high', progress: 50, createdAt: '2023-01-01T00:00:00.000Z', updatedAt: '2023-01-01T00:00:00.000Z' }
      ]);
      mockWorkspaceDb.countTasks.mockResolvedValue(25);

      await controller.getTasks(mockCtx as any);

      expect(mockWorkspaceDb.getTasksPaginated).toHaveBeenCalledWith('in_progress', 10, 5);
      expect(mockWorkspaceDb.countTasks).toHaveBeenCalledWith('in_progress');
      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tasks: expect.arrayContaining([
              expect.objectContaining({ id: 'task-1', title: 'Task 1' })
            ]),
            total: 25,
            page: 1
          })
        })
      );
    });

    it('should use default pagination values', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1' })),
          query: vi.fn(() => ({}))
        },
        json: vi.fn(),
      };


      mockWorkspaceDb.getTasksPaginated.mockResolvedValue([]);
      mockWorkspaceDb.countTasks.mockResolvedValue(0);

      await controller.getTasks(mockCtx as any);

      expect(mockWorkspaceDb.getTasksPaginated).toHaveBeenCalledWith(undefined, 50, 0);
    });

    it('should cap limit at 100', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1' })),
          query: vi.fn(() => ({ limit: '200' }))
        },
        json: vi.fn(),
      };


      mockWorkspaceDb.getTasksPaginated.mockResolvedValue([]);
      mockWorkspaceDb.countTasks.mockResolvedValue(0);

      await controller.getTasks(mockCtx as any);

      expect(mockWorkspaceDb.getTasksPaginated).toHaveBeenCalledWith(undefined, 100, 0);
    });
  });

  describe('getTask', () => {
    it('should return a single task', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' }))
        },
        json: vi.fn(),
      };

      mockWorkspaceDb.getTask.mockResolvedValue({
        id: 'task-1',
        title: 'Task 1',
        description: 'Desc 1',
        status: 'queued',
        priority: 'medium',
        progress: 0,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      });

      await controller.getTask(mockCtx as any);

      expect(mockWorkspaceDb.getTask).toHaveBeenCalledWith('task-1');
      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            task: expect.objectContaining({ id: 'task-1', title: 'Task 1' })
          })
        })
      );
    });

    it('should return 404 for non-existent task', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' }))
        },
        json: vi.fn(),
      };

      mockWorkspaceDb.getTask.mockResolvedValue(null);

      await controller.getTask(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'NOT_FOUND',
            message: 'Task not found: task-1'
          })
        }),
        404
      );
    });
  });

  describe('patchTaskStatus', () => {
    it('should update task status successfully', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({ status: 'completed' })
        },
        json: vi.fn(),
      };

      mockWorkspaceDb.getTask.mockResolvedValueOnce({
        id: 'task-1',
        status: 'in_progress',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      });

      mockWorkspaceDb.listTaskDependencies.mockResolvedValue([]);
      mockCanTransition.mockReturnValue({ ok: true });
      mockWorkspaceDb.updateTask.mockResolvedValue(undefined);
      mockWorkspaceDb.getTask.mockResolvedValue({
        id: 'task-1',
        status: 'completed',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
        completedAt: '2023-01-02T00:00:00.000Z'
      });

      await controller.patchTaskStatus(mockCtx as any);

      expect(mockCanTransition).toHaveBeenCalledWith('in_progress', 'completed', { hasUnresolvedDependencies: false });
      expect(mockWorkspaceDb.updateTask).toHaveBeenCalledWith('task-1', expect.objectContaining({
        status: 'completed',
        completedAt: expect.any(String)
      }));
      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            task: expect.objectContaining({ status: 'completed' })
          })
        })
      );
    });

    it('should return 422 for missing status', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({})
        },
        json: vi.fn(),
      };

      await controller.patchTaskStatus(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Status is required'
          })
        }),
        422
      );
    });

    it('should return 422 for invalid status', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({ status: 'invalid' })
        },
        json: vi.fn(),
      };

      mockWorkspaceDb.getTask.mockResolvedValue({
        id: 'task-1',
        status: 'queued',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      });

      await controller.patchTaskStatus(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('Invalid status value')
          })
        }),
        422
      );
    });

    it('should return 404 for non-existent task', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({ status: 'completed' })
        },
        json: vi.fn(),
      };


      mockWorkspaceDb.getTask.mockResolvedValue(null);

      await controller.patchTaskStatus(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'NOT_FOUND',
            message: 'Task not found: task-1'
          })
        }),
        404
      );
    });

    it('should return 422 for invalid status transition', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({ status: 'completed' })
        },
        json: vi.fn(),
      };


      mockWorkspaceDb.getTask.mockResolvedValue({
        id: 'task-1',
        status: 'queued',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      });

      mockWorkspaceDb.listTaskDependencies.mockResolvedValue([]);
      mockCanTransition.mockReturnValue({ ok: false, reason: 'Invalid transition' });

      await controller.patchTaskStatus(mockCtx as any);

      expect(mockCanTransition).toHaveBeenCalledWith('queued', 'completed', { hasUnresolvedDependencies: false });
      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Invalid transition'
          })
        }),
        422
      );
    });

    it('should prevent transition when dependencies are unresolved', async () => {
      mockWorkspaceDb.getTask.mockImplementation((id) => {
        if (id === 'task-1') {
          return Promise.resolve({
            id: 'task-1',
            status: 'in_progress',
            createdAt: '2023-01-01T00:00:00.000Z',
            updatedAt: '2023-01-01T00:00:00.000Z'
          });
        } else if (id === 'dep-1') {
          return Promise.resolve({
            id: 'dep-1',
            status: 'queued', // Not completed
            createdAt: '2023-01-01T00:00:00.000Z',
            updatedAt: '2023-01-01T00:00:00.000Z'
          });
        }
        return Promise.resolve(null);
      });

      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({ status: 'completed' })
        },
        json: vi.fn(),
      };


      mockWorkspaceDb.listTaskDependencies.mockResolvedValue([
        { depends_on_task_id: 'dep-1' }
      ]);

      mockCanTransition.mockReturnValue({ ok: false, reason: 'Task has unresolved dependencies' });

      await controller.patchTaskStatus(mockCtx as any);

      expect(mockCanTransition).toHaveBeenCalledWith('in_progress', 'completed', { hasUnresolvedDependencies: true });
      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Task has unresolved dependencies'
          })
        }),
        422
      );
    });
  });

  describe('addDependency', () => {
    it('should add dependency successfully', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({ depends_on: 'task-2' })
        },
        json: vi.fn(),
      };

      mockWorkspaceDb.getTask
        .mockResolvedValueOnce({ id: 'task-1' })
        .mockResolvedValueOnce({ id: 'task-2' });

      mockWorkspaceDb.listTaskDependencies.mockResolvedValue([]);

      await controller.addDependency(mockCtx as any);

      expect(mockWorkspaceDb.addTaskDependency).toHaveBeenCalledWith('task-1', 'task-2');
      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            task_id: 'task-1',
            depends_on: 'task-2'
          })
        }),
        201
      );
    });

    it('should return 422 for missing depends_on', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({})
        },
        json: vi.fn(),
      };

      await controller.addDependency(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'depends_on is required'
          })
        }),
        422
      );
    });

    it('should return 422 for self-dependency', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({ depends_on: 'task-1' })
        },
        json: vi.fn(),
      };

      await controller.addDependency(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Task cannot depend on itself'
          })
        }),
        422
      );
    });

    it('should return 404 for non-existent task', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({ depends_on: 'task-2' })
        },
        json: vi.fn(),
      };


      mockWorkspaceDb.getTask.mockResolvedValueOnce(null);

      await controller.addDependency(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'NOT_FOUND',
            message: 'Task not found: task-1'
          })
        }),
        404
      );
    });

    it('should return 404 for non-existent dependency task', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({ depends_on: 'task-2' })
        },
        json: vi.fn(),
      };


      mockWorkspaceDb.getTask
        .mockResolvedValueOnce({ id: 'task-1' })
        .mockResolvedValueOnce(null);

      await controller.addDependency(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'NOT_FOUND',
            message: 'Task not found: task-2'
          })
        }),
        404
      );
    });

    it('should detect and prevent cycles', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1' })),
          json: vi.fn().mockResolvedValue({ depends_on: 'task-2' })
        },
        json: vi.fn(),
      };


      mockWorkspaceDb.getTask
        .mockResolvedValueOnce({ id: 'task-1' })
        .mockResolvedValueOnce({ id: 'task-2' });

      // Simulate cycle: task-2 depends on task-1
      mockWorkspaceDb.listTaskDependencies.mockResolvedValue([
        { depends_on_task_id: 'task-1' }
      ]);

      await controller.addDependency(mockCtx as any);

      expect(mockCtx.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Dependency would create a cycle'
          })
        }),
        422
      );
    });
  });

  describe('removeDependency', () => {
    it('should remove dependency successfully', async () => {
      const mockCtx = {
        req: {
          param: vi.fn(() => ({ workspaceId: 'ws-1', taskId: 'task-1', dependsOn: 'task-2' }))
        },
        status: vi.fn(),
        body: vi.fn(),
      };


      await controller.removeDependency(mockCtx as any);

      expect(mockWorkspaceDb.removeTaskDependency).toHaveBeenCalledWith('task-1', 'task-2');
      expect(mockCtx.status).toHaveBeenCalledWith(204);
      expect(mockCtx.body).toHaveBeenCalledWith(null);
    });
  });

  describe('mapTaskDbToApi', () => {
    it('should map DB task to API format with camelCase fields', () => {
      const dbTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test Description',
        status: 'queued',
        priority: 'high',
        progress: 50,
        assets: ['asset1'],
        externalReferences: ['ref1'],
        metadata: { key: 'value' },
        tags: ['tag1'],
        notes: 'Some notes',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T01:00:00.000Z',
        completedAt: null
      };

      const result = (controller as any).mapTaskDbToApi(dbTask);

      expect(result).toEqual({
        id: 'task-1',
        title: 'Test Task',
        description: 'Test Description',
        priority: 'high',
        status: 'queued',
        progress: 50,
        assets: ['asset1'],
        external_references: ['ref1'],
        metadata: { key: 'value' },
        tags: ['tag1'],
        notes: 'Some notes',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T01:00:00.000Z',
        completed_at: null
      });
    });

    it('should map DB task to API format with snake_case fields', () => {
      const dbTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test Description',
        status: 'queued',
        priority: 'high',
        progress: 50,
        assets: ['asset1'],
        external_references: ['ref1'],
        metadata: { key: 'value' },
        tags: ['tag1'],
        notes: 'Some notes',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T01:00:00.000Z',
        completed_at: null
      };

      const result = (controller as any).mapTaskDbToApi(dbTask);

      expect(result).toEqual({
        id: 'task-1',
        title: 'Test Task',
        description: 'Test Description',
        priority: 'high',
        status: 'queued',
        progress: 50,
        assets: ['asset1'],
        external_references: ['ref1'],
        metadata: { key: 'value' },
        tags: ['tag1'],
        notes: 'Some notes',
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T01:00:00.000Z',
        completed_at: null
      });
    });

    it('should handle null values and defaults', () => {
      const dbTask = {
        id: 'task-1',
        title: 'Test Task',
        status: null,
        priority: null,
        progress: null,
        assets: null,
        externalReferences: null,
        metadata: null,
        tags: null,
        notes: null,
        createdAt: null,
        updatedAt: null,
        completedAt: null
      };

      const result = (controller as any).mapTaskDbToApi(dbTask);

      expect(result).toEqual({
        id: 'task-1',
        title: 'Test Task',
        description: '',
        priority: 'medium',
        status: 'queued',
        progress: 0,
        assets: [],
        external_references: [],
        metadata: {},
        tags: [],
        notes: null,
        created_at: null,
        updated_at: null,
        completed_at: null
      });
    });
  });
});