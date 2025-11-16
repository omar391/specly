import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkspaceDatabaseService, getWorkspaceDatabaseService, initializeWorkspaceDatabaseService } from '../database/workspace-queries.js';
import type { Task, NewTask, GithubConfig, NewGithubConfig, RemoteInterface, NewRemoteInterface } from '../database/schema/workspace-schema.js';

// Create comprehensive mock for DrizzleORM query builder with fluent interface
const createMockQueryBuilder = () => {
  const mock = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    returning: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    onConflictDoNothing: vi.fn()
  };

  // Setup chaining for most methods
  mock.select.mockReturnValue(mock);
  mock.from.mockReturnValue(mock);
  mock.where.mockReturnValue(mock);
  mock.insert.mockReturnValue(mock);
  mock.values.mockReturnValue(mock);
  mock.update.mockReturnValue(mock);
  mock.set.mockReturnValue(mock);
  mock.delete.mockReturnValue(mock); // delete() also returns the builder for .where()
  mock.orderBy.mockReturnValue(mock);
  mock.limit.mockReturnValue(mock);
  mock.offset.mockReturnValue(mock);
  mock.onConflictDoNothing.mockReturnValue(mock);

  return mock;
};

// Mock DrizzleDatabaseManager
const mockDbManager = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn(),
  transaction: vi.fn(),
  initialized: true
};

// Mock getWorkspaceDatabase
vi.mock('../database/drizzle-connection.js', () => ({
  getWorkspaceDatabase: vi.fn(() => mockDbManager),
  DrizzleDatabaseManager: vi.fn()
}));

describe('WorkspaceDatabaseService', () => {
  let service: WorkspaceDatabaseService;
  let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryBuilder = createMockQueryBuilder();
    mockDbManager.getDb.mockReturnValue(mockQueryBuilder);
    service = new WorkspaceDatabaseService('/test/workspace');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor & Initialization', () => {
    it('should create service with workspace path', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(WorkspaceDatabaseService);
    });

    it('should use custom dbInstance if provided', () => {
      const customDb = { ...mockDbManager };
      const customService = new WorkspaceDatabaseService('/test', customDb as any);
      
      expect(customService).toBeDefined();
    });

    it('should initialize database', async () => {
      await service.initialize();
      
      expect(mockDbManager.initialize).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', async () => {
      mockDbManager.initialize.mockRejectedValueOnce(new Error('DB init failed'));
      
      await expect(service.initialize()).rejects.toThrow('DB init failed');
    });
  });

  describe('Task Operations - CRUD', () => {
    const mockTask: Task = {
      id: 'task-1',
      title: 'Test Task',
      description: 'Test description',
      status: 'queued',
      priority: 'medium',
      progress: 0,
      notes: 'Test notes',
      assets: [],
      externalReferences: [],
      metadata: {},
      tags: ['test'],
      profileVersionId: null,
      blockedReason: null,
      deletedAt: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      completedAt: null
    };

    describe('createTask', () => {
      it('should create task successfully', async () => {
        mockQueryBuilder.returning.mockResolvedValue([mockTask]);

        const newTask: NewTask = {
          id: 'task-1',
          title: 'Test Task',
          status: 'queued',
          priority: 'medium',
          progress: 0
        };

        const result = await service.createTask(newTask);

        expect(mockQueryBuilder.insert).toHaveBeenCalled();
        expect(mockQueryBuilder.values).toHaveBeenCalledWith(newTask);
        expect(mockQueryBuilder.returning).toHaveBeenCalled();
        expect(result).toEqual(mockTask);
      });

      it('should create task with all optional fields', async () => {
        const fullTask: NewTask = {
          id: 'task-2',
          title: 'Full Task',
          description: 'Full description',
          status: 'in_progress',
          priority: 'high',
          progress: 50,
          notes: 'Notes',
          assets: ['file1.ts', 'file2.ts'],
          externalReferences: ['ref1'],
          metadata: { key: 'value' },
          tags: ['tag1', 'tag2']
        };
        mockQueryBuilder.returning.mockResolvedValue([{ ...fullTask, createdAt: '2024-01-01', updatedAt: '2024-01-01' }]);

        const result = await service.createTask(fullTask);

        expect(mockQueryBuilder.values).toHaveBeenCalledWith(fullTask);
        expect(result).toBeDefined();
      });

      it('should fall back to selecting row when returning() throws', async () => {
        const newTask: NewTask = {
          id: 'task-3',
          title: 'Fallback Task',
          status: 'queued',
          priority: 'low',
          progress: 0
        };
        // Make returning() throw on the first call, to force the fallback path
        mockQueryBuilder.returning.mockImplementationOnce(() => { throw new Error('returning not supported'); });
        // Emulate that the second insert (fallback path) succeeded; the select should return the created row
        mockQueryBuilder.limit.mockResolvedValue([{ id: 'task-3', title: 'Fallback Task', status: 'queued', priority: 'low', progress: 0, description: undefined, notes: undefined, assets: [], externalReferences: [], metadata: {}, tags: [], profileVersionId: null, blockedReason: null, deletedAt: null, createdAt: '2024-01-01', updatedAt: '2024-01-01', completedAt: null } as any]);

        const result = await service.createTask(newTask);

        expect(result).toBeDefined();
        expect(result.id).toBe('task-3');
      });
    });

    describe('getTask', () => {
      it('should return task when exists', async () => {
        mockQueryBuilder.limit.mockResolvedValue([mockTask]);

        const result = await service.getTask('task-1');

        expect(mockQueryBuilder.where).toHaveBeenCalled();
        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(1);
        expect(result).toEqual(mockTask);
      });

      it('should return null when task not found', async () => {
        mockQueryBuilder.limit.mockResolvedValue([]);

        const result = await service.getTask('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('updateTask', () => {
      it('should update task when exists', async () => {
        const updatedTask = { ...mockTask, title: 'Updated Title' };
        mockQueryBuilder.returning.mockResolvedValue([updatedTask]);

        const result = await service.updateTask('task-1', { title: 'Updated Title' });

        expect(mockQueryBuilder.update).toHaveBeenCalled();
        expect(mockQueryBuilder.set).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Updated Title',
            updatedAt: expect.any(String)
          })
        );
        expect(result).toEqual(updatedTask);
      });

      it('should return null when task not found', async () => {
        mockQueryBuilder.returning.mockResolvedValue([]);

        const result = await service.updateTask('nonexistent', { title: 'Test' });

        expect(result).toBeNull();
      });

      it('should set updatedAt timestamp', async () => {
        mockQueryBuilder.returning.mockResolvedValue([mockTask]);
        const beforeTime = Date.now();

        await service.updateTask('task-1', { progress: 50 });

        const setCall = mockQueryBuilder.set.mock.calls[0][0];
        const updatedTime = new Date(setCall.updatedAt).getTime();
        expect(updatedTime).toBeGreaterThanOrEqual(beforeTime);
        expect(updatedTime).toBeLessThanOrEqual(Date.now());
      });

      it('should handle partial updates', async () => {
        mockQueryBuilder.returning.mockResolvedValue([mockTask]);

        await service.updateTask('task-1', { status: 'completed', progress: 100 });

        expect(mockQueryBuilder.set).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'completed',
            progress: 100
          })
        );
      });
    });

    describe('deleteTask', () => {
      it('should return true when task deleted', async () => {
        mockQueryBuilder.where.mockResolvedValue({ changes: 1 });

        const result = await service.deleteTask('task-1');

        expect(mockQueryBuilder.delete).toHaveBeenCalled();
        expect(result).toBe(true);
      });

      it('should return false when task not found', async () => {
        mockQueryBuilder.where.mockResolvedValue({ changes: 0 });

        const result = await service.deleteTask('nonexistent');

        expect(result).toBe(false);
      });
    });

    describe('getAllTasks', () => {
      it('should return all tasks ordered by updatedAt DESC', async () => {
        const tasks = [mockTask, { ...mockTask, id: 'task-2' }];
        mockQueryBuilder.orderBy.mockResolvedValue(tasks);

        const result = await service.getAllTasks();

        expect(mockQueryBuilder.select).toHaveBeenCalled();
        expect(mockQueryBuilder.from).toHaveBeenCalled();
        expect(mockQueryBuilder.orderBy).toHaveBeenCalled();
        expect(result).toEqual(tasks);
      });

      it('should return empty array when no tasks', async () => {
        mockQueryBuilder.orderBy.mockResolvedValue([]);

        const result = await service.getAllTasks();

        expect(result).toEqual([]);
      });
    });
  });

  describe('Task Operations - Pagination & Filtering', () => {
    describe('getTasksPaginated', () => {
      it('should return all tasks when status is undefined', async () => {
        mockQueryBuilder.offset.mockResolvedValue([]);

        await service.getTasksPaginated(undefined, 10, 0);

        expect(mockQueryBuilder.where).toHaveBeenCalledWith(undefined);
        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
        expect(mockQueryBuilder.offset).toHaveBeenCalledWith(0);
      });

      it('should filter by current status', async () => {
        mockQueryBuilder.offset.mockResolvedValue([]);

        await service.getTasksPaginated('current', 10, 0);

        // Verify where was called (notInArray logic)
        expect(mockQueryBuilder.where).toHaveBeenCalled();
      });

      it('should filter by history status', async () => {
        mockQueryBuilder.offset.mockResolvedValue([]);

        await service.getTasksPaginated('history', 10, 0);

        // Verify where was called (inArray logic)
        expect(mockQueryBuilder.where).toHaveBeenCalled();
      });

      it('should filter by specific status', async () => {
        mockQueryBuilder.offset.mockResolvedValue([]);

        await service.getTasksPaginated('in_progress', 10, 0);

        // Verify where was called (eq logic)
        expect(mockQueryBuilder.where).toHaveBeenCalled();
      });

      it('should apply pagination correctly', async () => {
        mockQueryBuilder.offset.mockResolvedValue([]);

        await service.getTasksPaginated(undefined, 5, 10);

        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(5);
        expect(mockQueryBuilder.offset).toHaveBeenCalledWith(10);
      });
    });

    describe('countTasks', () => {
      it('should count all tasks when status undefined', async () => {
        mockQueryBuilder.where.mockResolvedValue([{ total: 42 }]);

        const result = await service.countTasks(undefined);

        expect(result).toBe(42);
      });

      it('should count current tasks', async () => {
        mockQueryBuilder.where.mockResolvedValue([{ total: 10 }]);

        const result = await service.countTasks('current');

        expect(mockQueryBuilder.where).toHaveBeenCalled();
        expect(result).toBe(10);
      });

      it('should count history tasks', async () => {
        mockQueryBuilder.where.mockResolvedValue([{ total: 5 }]);

        const result = await service.countTasks('history');

        expect(result).toBe(5);
      });

      it('should count specific status', async () => {
        mockQueryBuilder.where.mockResolvedValue([{ total: 3 }]);

        const result = await service.countTasks('queued');

        expect(result).toBe(3);
      });

      it('should return 0 when result is null', async () => {
        mockQueryBuilder.where.mockResolvedValue([]);

        const result = await service.countTasks(undefined);

        expect(result).toBe(0);
      });

      it('should handle undefined total field', async () => {
        mockQueryBuilder.where.mockResolvedValue([{}]);

        const result = await service.countTasks(undefined);

        expect(result).toBe(0);
      });
    });
  });

  describe('Task Statistics & Focus', () => {
    describe('getTaskStatistics', () => {
      it('should calculate statistics correctly', async () => {
        const tasks = [
          { status: 'queued', priority: 'high' },
          { status: 'in_progress', priority: 'medium' },
          { status: 'completed', priority: 'low' },
          { status: 'completed', priority: 'high' }
        ];
        mockQueryBuilder.from.mockResolvedValue(tasks);

        const result = await service.getTaskStatistics();

        expect(result.total).toBe(4);
        expect(result.byStatus).toEqual({
          queued: 1,
          in_progress: 1,
          completed: 2
        });
        expect(result.byPriority).toEqual({
          high: 2,
          medium: 1,
          low: 1
        });
        expect(result.completionRate).toBe(50);
      });

      it('should return zero stats for empty database', async () => {
        mockQueryBuilder.from.mockResolvedValue([]);

        const result = await service.getTaskStatistics();

        expect(result.total).toBe(0);
        expect(result.byStatus).toEqual({});
        expect(result.byPriority).toEqual({});
        expect(result.completionRate).toBe(0);
      });

      it('should calculate 100% completion rate', async () => {
        const tasks = [
          { status: 'completed', priority: 'high' },
          { status: 'completed', priority: 'low' }
        ];
        mockQueryBuilder.from.mockResolvedValue(tasks);

        const result = await service.getTaskStatistics();

        expect(result.completionRate).toBe(100);
      });

      it('should handle tasks with null status/priority', async () => {
        const tasks = [
          { status: null, priority: null },
          { status: 'queued', priority: 'high' }
        ];
        mockQueryBuilder.from.mockResolvedValue(tasks);

        const result = await service.getTaskStatistics();

        expect(result.total).toBe(2);
        expect(result.byStatus).toEqual({ queued: 1 });
        expect(result.byPriority).toEqual({ high: 1 });
      });
    });

    describe('getFocusTasks', () => {
      it('should return high-priority in-progress tasks', async () => {
        const focusTasks = [{ id: 'task-1', status: 'in_progress', priority: 'high' }];
        mockQueryBuilder.orderBy.mockResolvedValue(focusTasks);

        const result = await service.getFocusTasks();

        expect(mockQueryBuilder.where).toHaveBeenCalled();
        expect(mockQueryBuilder.orderBy).toHaveBeenCalled();
        expect(result).toEqual(focusTasks);
      });

      it('should return empty array when no focus tasks', async () => {
        mockQueryBuilder.orderBy.mockResolvedValue([]);

        const result = await service.getFocusTasks();

        expect(result).toEqual([]);
      });
    });
  });

  describe('Task Dependency Operations', () => {
    it('should add task dependency', async () => {
      await service.addTaskDependency('task-1', 'task-2');

      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.values).toHaveBeenCalledWith({ taskId: 'task-1', dependsOnTaskId: 'task-2' });
      expect(mockQueryBuilder.onConflictDoNothing).toHaveBeenCalled();
    });

    it('should handle duplicate dependency silently', async () => {
      await service.addTaskDependency('task-1', 'task-2');
      
      // Should not throw on conflict
      expect(mockQueryBuilder.onConflictDoNothing).toHaveBeenCalled();
    });

    it('should remove task dependency when exists', async () => {
      mockQueryBuilder.where.mockResolvedValue({ changes: 1 });

      const result = await service.removeTaskDependency('task-1', 'task-2');

      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when dependency not found', async () => {
      mockQueryBuilder.where.mockResolvedValue({ changes: 0 });

      const result = await service.removeTaskDependency('task-1', 'task-2');

      expect(result).toBe(false);
    });

    it('should list task dependencies', async () => {
      mockQueryBuilder.where.mockResolvedValue([
        { dependsOnTaskId: 'task-2' },
        { dependsOnTaskId: 'task-3' }
      ]);

      const result = await service.listTaskDependencies('task-1');

      expect(result).toEqual([
        { depends_on_task_id: 'task-2' },
        { depends_on_task_id: 'task-3' }
      ]);
    });

    it('should return empty array when no dependencies', async () => {
      mockQueryBuilder.where.mockResolvedValue([]);

      const result = await service.listTaskDependencies('task-1');

      expect(result).toEqual([]);
    });
  });

  describe('GitHub Config Operations', () => {
    const mockConfig: GithubConfig = {
      id: 'config-1',
      repoUrl: 'https://github.com/testowner/testrepo',
      repoOwner: 'testowner',
      repoName: 'testrepo',
      githubToken: 'test-token',
      autoSync: false,
      syncDirection: 'bidirectional',
      lastSync: null,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    };

    it('should create GitHub config', async () => {
      mockQueryBuilder.returning.mockResolvedValue([mockConfig]);

      const newConfig: NewGithubConfig = {
        id: 'config-1',
        repoUrl: 'https://github.com/testowner/testrepo',
        repoOwner: 'testowner',
        repoName: 'testrepo',
        githubToken: 'test-token'
      };

      const result = await service.createGithubConfig(newConfig);

      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.values).toHaveBeenCalledWith(newConfig);
      expect(result).toEqual(mockConfig);
    });

    it('should get GitHub config', async () => {
      mockQueryBuilder.limit.mockResolvedValue([mockConfig]);

      const result = await service.getGithubConfig();

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockConfig);
    });

    it('should return null when no config exists', async () => {
      mockQueryBuilder.limit.mockResolvedValue([]);

      const result = await service.getGithubConfig();

      expect(result).toBeNull();
    });

    it('should update GitHub config', async () => {
      mockQueryBuilder.returning.mockResolvedValue([mockConfig]);

      const result = await service.updateGithubConfig('config-1', { githubToken: 'new-token' });

      expect(mockQueryBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          githubToken: 'new-token',
          updatedAt: expect.any(String)
        })
      );
      expect(result).toEqual(mockConfig);
    });

    it('should return null when updating nonexistent config', async () => {
      mockQueryBuilder.returning.mockResolvedValue([]);

      const result = await service.updateGithubConfig('nonexistent', { githubToken: 'test' });

      expect(result).toBeNull();
    });

    it('should delete GitHub config', async () => {
      mockQueryBuilder.where.mockResolvedValue({ changes: 1 });

      const result = await service.deleteGithubConfig('config-1');

      expect(result).toBe(true);
    });

    it('should return false when deleting nonexistent config', async () => {
      mockQueryBuilder.where.mockResolvedValue({ changes: 0 });

      const result = await service.deleteGithubConfig('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('Remote Interface Operations', () => {
    const mockInterface: RemoteInterface = {
      id: 'interface-1',
      name: 'Test API',
      interfaceType: 'custom',
      baseUrl: 'https://api.example.com',
      apiToken: 'secret-token',
      projectId: null,
      syncEnabled: true,
      syncDirection: 'bidirectional',
      fieldMappings: [],
      lastSync: null,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    };

    it('should create remote interface', async () => {
      mockQueryBuilder.returning.mockResolvedValue([mockInterface]);

      const newInterface: NewRemoteInterface = {
        id: 'interface-1',
        name: 'Test API',
        interfaceType: 'custom',
        baseUrl: 'https://api.example.com',
        apiToken: 'secret-token'
      };

      const result = await service.createRemoteInterface(newInterface);

      expect(mockQueryBuilder.values).toHaveBeenCalledWith(newInterface);
      expect(result).toEqual(mockInterface);
    });

    it('should create interface with metadata', async () => {
      const interfaceWithMetadata = {
        ...mockInterface,
        fieldMappings: [{ version: 'v2', auth: 'bearer' }]
      } as RemoteInterface;
      mockQueryBuilder.returning.mockResolvedValue([interfaceWithMetadata]);

      const result = await service.createRemoteInterface(interfaceWithMetadata);

      expect(result.fieldMappings).toEqual([{ version: 'v2', auth: 'bearer' }]);
    });

    it('should get remote interface by ID', async () => {
      mockQueryBuilder.limit.mockResolvedValue([mockInterface]);

      const result = await service.getRemoteInterface('interface-1');

      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(result).toEqual(mockInterface);
    });

    it('should return null when interface not found', async () => {
      mockQueryBuilder.limit.mockResolvedValue([]);

      const result = await service.getRemoteInterface('nonexistent');

      expect(result).toBeNull();
    });

    it('should get all remote interfaces', async () => {
      const interfaces = [mockInterface, { ...mockInterface, id: 'interface-2' }];
      mockQueryBuilder.orderBy.mockResolvedValue(interfaces);

      const result = await service.getAllRemoteInterfaces();

      expect(mockQueryBuilder.orderBy).toHaveBeenCalled();
      expect(result).toEqual(interfaces);
    });

    it('should return empty array when no interfaces', async () => {
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      const result = await service.getAllRemoteInterfaces();

      expect(result).toEqual([]);
    });

    it('should get interfaces by type', async () => {
      mockQueryBuilder.orderBy.mockResolvedValue([mockInterface]);

      const result = await service.getRemoteInterfacesByType('custom');

      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(result).toEqual([mockInterface]);
    });

    it('should return empty array for unknown type', async () => {
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      const result = await service.getRemoteInterfacesByType('unknown');

      expect(result).toEqual([]);
    });

    it('should update remote interface', async () => {
      mockQueryBuilder.returning.mockResolvedValue([mockInterface]);

      const result = await service.updateRemoteInterface('interface-1', { name: 'Updated API' });

      expect(mockQueryBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated API',
          updatedAt: expect.any(String)
        })
      );
      expect(result).toEqual(mockInterface);
    });

    it('should return null when updating nonexistent interface', async () => {
      mockQueryBuilder.returning.mockResolvedValue([]);

      const result = await service.updateRemoteInterface('nonexistent', { name: 'Test' });

      expect(result).toBeNull();
    });

    it('should delete remote interface', async () => {
      mockQueryBuilder.where.mockResolvedValue({ changes: 1 });

      const result = await service.deleteRemoteInterface('interface-1');

      expect(result).toBe(true);
    });

    it('should return false when deleting nonexistent interface', async () => {
      mockQueryBuilder.where.mockResolvedValue({ changes: 0 });

      const result = await service.deleteRemoteInterface('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('Transaction & Utility Operations', () => {
    it('should execute transaction successfully', async () => {
      mockDbManager.transaction.mockImplementation(async (callback) => {
        return callback();
      });

      const result = await service.transaction(async (svc) => {
        expect(svc).toBe(service);
        return 'success';
      });

      expect(result).toBe('success');
      expect(mockDbManager.transaction).toHaveBeenCalled();
    });

    it('should propagate transaction errors', async () => {
      mockDbManager.transaction.mockImplementation(async (callback) => {
        return callback();
      });

      await expect(
        service.transaction(async () => {
          throw new Error('Transaction failed');
        })
      ).rejects.toThrow('Transaction failed');
    });

    it('should return callback result from transaction', async () => {
      mockDbManager.transaction.mockImplementation(async (callback) => {
        return callback();
      });

      const result = await service.transaction(async () => {
        return { data: 'test', count: 42 };
      });

      expect(result).toEqual({ data: 'test', count: 42 });
    });
  });

  describe('Factory Functions', () => {
    it('should create service with getWorkspaceDatabaseService', () => {
      const service = getWorkspaceDatabaseService('/test/workspace');
      
      expect(service).toBeInstanceOf(WorkspaceDatabaseService);
    });

    it('should create and initialize with initializeWorkspaceDatabaseService', async () => {
      const service = await initializeWorkspaceDatabaseService('/test/workspace');
      
      expect(service).toBeInstanceOf(WorkspaceDatabaseService);
      expect(mockDbManager.initialize).toHaveBeenCalled();
    });

    it('should propagate initialization errors in factory', async () => {
      mockDbManager.initialize.mockRejectedValueOnce(new Error('Init failed'));
      
      await expect(
        initializeWorkspaceDatabaseService('/test/workspace')
      ).rejects.toThrow('Init failed');
    });
  });
});
