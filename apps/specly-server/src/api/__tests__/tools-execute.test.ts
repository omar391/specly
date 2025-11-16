import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolsExecuteController } from '../tools-execute.js';
import { SpecEngine, SpecEngineErrorCode, SerializedPausedState } from '../../services/spec-engine.js';
import { PausedStateStore, InMemoryPausedStateStore } from '../../services/paused-state-store.js';
import { DatabaseService } from '../../services/database-service.js';
import { getGlobalDatabaseService } from '../../database/global-queries.js';

const MockSpecEngine = SpecEngine as any;
const MockInMemoryPausedStateStore = InMemoryPausedStateStore as any;
const MockDatabaseService = DatabaseService as any;

// Mock dependencies
vi.mock('../../services/spec-engine.js');
vi.mock('../../services/paused-state-store.js');
vi.mock('../../services/database-service.js');
vi.mock('../../database/global-queries.js', () => ({
  getGlobalDatabaseService: vi.fn(),
}));

describe('ToolsExecuteController', () => {
  let controller: ToolsExecuteController;
  let mockEngine: any;
  let mockPausedStore: any;
  let mockDb: any;
  let mockGlobalDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock SpecEngine
    mockEngine = {
      run: vi.fn(),
      resume: vi.fn(),
    };
    MockSpecEngine.mockImplementation(() => mockEngine);

    // Mock PausedStateStore
    mockPausedStore = {
      save: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    };
    MockInMemoryPausedStateStore.mockImplementation(() => mockPausedStore);

    // Mock DatabaseService
    mockGlobalDb = {
      getToolVersion: vi.fn(),
      getSpecsByHashes: vi.fn(),
    };
    mockDb = {
      getGlobal: vi.fn().mockReturnValue(mockGlobalDb),
    };
    MockDatabaseService.mockImplementation(() => mockDb);

    // Mock global database service
    (getGlobalDatabaseService as any).mockReturnValue(mockGlobalDb);

    controller = new ToolsExecuteController(undefined, mockPausedStore);
  });

  describe('constructor', () => {
    it('should initialize with default dependencies', () => {
      const ctrl = new ToolsExecuteController();
      expect(ctrl).toBeDefined();
    });

    it('should accept custom engine factory', () => {
      const customEngine = {};
      const ctrl = new ToolsExecuteController(() => customEngine as any);
      expect(ctrl).toBeDefined();
    });

    it('should accept custom paused store', () => {
      const customStore = {};
      const ctrl = new ToolsExecuteController(undefined, customStore as any);
      expect(ctrl).toBeDefined();
    });

    it('should accept custom database service', () => {
      const customDb = {};
      const ctrl = new ToolsExecuteController(undefined, undefined, customDb as any);
      expect(ctrl).toBeDefined();
    });
  });

  describe('execute', () => {
    const mockCtx = {
      req: {
        query: vi.fn(),
        json: vi.fn(),
      },
      json: vi.fn(),
    };

    beforeEach(() => {
      mockCtx.req.query.mockReturnValue(undefined);
    });

    describe('deprecated mode query param', () => {
      it('should reject deprecated mode query param', async () => {
        mockCtx.req.query.mockReturnValue('run');
        mockCtx.req.json.mockResolvedValue({});

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'mode query param deprecated; omit it (auto-detect run vs resume)' } },
          400
        );
      });
    });

    describe('invalid request schema', () => {
      it('should return 400 for invalid request', async () => {
        mockCtx.req.json.mockResolvedValue({ invalid: 'data' });

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'Invalid request', details: expect.any(Object) } },
          400
        );
      });
    });

    describe('tool_version_id resolution', () => {
      it('should resolve graph from tool_version_id successfully', async () => {
        const toolVersionId = '550e8400-e29b-41d4-a716-446655440000'; // valid UUID
        const toolVersion = {
          graphManifest: {
            ordered_specs: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
            entry_spec: '550e8400-e29b-41d4-a716-446655440001',
            edges: [{ from: '550e8400-e29b-41d4-a716-446655440001', to: '550e8400-e29b-41d4-a716-446655440002' }],
          },
        };
        const specs = {
          '550e8400-e29b-41d4-a716-446655440001': { intent: 'autonomous', sideEffect: false },
          '550e8400-e29b-41d4-a716-446655440002': { intent: 'human', sideEffect: true },
        };

        mockCtx.req.json.mockResolvedValue({ tool_version_id: toolVersionId });
        mockGlobalDb.getToolVersion.mockResolvedValue(toolVersion);
        mockGlobalDb.getSpecsByHashes.mockResolvedValue(specs);
        mockEngine.run.mockResolvedValue({
          status: 'completed',
          executed: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
          results: { '550e8400-e29b-41d4-a716-446655440001': 'result1', '550e8400-e29b-41d4-a716-446655440002': 'result2' },
          warnings: [],
        });

        await controller.execute(mockCtx as any);

        expect(mockGlobalDb.getToolVersion).toHaveBeenCalledWith(toolVersionId);
        expect(mockGlobalDb.getSpecsByHashes).toHaveBeenCalledWith(['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002']);
        expect(mockEngine.run).toHaveBeenCalled();
        expect(mockCtx.json).toHaveBeenCalledWith(
          {
            status: 'completed',
            executed: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
            results: { '550e8400-e29b-41d4-a716-446655440001': 'result1', '550e8400-e29b-41d4-a716-446655440002': 'result2' },
            awaitingSpec: undefined,
            resumeToken: undefined,
            warnings: [],
            error: undefined,
          },
          200
        );
      });

      it('should return 404 when tool_version_id not found', async () => {
        mockCtx.req.json.mockResolvedValue({ tool_version_id: '550e8400-e29b-41d4-a716-446655440000' });
        mockGlobalDb.getToolVersion.mockResolvedValue(null);

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'tool_version_id not found' } },
          404
        );
      });

      it('should return 500 for invalid tool version manifest', async () => {
        const toolVersion = {
          graphManifest: { invalid: 'manifest' },
        };

        mockCtx.req.json.mockResolvedValue({ tool_version_id: '550e8400-e29b-41d4-a716-446655440000' });
        mockGlobalDb.getToolVersion.mockResolvedValue(toolVersion);

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'Stored tool version manifest invalid' } },
          500
        );
      });

      it('should handle database errors during resolution', async () => {
        mockCtx.req.json.mockResolvedValue({ tool_version_id: '550e8400-e29b-41d4-a716-446655440000' });
        mockGlobalDb.getToolVersion.mockRejectedValue(new Error('DB error'));

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'DB error' } },
          500
        );
      });

      it('should handle database errors with no message', async () => {
        mockCtx.req.json.mockResolvedValue({ tool_version_id: '550e8400-e29b-41d4-a716-446655440000' });
        mockGlobalDb.getToolVersion.mockRejectedValue({});

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'Failed to resolve tool_version_id' } },
          500
        );
      });

      it('should use injected database service when available', async () => {
        const injectedDb = new MockDatabaseService();
        const injectedGlobalDb = { getToolVersion: vi.fn().mockResolvedValue(null) };
        injectedDb.getGlobal.mockReturnValue(injectedGlobalDb);

        const ctrl = new ToolsExecuteController(undefined, undefined, injectedDb);
        mockCtx.req.json.mockResolvedValue({ tool_version_id: '550e8400-e29b-41d4-a716-446655440000' });

        await ctrl.execute(mockCtx as any);

        expect(injectedGlobalDb.getToolVersion).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
      });

      it('should handle spec resolution with missing specs', async () => {
        const toolVersion = {
          graphManifest: {
            ordered_specs: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
            entry_spec: '550e8400-e29b-41d4-a716-446655440001',
            edges: [{ from: '550e8400-e29b-41d4-a716-446655440001', to: '550e8400-e29b-41d4-a716-446655440002' }],
          },
        };

        mockCtx.req.json.mockResolvedValue({ tool_version_id: '550e8400-e29b-41d4-a716-446655440000' });
        mockGlobalDb.getToolVersion.mockResolvedValue(toolVersion);
        mockGlobalDb.getSpecsByHashes.mockResolvedValue({}); // No specs found

        mockEngine.run.mockResolvedValue({
          status: 'completed',
          executed: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
          results: { '550e8400-e29b-41d4-a716-446655440001': 'result1', '550e8400-e29b-41d4-a716-446655440002': 'result2' },
          warnings: [],
        });

        await controller.execute(mockCtx as any);

        expect(mockEngine.run).toHaveBeenCalledWith(
          expect.objectContaining({
            nodes: {
              '550e8400-e29b-41d4-a716-446655440001': { hash: '550e8400-e29b-41d4-a716-446655440001', intent: 'autonomous', sideEffect: false },
              '550e8400-e29b-41d4-a716-446655440002': { hash: '550e8400-e29b-41d4-a716-446655440002', intent: 'autonomous', sideEffect: false },
            },
          }),
          undefined
        );
      });
    });

    describe('run path', () => {
      const validGraph = {
        entry: 'spec1',
        nodes: {
          spec1: { intent: 'autonomous', sideEffect: false },
          spec2: { intent: 'human', sideEffect: false },
        },
        edges: [{ from: 'spec1', to: 'spec2' }],
      };

      it('should execute run path successfully', async () => {
        mockCtx.req.json.mockResolvedValue({ graph: validGraph });
        mockEngine.run.mockResolvedValue({
          status: 'completed',
          executed: ['spec1', 'spec2'],
          results: { spec1: 'result1', spec2: 'result2' },
          warnings: [],
        });

        await controller.execute(mockCtx as any);

        expect(mockEngine.run).toHaveBeenCalledWith(validGraph, undefined);
        expect(mockCtx.json).toHaveBeenCalledWith(
          {
            status: 'completed',
            executed: ['spec1', 'spec2'],
            results: { spec1: 'result1', spec2: 'result2' },
            awaitingSpec: undefined,
            resumeToken: undefined,
            warnings: [],
            error: undefined,
          },
          200
        );
      });

      it('should handle awaiting_input status with resume token', async () => {
        mockCtx.req.json.mockResolvedValue({ graph: validGraph });
        mockEngine.run.mockResolvedValue({
          status: 'awaiting_input',
          executed: ['spec1'],
          results: { spec1: 'result1' },
          warnings: [],
          awaitingSpec: 'spec2',
          resumeToken: 'token123',
        });

        await controller.execute(mockCtx as any);

        expect(mockPausedStore.save).toHaveBeenCalledWith('token123', expect.any(Object));
        expect(mockCtx.json).toHaveBeenCalledWith(
          {
            status: 'awaiting_input',
            executed: ['spec1'],
            results: { spec1: 'result1' },
            awaitingSpec: 'spec2',
            resumeToken: 'token123',
            warnings: [],
            error: undefined,
          },
          200
        );
      });

      it('should handle session context', async () => {
        mockCtx.req.json.mockResolvedValue({
          graph: validGraph,
          session: { id: 'session1', client_id: 'client1', force: true },
        });
        mockEngine.run.mockResolvedValue({
          status: 'completed',
          executed: ['spec1', 'spec2'],
          results: { spec1: 'result1', spec2: 'result2' },
          warnings: [],
        });

        await controller.execute(mockCtx as any);

        expect(mockEngine.run).toHaveBeenCalledWith(validGraph, {
          sessionId: 'session1',
          clientId: 'client1',
          force: true,
        });
      });

      it('should return 400 when graph is missing', async () => {
        mockCtx.req.json.mockResolvedValue({});

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'Invalid request', details: expect.any(Object) } },
          400
        );
      });

      it('should handle error status from engine', async () => {
        mockCtx.req.json.mockResolvedValue({ graph: validGraph });
        mockEngine.run.mockResolvedValue({
          status: 'error',
          executed: ['spec1'],
          results: { spec1: 'result1' },
          warnings: [],
          error: { message: 'Engine error' },
          errorCode: SpecEngineErrorCode.GRAPH_CYCLE,
        });

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          {
            status: 'error',
            executed: ['spec1'],
            results: { spec1: 'result1' },
            awaitingSpec: undefined,
            resumeToken: undefined,
            warnings: [],
            error: { message: 'Engine error', code: SpecEngineErrorCode.GRAPH_CYCLE },
          },
          422
        );
      });
    });

    describe('resume path', () => {
      const resumeToken = 'token123';
      const pausedState: SerializedPausedState = {
        plan: { steps: [], warnings: [] },
        currentIndex: 0,
        executed: ['550e8400-e29b-41d4-a716-446655440001'],
        results: { '550e8400-e29b-41d4-a716-446655440001': 'result1' },
        warnings: [],
        awaitingSpec: '550e8400-e29b-41d4-a716-446655440002',
        sessionContext: {},
      };

      it('should execute resume path successfully', async () => {
        const validGraph = {
          entry: '550e8400-e29b-41d4-a716-446655440001',
          nodes: {
            '550e8400-e29b-41d4-a716-446655440001': { intent: 'autonomous', sideEffect: false },
            '550e8400-e29b-41d4-a716-446655440002': { intent: 'human', sideEffect: false },
          },
          edges: [{ from: '550e8400-e29b-41d4-a716-446655440001', to: '550e8400-e29b-41d4-a716-446655440002' }],
        };

        mockCtx.req.json.mockResolvedValue({
          resumeToken,
          human_input: { specHash: '550e8400-e29b-41d4-a716-446655440002', output: 'human output' },
          graph: validGraph,
        });
        mockPausedStore.get.mockResolvedValue(pausedState);
        mockEngine.resume.mockResolvedValue({
          status: 'completed',
          executed: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
          results: { '550e8400-e29b-41d4-a716-446655440001': 'result1', '550e8400-e29b-41d4-a716-446655440002': 'human output' },
          warnings: [],
        });

        await controller.execute(mockCtx as any);

        expect(mockPausedStore.get).toHaveBeenCalledWith(resumeToken);
        expect(mockEngine.resume).toHaveBeenCalledWith(
          validGraph,
          pausedState,
          { specHash: '550e8400-e29b-41d4-a716-446655440002', humanOutput: 'human output' },
          undefined
        );
        expect(mockPausedStore.delete).toHaveBeenCalledWith(resumeToken);
        expect(mockCtx.json).toHaveBeenCalledWith(
          {
            status: 'completed',
            executed: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
            results: { '550e8400-e29b-41d4-a716-446655440001': 'result1', '550e8400-e29b-41d4-a716-446655440002': 'human output' },
            awaitingSpec: undefined,
            resumeToken: undefined,
            warnings: [],
            error: undefined,
          },
          200
        );
      });

      it('should return 404 when resume token not found', async () => {
        mockCtx.req.json.mockResolvedValue({
          resumeToken,
          human_input: { specHash: '550e8400-e29b-41d4-a716-446655440002', output: 'output' },
        });
        mockPausedStore.get.mockResolvedValue(undefined);

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'resumeToken not found' } },
          404
        );
      });

      it('should return 400 when graph is missing for resume', async () => {
        mockCtx.req.json.mockResolvedValue({
          resumeToken,
          human_input: { specHash: '550e8400-e29b-41d4-a716-446655440002', output: 'output' },
        });
        mockPausedStore.get.mockResolvedValue(pausedState);

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'graph or tool_version_id required for resume' } },
          400
        );
      });

      it('should handle awaiting_input in resume', async () => {
        const validGraph = {
          entry: '550e8400-e29b-41d4-a716-446655440001',
          nodes: {
            '550e8400-e29b-41d4-a716-446655440001': { intent: 'autonomous', sideEffect: false },
            '550e8400-e29b-41d4-a716-446655440002': { intent: 'human', sideEffect: false },
            '550e8400-e29b-41d4-a716-446655440003': { intent: 'human', sideEffect: false },
          },
          edges: [
            { from: '550e8400-e29b-41d4-a716-446655440001', to: '550e8400-e29b-41d4-a716-446655440002' },
            { from: '550e8400-e29b-41d4-a716-446655440002', to: '550e8400-e29b-41d4-a716-446655440003' },
          ],
        };

        mockCtx.req.json.mockResolvedValue({
          resumeToken,
          human_input: { specHash: '550e8400-e29b-41d4-a716-446655440002', output: 'output' },
          graph: validGraph,
        });
        mockPausedStore.get.mockResolvedValue(pausedState);
        mockEngine.resume.mockResolvedValue({
          status: 'awaiting_input',
          executed: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
          results: { '550e8400-e29b-41d4-a716-446655440001': 'result1', '550e8400-e29b-41d4-a716-446655440002': 'output' },
          warnings: [],
          awaitingSpec: '550e8400-e29b-41d4-a716-446655440003',
          resumeToken: 'newtoken',
        });

        await controller.execute(mockCtx as any);

        expect(mockPausedStore.delete).not.toHaveBeenCalled();
        expect(mockCtx.json).toHaveBeenCalledWith(
          {
            status: 'awaiting_input',
            executed: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
            results: { '550e8400-e29b-41d4-a716-446655440001': 'result1', '550e8400-e29b-41d4-a716-446655440002': 'output' },
            awaitingSpec: '550e8400-e29b-41d4-a716-446655440003',
            resumeToken: 'newtoken',
            warnings: [],
            error: undefined,
          },
          200
        );
      });
    });

    describe('error handling', () => {
      it('should handle internal errors with message', async () => {
        mockCtx.req.json.mockRejectedValue(new Error('Parse error'));

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'Parse error' } },
          500
        );
      });

      it('should handle internal errors without message', async () => {
        mockCtx.req.json.mockRejectedValue({});

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'Internal error' } },
          500
        );
      });
    });

    describe('schema validation', () => {
      it('should require human_input when resumeToken provided', async () => {
        mockCtx.req.json.mockResolvedValue({
          resumeToken: 'token123',
          // missing human_input
          graph: { entry: 'spec1', nodes: {}, edges: [] },
        });

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'Invalid request', details: expect.any(Object) } },
          400
        );
      });

      it('should require graph or tool_version_id for run', async () => {
        mockCtx.req.json.mockResolvedValue({
          // missing graph and tool_version_id
        });

        await controller.execute(mockCtx as any);

        expect(mockCtx.json).toHaveBeenCalledWith(
          { error: { message: 'Invalid request', details: expect.any(Object) } },
          400
        );
      });
    });
  });
});