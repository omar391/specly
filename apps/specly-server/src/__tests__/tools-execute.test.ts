import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolsExecuteController } from '../api/tools-execute.js';
import { SpecEngine } from '../services/spec-engine.js';
import { PausedStateStore } from '../services/paused-state-store.js';
import { DatabaseService } from '../services/database-service.js';
import type { Context } from 'hono';

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
      const c = {
        req: {
          query: vi.fn().mockReturnValue('run'),
          json: vi.fn().mockResolvedValue({})
        },
        json: vi.fn()
      } as any as Context;

      await controller.execute(c);

      expect(c.req.query).toHaveBeenCalledWith('mode');
      expect(c.json).toHaveBeenCalledWith({ error: { message: 'mode query param deprecated; omit it (auto-detect run vs resume)' } }, 400);
    });

    it('should return 400 for invalid request body', async () => {
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({ invalid: 'data' })
        },
        json: vi.fn()
      } as any as Context;

      await controller.execute(c);

      expect(c.json).toHaveBeenCalledWith({ error: { message: 'Invalid request', details: expect.any(Object) } }, 400);
    });

    it('should resolve graph from tool_version_id when graph omitted', async () => {
      const toolVersionId = '123e4567-e89b-12d3-a456-426614174000';
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({ tool_version_id: toolVersionId })
        },
        json: vi.fn()
      } as any as Context;

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

      await controller.execute(c);

      expect(mockGlobalDb.getToolVersion).toHaveBeenCalledWith(toolVersionId);
      expect(mockGlobalDb.getSpecsByHashes).toHaveBeenCalledWith(['s1', 's2']);
      expect(mockEngine.run).toHaveBeenCalled();
      expect(c.json).toHaveBeenCalledWith({
        status: 'completed',
        executed: ['s1', 's2'],
        results: {},
        awaitingSpec: undefined,
        resumeToken: undefined,
        warnings: [],
        error: undefined
      }, 200);
    });

    it('should return 404 for unknown tool_version_id', async () => {
      const toolVersionId = '123e4567-e89b-12d3-a456-426614174000';
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({ tool_version_id: toolVersionId })
        },
        json: vi.fn()
      } as any as Context;

      const mockGlobalDb = {
        getToolVersion: vi.fn().mockResolvedValue(null)
      };
      (mockDb.getGlobal as any).mockReturnValue(mockGlobalDb);

      await controller.execute(c);

      expect(c.json).toHaveBeenCalledWith({ error: { message: 'tool_version_id not found' } }, 404);
    });

    it('should return 500 for invalid tool version manifest', async () => {
      const toolVersionId = '123e4567-e89b-12d3-a456-426614174000';
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({ tool_version_id: toolVersionId })
        },
        json: vi.fn()
      } as any as Context;

      const mockGlobalDb = {
        getToolVersion: vi.fn().mockResolvedValue({
          graphManifest: { invalid: 'manifest' }
        })
      };
      (mockDb.getGlobal as any).mockReturnValue(mockGlobalDb);

      await controller.execute(c);

      expect(c.json).toHaveBeenCalledWith({ error: { message: 'Stored tool version manifest invalid' } }, 500);
    });

    it('should handle resume with valid token', async () => {
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({
            resumeToken: 'token1',
            graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] },
            human_input: { specHash: 's1', output: 'input' }
          })
        },
        json: vi.fn()
      } as any as Context;

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

      await controller.execute(c);

      expect((mockEngine.resume as any)).toHaveBeenCalled();
      expect(c.json).toHaveBeenCalledWith({
        status: 'completed',
        executed: ['s1'],
        results: {},
        awaitingSpec: undefined,
        resumeToken: undefined,
        warnings: [],
        error: undefined
      }, 200);
    });

    it('should return 404 for unknown resume token', async () => {
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({
            resumeToken: 'unknown',
            human_input: { specHash: 's1', output: 'input' }
          })
        },
        json: vi.fn()
      } as any as Context;

      (mockStore.get as any).mockResolvedValue(null);

      await controller.execute(c);

      expect(c.json).toHaveBeenCalledWith({ error: { message: 'resumeToken not found' } }, 404);
    });

    it('should handle run path', async () => {
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({
            graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
          })
        },
        json: vi.fn()
      } as any as Context;

      (mockEngine.run as any).mockResolvedValue({
        status: 'completed',
        executed: ['s1'],
        results: {},
        warnings: []
      });

      await controller.execute(c);

      expect((mockEngine.run as any)).toHaveBeenCalled();
      expect(c.json).toHaveBeenCalledWith({
        status: 'completed',
        executed: ['s1'],
        results: {},
        awaitingSpec: undefined,
        resumeToken: undefined,
        warnings: [],
        error: undefined
      }, 200);
    });

    it('should save paused state when awaiting input', async () => {
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({
            graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'human', sideEffect: false } }, edges: [] }
          })
        },
        json: vi.fn()
      } as any as Context;

      (mockEngine.run as any).mockResolvedValue({
        status: 'awaiting_input',
        executed: [],
        results: {},
        warnings: [],
        awaitingSpec: 's1',
        resumeToken: 'token1'
      });

      await controller.execute(c);

      expect((mockStore.save as any)).toHaveBeenCalledWith('token1', expect.any(Object));
      expect(c.json).toHaveBeenCalledWith({
        status: 'awaiting_input',
        executed: [],
        results: {},
        awaitingSpec: 's1',
        resumeToken: 'token1',
        warnings: [],
        error: undefined
      }, 200);
    });

    it('should delete paused state when resume completes', async () => {
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({
            resumeToken: 'token1',
            graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] },
            human_input: { specHash: 's1', output: 'input' }
          })
        },
        json: vi.fn()
      } as any as Context;

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

      await controller.execute(c);

      expect((mockStore.delete as any)).toHaveBeenCalledWith('token1');
    });

    it('should return 500 on internal error', async () => {
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({
            graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
          })
        },
        json: vi.fn()
      } as any as Context;

      (mockEngine.run as any).mockRejectedValue(new Error('Engine error'));

      await controller.execute(c);

      expect(c.json).toHaveBeenCalledWith({ error: { message: 'Engine error' } }, 500);
    });

    it('should return 409 for lease renew failure', async () => {
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({
            graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
          })
        },
        json: vi.fn()
      } as any as Context;

      (mockEngine.run as any).mockResolvedValue({
        status: 'error',
        executed: [],
        results: {},
        warnings: [],
        error: { message: 'Lease renewal failed' },
        errorCode: 'LEASE_RENEW_FAILED'
      });

      await controller.execute(c);

      expect(c.json).toHaveBeenCalledWith({
        status: 'error',
        executed: [],
        results: {},
        awaitingSpec: undefined,
        resumeToken: undefined,
        warnings: [],
        error: { message: 'Lease renewal failed', code: 'LEASE_RENEW_FAILED' }
      }, 409);
    });

    it('should return 500 for route dead end', async () => {
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({
            graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
          })
        },
        json: vi.fn()
      } as any as Context;

      (mockEngine.run as any).mockResolvedValue({
        status: 'error',
        executed: [],
        results: {},
        warnings: [],
        error: { message: 'Dead-end reached' },
        errorCode: 'ROUTE_DEAD_END'
      });

      await controller.execute(c);

      expect(c.json).toHaveBeenCalledWith({
        status: 'error',
        executed: [],
        results: {},
        awaitingSpec: undefined,
        resumeToken: undefined,
        warnings: [],
        error: { message: 'Dead-end reached', code: 'ROUTE_DEAD_END' }
      }, 500);
    });

    it('should return 500 for executor failed (default case)', async () => {
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({
            graph: { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
          })
        },
        json: vi.fn()
      } as any as Context;

      (mockEngine.run as any).mockResolvedValue({
        status: 'error',
        executed: [],
        results: {},
        warnings: [],
        error: { message: 'Executor failed' },
        errorCode: 'EXECUTOR_FAILED'
      });

      await controller.execute(c);

      expect(c.json).toHaveBeenCalledWith({
        status: 'error',
        executed: [],
        results: {},
        awaitingSpec: undefined,
        resumeToken: undefined,
        warnings: [],
        error: { message: 'Executor failed', code: 'EXECUTOR_FAILED' }
      }, 500);
    });

    it('should return 500 for database error during tool_version_id resolution', async () => {
      const toolVersionId = '123e4567-e89b-12d3-a456-426614174000';
      const c = {
        req: {
          query: vi.fn().mockReturnValue(undefined),
          json: vi.fn().mockResolvedValue({ tool_version_id: toolVersionId })
        },
        json: vi.fn()
      } as any as Context;

      const mockGlobalDb = {
        getToolVersion: vi.fn().mockRejectedValue(new Error('Database connection failed'))
      };
      (mockDb.getGlobal as any).mockReturnValue(mockGlobalDb);

      await controller.execute(c);

      expect(c.json).toHaveBeenCalledWith({ error: { message: 'Database connection failed' } }, 500);
    });
  });
});