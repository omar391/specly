import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'hono';
import { WorkspacesController } from '../api/workspaces.js';
import { DatabaseService } from '../services/database-service.js';

// Mock dependencies
vi.mock('../services/database-service.js');

describe('WorkspacesController', () => {
  let mockDatabaseService: any;
  let mockGlobalDb: any;
  let mockWorkspaceDb: any;
  let mockContext: Partial<Context>;
  let controller: WorkspacesController;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGlobalDb = {
      getAllWorkspaces: vi.fn(),
      getWorkspace: vi.fn()
    };

    mockWorkspaceDb = {
      getAllTasks: vi.fn()
    };

    mockDatabaseService = {
      getGlobal: vi.fn().mockReturnValue(mockGlobalDb),
      getWorkspace: vi.fn().mockResolvedValue(mockWorkspaceDb)
    };

    mockContext = {
      json: vi.fn()
    };

    (DatabaseService as any).mockImplementation(() => mockDatabaseService);
    controller = new WorkspacesController(mockDatabaseService);
  });

  describe('getWorkspaces', () => {
    it('returns empty workspaces list when no workspaces exist', async () => {
      mockGlobalDb.getAllWorkspaces.mockResolvedValue([]);

      await controller.getWorkspaces(mockContext as Context);

      expect(mockGlobalDb.getAllWorkspaces).toHaveBeenCalled();
      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [] }
      });
    });

    it('returns enriched workspace data for single workspace', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        lastActivity: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const mockTasks = [
        { id: 'task-1', title: 'Task 1', status: 'completed', priority: 'high', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'task-2', title: 'Task 2', status: 'in_progress', priority: 'medium', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'task-3', title: 'Task 3', status: 'in_progress', priority: 'low', updatedAt: '2024-01-01T00:00:00Z' }
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue([mockWorkspace]);
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      await controller.getWorkspaces(mockContext as Context);

      expect(mockGlobalDb.getAllWorkspaces).toHaveBeenCalled();
      expect(mockDatabaseService.getWorkspace).toHaveBeenCalledWith('/path/to/workspace');
      expect(mockWorkspaceDb.getAllTasks).toHaveBeenCalled();

      const expectedWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        last_activity: '2024-01-01T00:00:00Z',
        task_count: 2, // 2 non-completed tasks
        active_task: 'Task 2', // highest priority in-progress task (medium before low)
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [expectedWorkspace] }
      });
    });

    it('handles workspace with no active tasks', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        lastActivity: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const mockTasks = [
        { id: 'task-1', title: 'Task 1', status: 'completed', priority: 'high' },
        { id: 'task-2', title: 'Task 2', status: 'failed', priority: 'medium' }
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue([mockWorkspace]);
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      await controller.getWorkspaces(mockContext as Context);

      const expectedWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        last_activity: '2024-01-01T00:00:00Z',
        task_count: 0, // no active tasks
        active_task: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [expectedWorkspace] }
      });
    });

    it('prioritizes high priority tasks over medium and low', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        lastActivity: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const mockTasks = [
        { id: 'task-1', title: 'High Priority', status: 'in_progress', priority: 'high', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'task-2', title: 'Medium Priority', status: 'in_progress', priority: 'medium', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'task-3', title: 'Low Priority', status: 'in_progress', priority: 'low', updatedAt: '2024-01-01T00:00:00Z' }
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue([mockWorkspace]);
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      await controller.getWorkspaces(mockContext as Context);

      const expectedWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        last_activity: '2024-01-01T00:00:00Z',
        task_count: 3,
        active_task: 'High Priority', // highest priority wins
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [expectedWorkspace] }
      });
    });

    it('falls back to most recently updated when same priority', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        lastActivity: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const mockTasks = [
        { id: 'task-1', title: 'Older Task', status: 'in_progress', priority: 'medium', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'task-2', title: 'Newer Task', status: 'in_progress', priority: 'medium', updatedAt: '2024-01-01T01:00:00Z' }
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue([mockWorkspace]);
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      await controller.getWorkspaces(mockContext as Context);

      const expectedWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        last_activity: '2024-01-01T00:00:00Z',
        task_count: 2,
        active_task: 'Newer Task', // most recently updated wins
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [expectedWorkspace] }
      });
    });

    it('handles workspace database access errors gracefully', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        lastActivity: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      mockGlobalDb.getAllWorkspaces.mockResolvedValue([mockWorkspace]);
      mockDatabaseService.getWorkspace.mockRejectedValue(new Error('Database access failed'));

      await controller.getWorkspaces(mockContext as Context);

      const expectedWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'error',
        last_activity: '2024-01-01T00:00:00Z',
        task_count: 0,
        active_task: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [expectedWorkspace] }
      });
    });

    it('handles multiple workspaces with mixed success and errors', async () => {
      const mockWorkspaces = [
        {
          id: 'workspace-1',
          name: 'Working Workspace',
          path: '/path/to/workspace1',
          status: 'active',
          lastActivity: '2024-01-01T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 'workspace-2',
          name: 'Broken Workspace',
          path: '/path/to/workspace2',
          status: 'active',
          lastActivity: '2024-01-01T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue(mockWorkspaces);

      // First workspace succeeds
      mockWorkspaceDb.getAllTasks.mockResolvedValueOnce([
        { id: 'task-1', title: 'Task 1', status: 'in_progress', priority: 'high' }
      ]);

      // Second workspace fails
      mockDatabaseService.getWorkspace.mockImplementation((path: string) => {
        if (path === '/path/to/workspace1') {
          return Promise.resolve(mockWorkspaceDb);
        } else {
          return Promise.reject(new Error('Access denied'));
        }
      });

      await controller.getWorkspaces(mockContext as Context);

      expect(mockContext.json).toHaveBeenCalledWith({
        data: {
          workspaces: [
            {
              id: 'workspace-1',
              name: 'Working Workspace',
              path: '/path/to/workspace1',
              status: 'active',
              last_activity: '2024-01-01T00:00:00Z',
              task_count: 1,
              active_task: 'Task 1',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z'
            },
            {
              id: 'workspace-2',
              name: 'Broken Workspace',
              path: '/path/to/workspace2',
              status: 'error',
              last_activity: '2024-01-01T00:00:00Z',
              task_count: 0,
              active_task: null,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z'
            }
          ]
        }
      });
    });

    it('handles null/undefined priority values', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        lastActivity: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const mockTasks = [
        { id: 'task-1', title: 'No Priority', status: 'in_progress', priority: null, updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'task-2', title: 'Undefined Priority', status: 'in_progress', priority: undefined, updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'task-3', title: 'Valid Priority', status: 'in_progress', priority: 'low', updatedAt: '2024-01-01T00:00:00Z' }
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue([mockWorkspace]);
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      await controller.getWorkspaces(mockContext as Context);

      const expectedWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        last_activity: '2024-01-01T00:00:00Z',
        task_count: 3,
        active_task: 'No Priority', // null/undefined priority defaults to 'medium', same as 'medium'
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [expectedWorkspace] }
      });
    });

    it('handles null/undefined updatedAt values in sorting', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        lastActivity: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const mockTasks = [
        { id: 'task-1', title: 'No Timestamp', status: 'in_progress', priority: 'medium', updatedAt: null },
        { id: 'task-2', title: 'Old Timestamp', status: 'in_progress', priority: 'medium', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'task-3', title: 'New Timestamp', status: 'in_progress', priority: 'medium', updatedAt: '2024-01-01T01:00:00Z' }
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue([mockWorkspace]);
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      await controller.getWorkspaces(mockContext as Context);

      const expectedWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        last_activity: '2024-01-01T00:00:00Z',
        task_count: 3,
        active_task: 'New Timestamp', // most recent timestamp wins
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [expectedWorkspace] }
      });
    });

    it('handles workspace with null status', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: null,
        lastActivity: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const mockTasks = [
        { id: 'task-1', title: 'Task 1', status: 'in_progress', priority: 'high' }
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue([mockWorkspace]);
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      await controller.getWorkspaces(mockContext as Context);

      const expectedWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'disconnected', // null || 'disconnected'
        last_activity: '2024-01-01T00:00:00Z',
        task_count: 1,
        active_task: 'Task 1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [expectedWorkspace] }
      });
    });

    it('handles tasks with unknown priority values', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        lastActivity: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const mockTasks = [
        { id: 'task-1', title: 'Unknown Priority', status: 'in_progress', priority: 'critical', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'task-2', title: 'High Priority', status: 'in_progress', priority: 'high', updatedAt: '2024-01-01T00:00:00Z' }
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue([mockWorkspace]);
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      await controller.getWorkspaces(mockContext as Context);

      const expectedWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        last_activity: '2024-01-01T00:00:00Z',
        task_count: 2,
        active_task: 'High Priority', // high (1) beats critical (4)
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [expectedWorkspace] }
      });
    });

    it('handles tasks with same priority and same updatedAt', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        lastActivity: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const mockTasks = [
        { id: 'task-1', title: 'Task 1', status: 'in_progress', priority: 'medium', updatedAt: '2024-01-01T01:00:00Z' },
        { id: 'task-2', title: 'Task 2', status: 'in_progress', priority: 'medium', updatedAt: '2024-01-01T01:00:00Z' },
        { id: 'task-3', title: 'Task 3', status: 'in_progress', priority: 'medium', updatedAt: '2024-01-01T00:00:00Z' }
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue([mockWorkspace]);
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      await controller.getWorkspaces(mockContext as Context);

      const expectedWorkspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        status: 'active',
        last_activity: '2024-01-01T00:00:00Z',
        task_count: 3,
        active_task: 'Task 1', // same time, stable sort, first in array
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(mockContext.json).toHaveBeenCalledWith({
        data: { workspaces: [expectedWorkspace] }
      });
    });

  });

  describe('getWorkspaceById', () => {
    it('returns workspace when found', async () => {
      const mockWorkspace = { id: 'workspace-1', name: 'Test Workspace' };
      mockGlobalDb.getWorkspace.mockResolvedValue(mockWorkspace);

      const result = await controller.getWorkspaceById('workspace-1');

      expect(mockGlobalDb.getWorkspace).toHaveBeenCalledWith('workspace-1');
      expect(result).toEqual(mockWorkspace);
    });

    it('throws NotFoundError when workspace not found', async () => {
      mockGlobalDb.getWorkspace.mockResolvedValue(null);

      await expect(controller.getWorkspaceById('nonexistent')).rejects.toThrow('Workspace not found: nonexistent');
    });
  });
});