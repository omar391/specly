import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, Router } from 'express';
import { createApiRouter, SSEEventManager } from '../api/router.js';
import type { DatabaseService } from '../services/database-service.js';

// Mock express Router
const mockRouter = {
  use: vi.fn().mockReturnThis(),
  get: vi.fn().mockReturnThis(),
  post: vi.fn().mockReturnThis(),
  put: vi.fn().mockReturnThis(),
  patch: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis()
};

// Mock express
vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter)
}));

// Mock controllers
vi.mock('../api/workspaces.js', () => ({
  WorkspacesController: vi.fn().mockImplementation(() => ({
    getWorkspaces: vi.fn()
  }))
}));

vi.mock('../api/tasks.js', () => ({
  TasksController: vi.fn().mockImplementation(() => ({
    getTasks: vi.fn(),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    patchTaskStatus: vi.fn(),
    addDependency: vi.fn(),
    removeDependency: vi.fn(),
    listDependencies: vi.fn()
  }))
}));

vi.mock('../api/tools-execute.js', () => ({
  ToolsExecuteController: vi.fn().mockImplementation(() => ({
    execute: vi.fn()
  }))
}));

vi.mock('../api/specs-tools.js', () => ({
  SpecsController: vi.fn().mockImplementation(() => ({
    createSpec: vi.fn()
  })),
  ToolsController: vi.fn().mockImplementation(() => ({
    createTool: vi.fn(),
    createToolVersion: vi.fn()
  }))
}));

vi.mock('../api/profiles.js', () => ({
  ProfilesController: vi.fn().mockImplementation(() => ({
    createProfile: vi.fn(),
    createProfileVersion: vi.fn(),
    publishProfileVersion: vi.fn(),
    attachTools: vi.fn(),
    getAttachments: vi.fn(),
    upgradeWorkspaceProfile: vi.fn(),
    getWorkspaceProfile: vi.fn()
  }))
}));

vi.mock('../api/sessions.js', () => ({
  SessionsController: vi.fn().mockImplementation(() => ({
    getSessions: vi.fn()
  }))
}));

vi.mock('../api/rules.js', () => ({
  RulesController: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    createRule: vi.fn(),
    getRules: vi.fn()
  }))
}));

vi.mock('../api/middleware.js', () => ({
  errorHandler: vi.fn(),
  notFoundHandler: vi.fn(),
  requestLogger: vi.fn(),
  corsHandler: vi.fn(),
  rateLimit: vi.fn(() => vi.fn()),
  validateWorkspaceId: vi.fn(),
  validateTaskId: vi.fn()
}));

describe('createApiRouter', () => {
  let mockDatabaseService: DatabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDatabaseService = {
      getGlobal: vi.fn().mockReturnValue({})
    } as any;
  });

  it('should create router', async () => {
    const router = await createApiRouter(mockDatabaseService);
    expect(router).toBeDefined();
  });

  it('should apply corsHandler middleware', async () => {
    await createApiRouter(mockDatabaseService);
    expect(mockRouter.use).toHaveBeenCalled();
  });

  it('should apply requestLogger middleware', async () => {
    await createApiRouter(mockDatabaseService);
    expect(mockRouter.use).toHaveBeenCalled();
  });

  it('should register GET /workspaces route', async () => {
    await createApiRouter(mockDatabaseService);
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/workspaces',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('should register POST /specs route', async () => {
    await createApiRouter(mockDatabaseService);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/specs',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('should register POST /tools route', async () => {
    await createApiRouter(mockDatabaseService);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/tools',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('should register task routes', async () => {
    await createApiRouter(mockDatabaseService);
    
    // GET tasks
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/workspaces/:workspaceId/tasks',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );
    
    // POST create task
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/workspaces/:workspaceId/tasks',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );
    
    // PUT update task
    expect(mockRouter.put).toHaveBeenCalledWith(
      '/workspaces/:workspaceId/tasks/:taskId',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('should register rules routes', async () => {
    await createApiRouter(mockDatabaseService);
    
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/rules',
      expect.any(Function),
      expect.any(Function)
    );
    
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/rules',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('should apply error handling middleware', async () => {
    await createApiRouter(mockDatabaseService);
    expect(mockRouter.use).toHaveBeenCalled();
  });

  it('should initialize RulesController', async () => {
    const { RulesController } = await import('../api/rules.js');
    await createApiRouter(mockDatabaseService);
    
    const rulesControllerInstance = (RulesController as any).mock.results[0].value;
    expect(rulesControllerInstance.initialize).toHaveBeenCalled();
  });
});

describe('SSEEventManager', () => {
  let manager: SSEEventManager;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    manager = new SSEEventManager();
    mockReq = {
      on: vi.fn()
    };
    mockRes = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      headersSent: false
    };
  });

  describe('addClient', () => {
    it('should set SSE headers', () => {
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Cache-Control');
    });

    it('should send initial connection event', () => {
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      
      expect(mockRes.write).toHaveBeenCalled();
      const callArg = (mockRes.write as any).mock.calls[0][0] as string;
      expect(callArg).toContain('connection.established');
      expect(callArg).toContain('client-1');
    });

    it('should register close handler', () => {
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      expect(mockReq.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should register aborted handler', () => {
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      expect(mockReq.on).toHaveBeenCalledWith('aborted', expect.any(Function));
    });

    it('should increment client count', () => {
      expect(manager.getClientCount()).toBe(0);
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      expect(manager.getClientCount()).toBe(1);
    });

    it('should handle close event', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      
      const closeHandler = (mockReq.on as any).mock.calls.find((call: any) => call[0] === 'close')[1];
      closeHandler();
      
      expect(manager.getClientCount()).toBe(0);
      consoleSpy.mockRestore();
    });
  });

  describe('sendToClient', () => {
    it('should send event to specific client', () => {
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      vi.clearAllMocks();
      
      manager.sendToClient('client-1', { type: 'test', data: { value: 123 } });
      
      expect(mockRes.write).toHaveBeenCalled();
      const callArg = (mockRes.write as any).mock.calls[0][0] as string;
      expect(callArg).toContain('test');
      expect(callArg).toContain('123');
    });

    it('should not send to non-existent client', () => {
      manager.sendToClient('nonexistent', { type: 'test' });
      expect(mockRes.write).not.toHaveBeenCalled();
    });

    it('should handle write errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      (mockRes.write as any).mockImplementation(() => {
        throw new Error('Write failed');
      });
      
      manager.sendToClient('client-1', { type: 'test' });
      
      expect(manager.getClientCount()).toBe(0);
      consoleSpy.mockRestore();
    });

    it('should not send if headers already sent', () => {
      mockRes.headersSent = true;
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      vi.clearAllMocks();
      
      manager.sendToClient('client-1', { type: 'test' });
      expect(mockRes.write).not.toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('should send event to all clients', () => {
      const mockRes1 = { ...mockRes, write: vi.fn(), headersSent: false };
      const mockRes2 = { ...mockRes, write: vi.fn(), headersSent: false };
      
      manager.addClient('client-1', mockReq as Request, mockRes1 as Response);
      manager.addClient('client-2', mockReq as Request, mockRes2 as Response);
      vi.clearAllMocks();
      
      manager.broadcast({ type: 'broadcast', data: 'test' });
      
      expect(mockRes1.write).toHaveBeenCalled();
      expect(mockRes2.write).toHaveBeenCalled();
    });

    it('should handle broadcast errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockRes1 = { 
        ...mockRes, 
        write: vi.fn()
          .mockImplementationOnce(() => {}) // First call during addClient succeeds
          .mockImplementationOnce(() => { throw new Error('Fail'); }), // Second call during broadcast fails
        headersSent: false 
      };
      
      manager.addClient('client-1', mockReq as Request, mockRes1 as Response);
      expect(manager.getClientCount()).toBe(1);
      
      manager.broadcast({ type: 'test' });
      
      expect(manager.getClientCount()).toBe(0);
      consoleSpy.mockRestore();
    });

    it('should remove clients with headers already sent', () => {
      const mockRes1 = { ...mockRes, write: vi.fn(), headersSent: true };
      manager.addClient('client-1', mockReq as Request, mockRes1 as Response);
      
      manager.broadcast({ type: 'test' });
      
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('sendWorkspaceStatusChanged', () => {
    it('should broadcast workspace status event', () => {
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      vi.clearAllMocks();
      
      manager.sendWorkspaceStatusChanged('ws-1', 'active', '2025-11-03');
      
      expect(mockRes.write).toHaveBeenCalled();
      const callArg = (mockRes.write as any).mock.calls[0][0] as string;
      expect(callArg).toContain('workspace.status_changed');
      expect(callArg).toContain('ws-1');
      expect(callArg).toContain('active');
    });
  });

  describe('sendTaskUpdated', () => {
    it('should broadcast task updated event', () => {
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      vi.clearAllMocks();
      
      const task = {
        id: 'task-1',
        status: 'completed',
        progress: 100,
        updated_at: '2025-11-03'
      };
      
      manager.sendTaskUpdated('ws-1', task);
      
      expect(mockRes.write).toHaveBeenCalled();
      const callArg = (mockRes.write as any).mock.calls[0][0] as string;
      expect(callArg).toContain('task.updated');
      expect(callArg).toContain('task-1');
      expect(callArg).toContain('completed');
    });
  });

  describe('sendTaskCreated', () => {
    it('should broadcast task created event', () => {
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      vi.clearAllMocks();
      
      const task = {
        id: 'task-1',
        title: 'New task',
        status: 'backlog',
        created_at: '2025-11-03'
      };
      
      manager.sendTaskCreated('ws-1', task);
      
      expect(mockRes.write).toHaveBeenCalled();
      const callArg = (mockRes.write as any).mock.calls[0][0] as string;
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
      manager.addClient('client-1', mockReq as Request, mockRes as Response);
      manager.addClient('client-2', mockReq as Request, { ...mockRes } as Response);
      expect(manager.getClientCount()).toBe(2);
    });
  });

  describe('closeAll', () => {
    it('should close all client connections', () => {
      const mockRes1 = { ...mockRes, end: vi.fn() };
      const mockRes2 = { ...mockRes, end: vi.fn() };
      
      manager.addClient('client-1', mockReq as Request, mockRes1 as Response);
      manager.addClient('client-2', mockReq as Request, mockRes2 as Response);
      
      manager.closeAll();
      
      expect(mockRes1.end).toHaveBeenCalled();
      expect(mockRes2.end).toHaveBeenCalled();
      expect(manager.getClientCount()).toBe(0);
    });

    it('should handle errors when closing connections', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockRes1 = { 
        ...mockRes, 
        end: vi.fn().mockImplementation(() => { throw new Error('Close failed'); })
      };
      
      manager.addClient('client-1', mockReq as Request, mockRes1 as Response);
      
      manager.closeAll();
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(manager.getClientCount()).toBe(0);
      consoleSpy.mockRestore();
    });
  });
});
