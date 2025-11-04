import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpressServer } from '../server/express-server.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';
import { WorkspacesController } from '../api/workspaces.js';
import { NotFoundError } from '../api/middleware.js';
import request from 'supertest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';

describe('Workspaces Endpoint', () => {
  let server: ExpressServer;
  let drizzleDb: DrizzleDatabaseManager;
  let databaseService: DatabaseService;
  let globalDb: GlobalDatabaseService;
  let testDir: string;
  let workspaceTestPath: string;

  beforeEach(async () => {
    // Create test directory
    testDir = join(tmpdir(), `workspaces-endpoint-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    workspaceTestPath = join(testDir, 'test-workspace');
    mkdirSync(workspaceTestPath, { recursive: true });
    mkdirSync(join(workspaceTestPath, '.specly'), { recursive: true });

    // Initialize in-memory global database
    drizzleDb = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    await drizzleDb.initialize();
    
    databaseService = new DatabaseService(drizzleDb);
    globalDb = databaseService.getGlobal();

    // Create server instance
    server = new ExpressServer({ port: 0, dev: true });
    await server.start();
    await server.setupAPIEndpoints(databaseService);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('GET /api/workspaces', () => {
    it('should return empty list when no workspaces exist', async () => {
      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data).toHaveProperty('workspaces');
      expect(Array.isArray(response.body.data.workspaces)).toBe(true);
      expect(response.body.data.workspaces.length).toBe(0);
    });

    it('should return list of workspaces', async () => {
      // Create test workspace in global DB
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces).toHaveLength(1);
      expect(response.body.data.workspaces[0]).toMatchObject({
        id: 'ws-1',
        name: 'Test Workspace',
        path: workspaceTestPath,
        status: 'active'
      });
    });

    it('should include task count for each workspace', async () => {
      // Create workspace
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      // Initialize workspace database
      const workspaceDb = new WorkspaceDatabaseService(workspaceTestPath);
      await workspaceDb.initialize();

      // Create tasks
      await workspaceDb.createTask({
        id: 'task-1',
        title: 'Task 1',
        status: 'in_progress'
      });
      await workspaceDb.createTask({
        id: 'task-2',
        title: 'Task 2',
        status: 'queued'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces[0].task_count).toBe(2);
    });

    it('should identify active task (highest priority in-progress)', async () => {
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      const workspaceDb = new WorkspaceDatabaseService(workspaceTestPath);
      await workspaceDb.initialize();

      // Create low priority task
      await workspaceDb.createTask({
        id: 'task-1',
        title: 'Low Priority Task',
        status: 'in_progress',
        priority: 'low'
      });

      // Create high priority task
      await workspaceDb.createTask({
        id: 'task-2',
        title: 'High Priority Task',
        status: 'in_progress',
        priority: 'high'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces[0].active_task).toBe('High Priority Task');
    });

    it('should handle inaccessible workspace databases gracefully', async () => {
      // Create workspace with invalid path
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: '/nonexistent/path',
        name: 'Inaccessible Workspace',
        status: 'active'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces).toHaveLength(1);
      expect(response.body.data.workspaces[0].status).toBe('error');
      expect(response.body.data.workspaces[0].task_count).toBe(0);
      expect(response.body.data.workspaces[0].active_task).toBeNull();
    });

    it('should include timestamps for each workspace', async () => {
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      const workspace = response.body.data.workspaces[0];
      expect(workspace.created_at).toBeDefined();
      expect(workspace.updated_at).toBeDefined();
    });

    it('should return multiple workspaces in correct format', async () => {
      const workspace1Path = join(testDir, 'workspace1');
      const workspace2Path = join(testDir, 'workspace2');
      
      mkdirSync(workspace1Path, { recursive: true });
      mkdirSync(join(workspace1Path, '.specly'), { recursive: true });
      mkdirSync(workspace2Path, { recursive: true });
      mkdirSync(join(workspace2Path, '.specly'), { recursive: true });

      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspace1Path,
        name: 'Workspace 1',
        status: 'active'
      });

      await globalDb.createWorkspace({
        id: 'ws-2',
        path: workspace2Path,
        name: 'Workspace 2',
        status: 'disconnected'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces).toHaveLength(2);
      
      const workspaceIds = response.body.data.workspaces.map((w: any) => w.id);
      expect(workspaceIds).toContain('ws-1');
      expect(workspaceIds).toContain('ws-2');
    });

    it('should exclude completed and failed tasks from task count', async () => {
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      const workspaceDb = new WorkspaceDatabaseService(workspaceTestPath);
      await workspaceDb.initialize();

      // Create mix of tasks
      await workspaceDb.createTask({
        id: 'task-1',
        title: 'Active Task',
        status: 'in_progress'
      });
      await workspaceDb.createTask({
        id: 'task-2',
        title: 'Completed Task',
        status: 'completed'
      });
      await workspaceDb.createTask({
        id: 'task-3',
        title: 'Failed Task',
        status: 'failed'
      });
      await workspaceDb.createTask({
        id: 'task-4',
        title: 'Queued Task',
        status: 'queued'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      // Should only count active tasks (in_progress and queued)
      expect(response.body.data.workspaces[0].task_count).toBe(2);
    });

    it('should handle workspace with no tasks', async () => {
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Empty Workspace',
        status: 'active'
      });

      const workspaceDb = new WorkspaceDatabaseService(workspaceTestPath);
      await workspaceDb.initialize();

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces[0].task_count).toBe(0);
      expect(response.body.data.workspaces[0].active_task).toBeNull();
    });

    it('should include last_activity timestamp', async () => {
      const now = new Date().toISOString();
      
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active',
        lastActivity: now
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces[0].last_activity).toBeDefined();
    });

    it('should handle tasks with undefined priority gracefully', async () => {
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      const workspaceDb = new WorkspaceDatabaseService(workspaceTestPath);
      await workspaceDb.initialize();

      // Create task without priority (should default to medium)
      await workspaceDb.createTask({
        id: 'task-1',
        title: 'No Priority Task',
        status: 'in_progress'
        // priority is undefined
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces[0].active_task).toBe('No Priority Task');
    });

    it('should handle tasks with undefined updatedAt gracefully', async () => {
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      const workspaceDb = new WorkspaceDatabaseService(workspaceTestPath);
      await workspaceDb.initialize();

      // Create task without updatedAt
      await workspaceDb.createTask({
        id: 'task-1',
        title: 'No UpdatedAt Task',
        status: 'in_progress',
        priority: 'high'
        // updatedAt is undefined
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces[0].active_task).toBe('No UpdatedAt Task');
    });

    it('should handle workspaces with undefined status gracefully', async () => {
      // Create workspace without status
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace'
        // status is undefined
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces[0].status).toBe('disconnected');
    });

    it('should handle database errors in getWorkspaces method', async () => {
      // Mock the database service to throw an error
      const originalGetAllWorkspaces = globalDb.getAllWorkspaces;
      globalDb.getAllWorkspaces = async () => {
        throw new Error('Database connection failed');
      };

      try {
        const response = await request(server.getApp())
          .get('/api/workspaces')
          .expect(500); // Should result in 500 error due to unhandled exception

        // The error should be caught and re-thrown, resulting in 500
        expect(response.status).toBe(500);
      } finally {
        // Restore original method
        globalDb.getAllWorkspaces = originalGetAllWorkspaces;
      }
    });

    it('should return workspace by ID when it exists', async () => {
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      const workspacesController = new WorkspacesController(databaseService);
      const workspace = await workspacesController.getWorkspaceById('ws-1');

      expect(workspace).toBeDefined();
      expect(workspace.id).toBe('ws-1');
      expect(workspace.name).toBe('Test Workspace');
      expect(workspace.status).toBe('active');
    });

    it('should throw NotFoundError when workspace does not exist', async () => {
      const workspacesController = new WorkspacesController(databaseService);

      await expect(workspacesController.getWorkspaceById('non-existent-ws')).rejects.toThrow('Workspace not found: non-existent-ws');
    });
  });

  describe('Workspace Enrichment', () => {
    it('should enrich workspace data with task information', async () => {
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      const workspaceDb = new WorkspaceDatabaseService(workspaceTestPath);
      await workspaceDb.initialize();

      await workspaceDb.createTask({
        id: 'task-1',
        title: 'Test Task',
        status: 'in_progress',
        priority: 'high'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      const workspace = response.body.data.workspaces[0];
      
      // Verify enriched fields
      expect(workspace).toHaveProperty('task_count');
      expect(workspace).toHaveProperty('active_task');
      expect(workspace.task_count).toBeGreaterThan(0);
      expect(workspace.active_task).toBe('Test Task');
    });

    it('should handle workspace status correctly', async () => {
      const statuses = ['active', 'idle', 'disconnected', 'inactive', 'error'];
      
      for (let i = 0; i < statuses.length; i++) {
        const wsPath = join(testDir, `workspace-${i}`);
        mkdirSync(wsPath, { recursive: true });
        mkdirSync(join(wsPath, '.specly'), { recursive: true });
        
        await globalDb.createWorkspace({
          id: `ws-${i}`,
          path: wsPath,
          name: `Workspace ${i}`,
          status: statuses[i] as any
        });
      }

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces).toHaveLength(statuses.length);
      
      const responseStatuses = response.body.data.workspaces.map((w: any) => w.status);
      for (const status of statuses) {
        expect(responseStatuses).toContain(status);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Create workspace with path that will cause issues
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: '/invalid/path/that/does/not/exist',
        name: 'Invalid Workspace',
        status: 'active'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      // Should still return response with error status
      expect(response.body.data.workspaces).toHaveLength(1);
      expect(response.body.data.workspaces[0].status).toBe('error');
    });

    it('should return 200 even when no workspaces are registered', async () => {
      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      expect(response.body.data.workspaces).toEqual([]);
    });
  });

  describe('Response Format', () => {
    it('should return properly formatted API response', async () => {
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      // Verify response structure
      expect(response.body.data).toHaveProperty('workspaces');
      expect(Array.isArray(response.body.data.workspaces)).toBe(true);

      const workspace = response.body.data.workspaces[0];
      expect(workspace).toHaveProperty('id');
      expect(workspace).toHaveProperty('name');
      expect(workspace).toHaveProperty('path');
      expect(workspace).toHaveProperty('status');
      expect(workspace).toHaveProperty('task_count');
      expect(workspace).toHaveProperty('created_at');
      expect(workspace).toHaveProperty('updated_at');
    });

    it('should use snake_case for API response fields', async () => {
      await globalDb.createWorkspace({
        id: 'ws-1',
        path: workspaceTestPath,
        name: 'Test Workspace',
        status: 'active'
      });

      const response = await request(server.getApp())
        .get('/api/workspaces')
        .expect(200);

      const workspace = response.body.data.workspaces[0];
      
      // Should use snake_case
      expect(workspace).toHaveProperty('task_count');
      expect(workspace).toHaveProperty('active_task');
      expect(workspace).toHaveProperty('last_activity');
      expect(workspace).toHaveProperty('created_at');
      expect(workspace).toHaveProperty('updated_at');
      
      // Should not use camelCase
      expect(workspace).not.toHaveProperty('taskCount');
      expect(workspace).not.toHaveProperty('activeTask');
      expect(workspace).not.toHaveProperty('lastActivity');
    });
  });
});
