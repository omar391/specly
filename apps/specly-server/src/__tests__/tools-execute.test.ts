import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolsExecuteController } from '../api/tools-execute.js';
import { SpecEngine } from '../services/spec-engine.js';
import { PausedStateStore } from '../services/paused-state-store.js';
import { DatabaseService } from '../services/database-service.js';

describe('ToolsExecuteController', () => {
  let controller: ToolsExecuteController;
  let mockEngine: SpecEngine;
  let mockStore: PausedStateStore;
  let mockDb: DatabaseService;

  beforeEach(() => {
    mockEngine = {
      run: vi.fn(),
      resume: vi.fn()
    } as any;
    mockStore = {
      save: vi.fn(),
      get: vi.fn(),
      delete: vi.fn()
    } as any;
    mockDb = {
      getGlobal: vi.fn()
    } as any;
    controller = new ToolsExecuteController(() => mockEngine, mockStore, mockDb);
  });

  describe('execute', () => {
    it('should reject deprecated mode query param', async () => {
      const req = {
        query: { mode: 'run' },
        body: {}
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: { message: 'mode query param deprecated; omit it (auto-detect run vs resume)' } });
    });

    it('should return 400 for invalid request body', async () => {
      const req = {
        query: {},
        body: { invalid: 'data' }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: { message: 'Invalid request', details: expect.any(Object) } });
    });

    it('should resolve graph from tool_version_id when graph omitted', async () => {
      const toolVersionId = '123e4567-e89b-12d3-a456-426614174000';
      const req = {
        query: {},
        body: { tool_version_id: toolVersionId }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      const mockGlobalDb = {
        getToolVersion: vi.fn().mockResolvedValue({
          graphManifest: {
            ordered_specs: ['s1', 's2'],
            entry_spec: 's1',
            edges: [{ from: 's1', to: 's2' }]
          }
        }),
        getSpecsByHashes: vi.fn().mockResolvedValue({
          s1: { intent: 'autonomous', sideEffect: false },
          s2: { intent: 'human', sideEffect: false }
        })
      };
      (mockDb.getGlobal as any).mockReturnValue(mockGlobalDb);
      (mockEngine.run as any).mockResolvedValue({
        status: 'completed',
        executed: ['s1', 's2'],
        results: {},
        warnings: []
      });

      await controller.execute(req, res);

      expect(mockGlobalDb.getToolVersion).toHaveBeenCalledWith(toolVersionId);
      expect(mockGlobalDb.getSpecsByHashes).toHaveBeenCalledWith(['s1', 's2']);
      expect(mockEngine.run).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 for unknown tool_version_id', async () => {
      const toolVersionId = '123e4567-e89b-12d3-a456-426614174000';
      const req = {
        query: {},
        body: { tool_version_id: toolVersionId }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      const mockGlobalDb = {
        getToolVersion: vi.fn().mockResolvedValue(null)
      };
      (mockDb.getGlobal as any).mockReturnValue(mockGlobalDb);

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: { message: 'tool_version_id not found' } });
    });

    it('should return 500 for invalid tool version manifest', async () => {
      const toolVersionId = '123e4567-e89b-12d3-a456-426614174000';
      const req = {
        query: {},
        body: { tool_version_id: toolVersionId }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      const mockGlobalDb = {
        getToolVersion: vi.fn().mockResolvedValue({
          graphManifest: { invalid: 'manifest' }
        })
      };
      (mockDb.getGlobal as any).mockReturnValue(mockGlobalDb);

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: { message: 'Stored tool version manifest invalid' } });
    });

    it('should handle resume with valid token', async () => {
      const req = {
        query: {},
        body: {
          resumeToken: 'token1',
          graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] },
          human_input: { specHash: 's1', output: 'input' }
        }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      const pausedState = {
        plan: { steps: [], warnings: [] },
        currentIndex: 0,
        executed: [],
        results: {},
        warnings: [],
        awaitingSpec: 's1',
        sessionContext: {}
      };
      (mockStore.get as any).mockResolvedValue(pausedState);
      (mockEngine.resume as any).mockResolvedValue({
        status: 'completed',
        executed: ['s1'],
        results: {},
        warnings: []
      });

      await controller.execute(req, res);

      expect((mockEngine.resume as any)).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 for unknown resume token', async () => {
      const req = {
        query: {},
        body: {
          resumeToken: 'unknown',
          human_input: { specHash: 's1', output: 'input' }
        }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      (mockStore.get as any).mockResolvedValue(null);

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: { message: 'resumeToken not found' } });
    });

    it('should handle run path', async () => {
      const req = {
        query: {},
        body: {
          graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
        }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      (mockEngine.run as any).mockResolvedValue({
        status: 'completed',
        executed: ['s1'],
        results: {},
        warnings: []
      });

      await controller.execute(req, res);

      expect((mockEngine.run as any)).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'completed',
        executed: ['s1'],
        results: {},
        awaitingSpec: undefined,
        resumeToken: undefined,
        warnings: [],
        error: undefined
      });
    });

    it('should save paused state when awaiting input', async () => {
      const req = {
        query: {},
        body: {
          graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'human', sideEffect: false } }, edges: [] }
        }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      (mockEngine.run as any).mockResolvedValue({
        status: 'awaiting_input',
        executed: [],
        results: {},
        warnings: [],
        awaitingSpec: 's1',
        resumeToken: 'token1'
      });

      await controller.execute(req, res);

      expect((mockStore.save as any)).toHaveBeenCalledWith('token1', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should delete paused state when resume completes', async () => {
      const req = {
        query: {},
        body: {
          resumeToken: 'token1',
          graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] },
          human_input: { specHash: 's1', output: 'input' }
        }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      const pausedState = {
        plan: { steps: [], warnings: [] },
        currentIndex: 0,
        executed: [],
        results: {},
        warnings: [],
        awaitingSpec: 's1',
        sessionContext: {}
      };
      (mockStore.get as any).mockResolvedValue(pausedState);
      (mockEngine.resume as any).mockResolvedValue({
        status: 'completed',
        executed: ['s1'],
        results: {},
        warnings: []
      });

      await controller.execute(req, res);

      expect((mockStore.delete as any)).toHaveBeenCalledWith('token1');
    });

    it('should return 500 on internal error', async () => {
      const req = {
        query: {},
        body: {
          graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
        }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      (mockEngine.run as any).mockRejectedValue(new Error('Engine error'));

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: { message: 'Engine error' } });
    });

    it('should return 409 for lease renew failure', async () => {
      const req = {
        query: {},
        body: {
          graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
        }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      (mockEngine.run as any).mockResolvedValue({
        status: 'error',
        executed: [],
        results: {},
        warnings: [],
        error: { message: 'Lease renewal failed' },
        errorCode: 'LEASE_RENEW_FAILED'
      });

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        executed: [],
        results: {},
        awaitingSpec: undefined,
        resumeToken: undefined,
        warnings: [],
        error: { message: 'Lease renewal failed', code: 'LEASE_RENEW_FAILED' }
      });
    });

    it('should return 500 for route dead end', async () => {
      const req = {
        query: {},
        body: {
          graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
        }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      (mockEngine.run as any).mockResolvedValue({
        status: 'error',
        executed: [],
        results: {},
        warnings: [],
        error: { message: 'Dead-end reached' },
        errorCode: 'ROUTE_DEAD_END'
      });

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 for executor failed (default case)', async () => {
      const req = {
        query: {},
        body: {
          graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
        }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      (mockEngine.run as any).mockResolvedValue({
        status: 'error',
        executed: [],
        results: {},
        warnings: [],
        error: { message: 'Executor failed' },
        errorCode: 'EXECUTOR_FAILED'
      });

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should return 500 for database error during tool_version_id resolution', async () => {
      const toolVersionId = '123e4567-e89b-12d3-a456-426614174000';
      const req = {
        query: {},
        body: { tool_version_id: toolVersionId }
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      const mockGlobalDb = {
        getToolVersion: vi.fn().mockRejectedValue(new Error('Database connection failed'))
      };
      (mockDb.getGlobal as any).mockReturnValue(mockGlobalDb);

      await controller.execute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: { message: 'Database connection failed' } });
    });
  });
});