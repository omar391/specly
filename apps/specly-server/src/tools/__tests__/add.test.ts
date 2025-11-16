import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddToolNew } from '../add.js';
import { WorkspaceDatabaseService } from '../../database/workspace-queries.js';
import type { DrizzleDatabaseManager } from '../../database/drizzle-connection.js';

// Mock dependencies
vi.mock('../../database/workspace-queries.js');
vi.mock('../../database/drizzle-connection.js');

const mockDrizzleManager = {
  getDb: vi.fn(),
} as any as DrizzleDatabaseManager;

const mockWorkspaceDb = {
  initialize: vi.fn(),
  createTask: vi.fn(),
};

const mockWorkspaceService = vi.mocked(WorkspaceDatabaseService);
mockWorkspaceService.mockImplementation(() => mockWorkspaceDb as any);

describe('AddToolNew', () => {
  let tool: AddToolNew;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new AddToolNew(mockDrizzleManager);
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(tool).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should create task successfully with all parameters', async () => {
      const input = {
        workspace_path: '/test/workspace',
        task_description: 'Test task description',
        priority: 'High' as const,
        parent_task_id: 'TP-123456',
        title: 'Custom Title'
      };

      // Mock workspace validation
      const mockValidateWorkspace = vi.spyOn(tool as any, 'validateWorkspace');
      mockValidateWorkspace.mockResolvedValue({
        isValid: true,
        workspace: { id: 'ws-1', path: '/test/workspace' }
      });

      mockWorkspaceDb.createTask.mockResolvedValue(undefined);

      const result = await tool.execute(input);

      expect(mockValidateWorkspace).toHaveBeenCalledWith('/test/workspace');
      expect(WorkspaceDatabaseService).toHaveBeenCalledWith('/test/workspace');
      expect(mockWorkspaceDb.initialize).toHaveBeenCalled();
      expect(mockWorkspaceDb.createTask).toHaveBeenCalledWith({
        id: expect.stringMatching(/^TP-\d{6}$/),
        title: 'Custom Title',
        description: 'Test task description',
        priority: 'high',
        status: 'queued',
        progress: 0,
        notes: '',
        assets: [],
        externalReferences: [],
        metadata: {},
        tags: [],
        profileVersionId: null,
        blockedReason: null,
        deletedAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      });

      expect(result).toEqual({
        content: [{ type: 'text', text: expect.stringMatching(/^Task TP-\d{6} created successfully$/) }],
        isError: false
      });
    });

    it('should create task with default priority when not provided', async () => {
      const input = {
        workspace_path: '/test/workspace',
        task_description: 'Test task description'
      };

      const mockValidateWorkspace = vi.spyOn(tool as any, 'validateWorkspace');
      mockValidateWorkspace.mockResolvedValue({
        isValid: true,
        workspace: { id: 'ws-1', path: '/test/workspace' }
      });

      mockWorkspaceDb.createTask.mockResolvedValue(undefined);

      await tool.execute(input);

      expect(mockWorkspaceDb.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'medium' })
      );
    });

    it('should handle priority undefined explicitly', async () => {
      const input = {
        workspace_path: '/test/workspace',
        task_description: 'Test task description',
        priority: undefined
      };

      const mockValidateWorkspace = vi.spyOn(tool as any, 'validateWorkspace');
      mockValidateWorkspace.mockResolvedValue({
        isValid: true,
        workspace: { id: 'ws-1', path: '/test/workspace' }
      });

      mockWorkspaceDb.createTask.mockResolvedValue(undefined);

      await tool.execute(input);

      expect(mockWorkspaceDb.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'medium' })
      );
    });

    it('should handle priority null explicitly', async () => {
      const input = {
        workspace_path: '/test/workspace',
        task_description: 'Test task description',
        priority: null
      };

      const mockValidateWorkspace = vi.spyOn(tool as any, 'validateWorkspace');
      mockValidateWorkspace.mockResolvedValue({
        isValid: true,
        workspace: { id: 'ws-1', path: '/test/workspace' }
      });

      mockWorkspaceDb.createTask.mockResolvedValue(undefined);

      await tool.execute(input);

      expect(mockWorkspaceDb.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'medium' })
      );
    });

    it('should create task with generated title when title not provided', async () => {
      const input = {
        workspace_path: '/test/workspace',
        task_description: 'Test task description for title generation.'
      };

      const mockValidateWorkspace = vi.spyOn(tool as any, 'validateWorkspace');
      mockValidateWorkspace.mockResolvedValue({
        isValid: true,
        workspace: { id: 'ws-1', path: '/test/workspace' }
      });

      mockWorkspaceDb.createTask.mockResolvedValue(undefined);

      await tool.execute(input);

      expect(mockWorkspaceDb.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Test task description for title generation' })
      );
    });

    it('should handle workspace validation failure', async () => {
      const input = {
        workspace_path: '/invalid/workspace',
        task_description: 'Test task description'
      };

      const mockValidateWorkspace = vi.spyOn(tool as any, 'validateWorkspace');
      mockValidateWorkspace.mockResolvedValue({
        isValid: false,
        error: 'Workspace not found'
      });

      const result = await tool.execute(input);

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Workspace not found' }],
        isError: true
      });
    });

    it('should handle database errors', async () => {
      const input = {
        workspace_path: '/test/workspace',
        task_description: 'Test task description'
      };

      const mockValidateWorkspace = vi.spyOn(tool as any, 'validateWorkspace');
      mockValidateWorkspace.mockResolvedValue({
        isValid: true,
        workspace: { id: 'ws-1', path: '/test/workspace' }
      });

      mockWorkspaceDb.createTask.mockRejectedValue(new Error('Database connection failed'));

      const result = await tool.execute(input);

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Failed to create task: Database connection failed' }],
        isError: true
      });
    });

    it('should handle non-Error database errors', async () => {
      const input = {
        workspace_path: '/test/workspace',
        task_description: 'Test task description'
      };

      const mockValidateWorkspace = vi.spyOn(tool as any, 'validateWorkspace');
      mockValidateWorkspace.mockResolvedValue({
        isValid: true,
        workspace: { id: 'ws-1', path: '/test/workspace' }
      });

      mockWorkspaceDb.createTask.mockRejectedValue('String error');

      const result = await tool.execute(input);

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Failed to create task: String error' }],
        isError: true
      });
    });
  });

  describe('generateTaskTitle', () => {
    it('should return first sentence when <= 60 characters', () => {
      const description = 'Short description.';
      const result = (tool as any).generateTaskTitle(description);
      expect(result).toBe('Short description');
    });

    it('should return first sentence when exactly 60 characters', () => {
      const description = 'A'.repeat(59) + '.'; // 60 chars including dot, but firstSentence is 59 chars
      const result = (tool as any).generateTaskTitle(description);
      expect(result).toBe('A'.repeat(59));
    });

    it('should truncate when first sentence > 60 characters', () => {
      const description = 'A'.repeat(70) + '. More text here.';
      const result = (tool as any).generateTaskTitle(description);
      expect(result).toBe('A'.repeat(50) + '...');
    });

    it('should handle description without sentence endings', () => {
      const description = 'Description without punctuation';
      const result = (tool as any).generateTaskTitle(description);
      expect(result).toBe('Description without punctuation');
    });

    it('should handle empty description', () => {
      const description = '';
      const result = (tool as any).generateTaskTitle(description);
      expect(result).toBe('');
    });

    it('should handle description with multiple sentences', () => {
      const description = 'First sentence. Second sentence. Third sentence.';
      const result = (tool as any).generateTaskTitle(description);
      expect(result).toBe('First sentence');
    });

    it('should handle long description without punctuation and <= 60 chars', () => {
      const description = 'A'.repeat(55); // 55 chars, no punctuation
      const result = (tool as any).generateTaskTitle(description);
      expect(result).toBe('A'.repeat(55));
    });

    it('should add ellipsis when description > 60 chars and no sentence', () => {
      const description = 'A'.repeat(70); // 70 chars, no punctuation
      const result = (tool as any).generateTaskTitle(description);
      expect(result).toBe('A'.repeat(50) + '...');
    });
  });

  describe('static methods', () => {
    describe('getToolDefinition', () => {
      it('should return tool definition', () => {
        const definition = AddToolNew.getToolDefinition();
        expect(definition).toEqual({
          name: 'specly_add',
          description: 'Multi-step task creation workflow with analytical validation. Supports dynamic stepId parameter for iterative LLM calls.',
          inputSchema: {
            type: 'object',
            properties: {
              stepId: {
                type: 'string',
                enum: ['validate', 'create'],
                description: 'Optional step ID for multi-step workflow: validate, create'
              },
              task_description: {
                type: 'string',
                description: 'Description of the task to be created'
              },
              workspace_path: {
                type: 'string',
                description: 'Absolute path to the workspace directory'
              },
              priority: {
                type: 'string',
                enum: ['High', 'Medium', 'Low'],
                description: 'Task priority level (defaults to Medium)'
              },
              parent_task_id: {
                type: 'string',
                description: 'ID of parent task if this is a subtask'
              }
            },
            required: ['task_description', 'workspace_path']
          }
        });
      });
    });

    describe('getToolDefinitionDynamic', () => {
      it('should return dynamic tool definition', async () => {
        const definition = await AddToolNew.getToolDefinitionDynamic(mockDrizzleManager);
        expect(definition).toBeDefined();
        expect(definition.name).toBe('specly_add');
      });

      it('should include stepId when available steps exist', async () => {
        const mockGetAvailableStepIds = vi.spyOn(tool as any, 'getAvailableStepIds');
        mockGetAvailableStepIds.mockResolvedValue(['validate', 'create']);

        const definition = await tool.getToolDefinition();

        expect(definition.inputSchema.properties).toHaveProperty('stepId');
        expect(definition.inputSchema.properties.stepId.enum).toEqual(['validate', 'create']);
      });
    });
  });
});