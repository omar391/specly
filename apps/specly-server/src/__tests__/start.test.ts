import { describe, it, expect, beforeAll, vi } from 'vitest';
import { StartTool, startToolSchema } from '../tools/start.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { WorkspaceRulesRepository } from '../repositories/workspace-rules-repository.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';

// Mock dependencies
vi.mock('../database/global-queries.js');
vi.mock('../services/prompt-orchestrator.js');
vi.mock('../repositories/workspace-rules-repository.js');

let mockDrizzleDb: DrizzleDatabaseManager;
let mockGlobalDb: GlobalDatabaseService;
let mockOrchestrator: PromptOrchestrator;
let mockRulesRepo: WorkspaceRulesRepository;
let startTool: StartTool;

describe('StartTool', () => {
  beforeAll(() => {
    mockDrizzleDb = {} as DrizzleDatabaseManager;
    mockGlobalDb = new GlobalDatabaseService();
    mockOrchestrator = new PromptOrchestrator(mockDrizzleDb);
    mockRulesRepo = new WorkspaceRulesRepository(mockGlobalDb);

    // Setup mocks
    vi.mocked(GlobalDatabaseService).mockImplementation(() => mockGlobalDb);
    vi.mocked(PromptOrchestrator).mockImplementation(() => mockOrchestrator);
    vi.mocked(WorkspaceRulesRepository).mockImplementation(() => mockRulesRepo);

    // Mock getDrizzleManager to return a mock that has getDb
    vi.mocked(mockGlobalDb.getDrizzleManager).mockReturnValue({
      getDb: vi.fn().mockReturnValue({}),
      initialize: vi.fn(),
      transaction: vi.fn(),
      close: vi.fn(),
      isReady: vi.fn().mockReturnValue(true)
    } as any);

    startTool = new StartTool(mockDrizzleDb);
  });

  describe('execute', () => {
    it('successfully starts a new session for new workspace', async () => {
      const input = { workspace_path: '/tmp/test-workspace' };
      const mockWorkspace = {
        id: 'ws-123',
        name: 'test-workspace',
        path: '/tmp/test-workspace',
        status: 'active' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T00:00:00Z',
        taskCount: 0,
        activeTask: null
      };
      const mockSession = {
        id: 'session-123',
        workspaceId: 'ws-123',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T00:00:00Z'
      };
      const mockOrchestrationResult = {
        prompt_text: 'Welcome to Specly session...',
        session_data: {}
      };

      // Mock dependencies
      vi.mocked(mockGlobalDb.getWorkspaceByPath).mockResolvedValue(null);
      vi.mocked(mockGlobalDb.createWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(mockGlobalDb.createSession).mockResolvedValue(mockSession);
      vi.mocked(mockGlobalDb.getWorkspaceSessions).mockResolvedValue([]);
      vi.mocked(mockOrchestrator.orchestratePrompt).mockResolvedValue(mockOrchestrationResult);
      vi.mocked(mockGlobalDb.updateWorkspaceActivity).mockResolvedValue();
      vi.mocked(mockRulesRepo.list).mockResolvedValue([]);

      const result = await startTool.execute(input);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Welcome to Specly session...');
      expect(result.isError).toBeUndefined();

      expect(mockGlobalDb.getWorkspaceByPath).toHaveBeenCalledWith('/tmp/test-workspace');
      expect(mockGlobalDb.createWorkspace).toHaveBeenCalledWith({
        id: expect.any(String),
        path: '/tmp/test-workspace',
        name: 'test-workspace',
        status: 'active',
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      });
      expect(mockGlobalDb.createSession).toHaveBeenCalledWith({
        id: expect.any(String),
        workspaceId: 'ws-123',
        isActive: true,
        createdAt: expect.any(String),
        lastActivity: expect.any(String)
      });
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        'specly_start',
        'ws-123',
        {
          workspace_name: 'test-workspace',
          workspace_path: '/tmp/test-workspace',
          session_id: 'session-123',
          timestamp: expect.any(String),
          workspace_rules: [],
          standard_global_rules: []
        }
      );
      expect(mockGlobalDb.updateWorkspaceActivity).toHaveBeenCalledWith('ws-123');
    });

    it('reuses existing workspace and closes active sessions', async () => {
      const input = { workspace_path: '/tmp/existing-workspace' };
      const mockWorkspace = {
        id: 'ws-existing',
        name: 'existing-workspace',
        path: '/tmp/existing-workspace',
        status: 'idle',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T00:00:00Z',
        taskCount: 0,
        activeTask: null
      };
      const mockExistingSession = {
        id: 'old-session',
        workspaceId: 'ws-existing',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T00:00:00Z'
      };
      const mockNewSession = {
        id: 'new-session',
        workspaceId: 'ws-existing',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T00:00:00Z'
      };
      const mockOrchestrationResult = {
        prompt_text: 'Resumed Specly session...',
        session_data: {}
      };

      // Mock dependencies
      vi.mocked(mockGlobalDb.getWorkspaceByPath).mockResolvedValue({ ...mockWorkspace, status: 'idle' as const });
      vi.mocked(mockGlobalDb.updateWorkspace).mockResolvedValue({ ...mockWorkspace, status: 'active' });
      vi.mocked(mockGlobalDb.getWorkspaceSessions).mockResolvedValue([mockExistingSession]);
      vi.mocked(mockGlobalDb.closeSession).mockResolvedValue();
      vi.mocked(mockGlobalDb.createSession).mockResolvedValue(mockNewSession);
      vi.mocked(mockOrchestrator.orchestratePrompt).mockResolvedValue(mockOrchestrationResult);
      vi.mocked(mockGlobalDb.updateWorkspaceActivity).mockResolvedValue();
      vi.mocked(mockRulesRepo.list).mockResolvedValue([]);

      const result = await startTool.execute(input);

      expect(result.content[0].text).toBe('Resumed Specly session...');
      expect(mockGlobalDb.updateWorkspace).toHaveBeenCalledWith('ws-existing', {
        status: 'active',
        updatedAt: expect.any(String)
      });
      expect(mockGlobalDb.closeSession).toHaveBeenCalledWith('old-session');
    });

    it('handles errors gracefully', async () => {
      const input = { workspace_path: '/tmp/error-workspace' };

      vi.mocked(mockGlobalDb.getWorkspaceByPath).mockRejectedValue(new Error('Database connection failed'));

      const result = await startTool.execute(input);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error initiating Specly session: Database connection failed');
    });

    it('handles non-Error exceptions', async () => {
      const input = { workspace_path: '/tmp/error-workspace' };

      vi.mocked(mockGlobalDb.getWorkspaceByPath).mockRejectedValue('String error');

      const result = await startTool.execute(input);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error initiating Specly session: Unknown error');
    });
  });

  describe('getToolDefinition', () => {
    it('returns correct tool definition', () => {
      const definition = StartTool.getToolDefinition();

      expect(definition).toEqual({
        name: 'specly_start',
        description: 'Initialize Specly session for a workspace and provide comprehensive project context',
        inputSchema: {
          type: 'object',
          properties: {
            workspace_path: {
              type: 'string',
              description: 'Absolute path to the workspace directory'
            }
          },
          required: ['workspace_path']
        }
      });
    });
  });

  describe('input validation', () => {
    it('validates correct input', () => {
      const input = { workspace_path: '/tmp/test' };
      const result = startToolSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects missing workspace_path', () => {
      const input = {};
      const result = startToolSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects non-string workspace_path', () => {
      const input = { workspace_path: 123 };
      const result = startToolSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});