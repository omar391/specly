import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testClient } from 'hono/testing';
import { createApiRouter, SSEEventManager } from '../api/router.js';
import type { DatabaseService } from '../services/database-service.js';

// Mock controllers
vi.mock('../api/workspaces.js', () => ({
  WorkspacesController: vi.fn().mockImplementation(() => ({
    getWorkspaces: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
}));

vi.mock('../api/tasks.js', () => ({
  TasksController: vi.fn().mockImplementation(() => ({
    getTasks: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    getTask: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    createTask: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 201, headers: { 'Content-Type': 'application/json' } })),
    updateTask: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    patchTaskStatus: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    addDependency: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    removeDependency: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    listDependencies: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
}));

vi.mock('../api/tools-execute.js', () => ({
  ToolsExecuteController: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
}));

vi.mock('../api/specs-tools.js', () => ({
  SpecsController: vi.fn().mockImplementation(() => ({
    createSpec: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })),
  ToolsController: vi.fn().mockImplementation(() => ({
    createTool: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    createToolVersion: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
}));

vi.mock('../api/profiles.js', () => ({
  ProfilesController: vi.fn().mockImplementation(() => ({
    createProfile: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    createProfileVersion: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    publishProfileVersion: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    attachTools: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    getAttachments: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    upgradeWorkspaceProfile: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    getWorkspaceProfile: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
}));

vi.mock('../api/sessions.js', () => ({
  SessionsController: vi.fn().mockImplementation(() => ({
    getSessions: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
}));

vi.mock('../api/rules.js', () => ({
  RulesController: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    createRule: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    getRules: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
}));

vi.mock('../api/middleware.js', () => ({
  rateLimit: vi.fn(() => (c, next) => next()),
  validateWorkspaceId: vi.fn((c, next) => next()),
  validateTaskId: vi.fn((c, next) => next())
}));

describe('createApiRouter', () => {
  let mockDatabaseService: DatabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDatabaseService = {
      getGlobal: vi.fn().mockReturnValue({})
    } as any;
  });

  it('should create Hono app', async () => {
    const app = await createApiRouter(mockDatabaseService);
    expect(app).toBeDefined();
    expect(typeof app.get).toBe('function'); // Hono app has get method
  });

  it('should handle GET /workspaces route', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const response = await app.request('/workspaces');
    expect(response.status).toBe(200);
  });

  it('should handle POST /specs route', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const response = await app.request('/specs', { method: 'POST' });
    expect(response.status).toBe(200);
  });

  it('should handle POST /tools route', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const response = await app.request('/tools', { method: 'POST' });
    expect(response.status).toBe(200);
  });

  it('should handle task routes', async () => {
    const app = await createApiRouter(mockDatabaseService);

    // GET tasks
    const getTasksRes = await app.request('/workspaces/test-ws/tasks');
    expect(getTasksRes.status).toBe(200);

    // POST create task
    const createTaskRes = await app.request('/workspaces/test-ws/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', description: 'Test', priority: 'high' })
    });
    expect(createTaskRes.status).toBe(201);

    // PUT update task
    const updateTaskRes = await app.request('/workspaces/test-ws/tasks/test-task', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' })
    });
    expect(updateTaskRes.status).toBe(200);
  });

  it('should handle rules routes', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const postRulesRes = await app.request('/rules', { method: 'POST' });
    expect(postRulesRes.status).toBe(200);

    const getRulesRes = await app.request('/rules');
    expect(getRulesRes.status).toBe(200);
  }); it('should initialize RulesController', async () => {
    const { RulesController } = await import('../api/rules.js');
    await createApiRouter(mockDatabaseService);

    const rulesControllerInstance = (RulesController as any).mock.results[0].value;
    expect(rulesControllerInstance.initialize).toHaveBeenCalled();
  });
});

describe('SSEEventManager', () => {
  let manager: SSEEventManager;
  let mockController: ReadableStreamDefaultController;
  let mockStream: any;

  beforeEach(() => {
    manager = new SSEEventManager();
    mockController = {
      enqueue: vi.fn(),
      close: vi.fn()
    } as any;
    mockStream = {
      controller: mockController,
      writeln: vi.fn(),
      onAbort: vi.fn()
    };
  });

  describe('addClient', () => {
    it('should add client and send initial connection event', async () => {
      const mockC = {
        streamSSE: vi.fn(async (callback) => {
          await callback(mockStream);
        })
      };

      manager.addClient('client-1', mockC);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockC.streamSSE).toHaveBeenCalled();
      expect(mockStream.writeln).toHaveBeenCalled();
      const callArg = mockStream.writeln.mock.calls[0][0] as string;
      expect(callArg).toContain('connection.established');
      expect(callArg).toContain('client-1');
      expect(mockStream.onAbort).toHaveBeenCalled();
    });

    it('should register abort handler', async () => {
      const mockC = {
        streamSSE: vi.fn(async (callback) => {
          await callback(mockStream);
        })
      };

      manager.addClient('client-1', mockC);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockStream.onAbort).toHaveBeenCalled();
    });

    it('should increment client count', () => {
      const mockC = {
        streamSSE: vi.fn(async (callback) => {
          await callback(mockStream);
        })
      };

      expect(manager.getClientCount()).toBe(0);
      manager.addClient('client-1', mockC);
      expect(manager.getClientCount()).toBe(1);
    });

    it('should handle abort event', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
      const mockC = {
        streamSSE: vi.fn(async (callback) => {
          await callback(mockStream);
        })
      };

      manager.addClient('client-1', mockC);
      await new Promise(resolve => setTimeout(resolve, 0));

      const abortHandler = mockStream.onAbort.mock.calls[0][0];
      abortHandler();
      
      expect(manager.getClientCount()).toBe(0);
      consoleSpy.mockRestore();
    });
  }); describe('sendToClient', () => {
    it('should send event to specific client', () => {
      const mockC = {
        streamSSE: vi.fn((callback) => callback(mockStream))
      };
      manager.addClient('client-1', mockC);
      vi.clearAllMocks();

      manager.sendToClient('client-1', { type: 'test', data: { value: 123 } });

      expect(mockController.enqueue).toHaveBeenCalled();
      const callArg = mockController.enqueue.mock.calls[0][0] as string;
      expect(callArg).toContain('test');
      expect(callArg).toContain('123');
    });

    it('should not send to non-existent client', () => {
      manager.sendToClient('nonexistent', { type: 'test' });
      expect(mockController.enqueue).not.toHaveBeenCalled();
    });

    it('should handle enqueue errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const mockC = {
        streamSSE: vi.fn((callback) => callback(mockStream))
      };
      manager.addClient('client-1', mockC);
      mockController.enqueue.mockImplementation(() => {
        throw new Error('Enqueue failed');
      });

      manager.sendToClient('client-1', { type: 'test' });

      expect(manager.getClientCount()).toBe(0);
      consoleSpy.mockRestore();
    });
  });

  describe('broadcast', () => {
    it('should send event to all clients', () => {
      const mockController1 = { enqueue: vi.fn() };
      const mockController2 = { enqueue: vi.fn() };
      const mockStream1 = { controller: mockController1, writeln: vi.fn(), onAbort: vi.fn() };
      const mockStream2 = { controller: mockController2, writeln: vi.fn(), onAbort: vi.fn() };
      const mockC1 = { streamSSE: vi.fn((callback) => callback(mockStream1)) };
      const mockC2 = { streamSSE: vi.fn((callback) => callback(mockStream2)) };

      manager.addClient('client-1', mockC1);
      manager.addClient('client-2', mockC2);
      vi.clearAllMocks();

      manager.broadcast({ type: 'broadcast', data: 'test' });

      expect(mockController1.enqueue).toHaveBeenCalled();
      expect(mockController2.enqueue).toHaveBeenCalled();
    });

    it('should handle broadcast errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const mockController1 = {
        enqueue: vi.fn().mockImplementation(() => { throw new Error('Fail'); })
      };
      const mockStream1 = { controller: mockController1, writeln: vi.fn(), onAbort: vi.fn() };
      const mockC1 = { streamSSE: vi.fn((callback) => callback(mockStream1)) };

      manager.addClient('client-1', mockC1);
      expect(manager.getClientCount()).toBe(1);

      manager.broadcast({ type: 'test' });

      expect(manager.getClientCount()).toBe(0);
      consoleSpy.mockRestore();
    });
  });

  describe('sendWorkspaceStatusChanged', () => {
    it('should broadcast workspace status event', () => {
      const mockC = {
        streamSSE: vi.fn((callback) => callback(mockStream))
      };
      manager.addClient('client-1', mockC);
      vi.clearAllMocks();

      manager.sendWorkspaceStatusChanged('ws-1', 'active', '2025-11-03');

      expect(mockController.enqueue).toHaveBeenCalled();
      const callArg = mockController.enqueue.mock.calls[0][0] as string;
      expect(callArg).toContain('workspace.status_changed');
      expect(callArg).toContain('ws-1');
      expect(callArg).toContain('active');
    });
  });

  describe('sendTaskUpdated', () => {
    it('should broadcast task updated event', () => {
      const mockC = {
        streamSSE: vi.fn((callback) => callback(mockStream))
      };
      manager.addClient('client-1', mockC);
      vi.clearAllMocks();

      const task = {
        id: 'task-1',
        status: 'completed',
        progress: 100,
        updated_at: '2025-11-03'
      };

      manager.sendTaskUpdated('ws-1', task);

      expect(mockController.enqueue).toHaveBeenCalled();
      const callArg = mockController.enqueue.mock.calls[0][0] as string;
      expect(callArg).toContain('task.updated');
      expect(callArg).toContain('task-1');
      expect(callArg).toContain('completed');
    });
  });

  describe('sendTaskCreated', () => {
    it('should broadcast task created event', () => {
      const mockC = {
        streamSSE: vi.fn((callback) => callback(mockStream))
      };
      manager.addClient('client-1', mockC);
      vi.clearAllMocks();

      const task = {
        id: 'task-1',
        title: 'New task',
        status: 'backlog',
        created_at: '2025-11-03'
      };

      manager.sendTaskCreated('ws-1', task);

      expect(mockController.enqueue).toHaveBeenCalled();
      const callArg = mockController.enqueue.mock.calls[0][0] as string;
      expect(callArg).toContain('task.created');
      expect(callArg).toContain('task-1');
      expect(callArg).toContain('New task');
    });
  });

  describe('getClientCount', () => {
    it('should return 0 initially', () => {
      expect(manager.getClientCount()).toBe(0);
    });

    it('should return correct count after adding clients', () => {
      const mockC = {
        streamSSE: vi.fn((callback) => callback(mockStream))
      };
      manager.addClient('client-1', mockC);
      manager.addClient('client-2', { streamSSE: vi.fn((callback) => callback({ ...mockStream })) });
      expect(manager.getClientCount()).toBe(2);
    });
  });

  describe('closeAll', () => {
    it('should close all client connections', () => {
      const mockController1 = { close: vi.fn() };
      const mockController2 = { close: vi.fn() };
      const mockStream1 = { controller: mockController1, writeln: vi.fn(), onAbort: vi.fn() };
      const mockStream2 = { controller: mockController2, writeln: vi.fn(), onAbort: vi.fn() };
      const mockC1 = { streamSSE: vi.fn((callback) => callback(mockStream1)) };
      const mockC2 = { streamSSE: vi.fn((callback) => callback(mockStream2)) };

      manager.addClient('client-1', mockC1);
      manager.addClient('client-2', mockC2);

      manager.closeAll();

      expect(mockController1.close).toHaveBeenCalled();
      expect(mockController2.close).toHaveBeenCalled();
      expect(manager.getClientCount()).toBe(0);
    });

    it('should handle errors when closing connections', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const mockController1 = {
        close: vi.fn().mockImplementation(() => { throw new Error('Close failed'); })
      };
      const mockStream1 = { controller: mockController1, writeln: vi.fn(), onAbort: vi.fn() };
      const mockC1 = { streamSSE: vi.fn((callback) => callback(mockStream1)) };

      manager.addClient('client-1', mockC1);

      manager.closeAll();

      expect(consoleSpy).toHaveBeenCalled();
      expect(manager.getClientCount()).toBe(0);
      consoleSpy.mockRestore();
    });
  });
});
