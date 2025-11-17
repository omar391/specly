import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseTool, createBaseToolSchema, isToolError } from '../base-tool.js';
import type { DrizzleDatabaseManager } from '../../database/drizzle-connection.js';
import type { SpeclyToolResult } from '../../types/index.js';

// Mock dependencies
vi.mock('../../database/drizzle-connection.js');
vi.mock('../../services/prompt-orchestrator.js');
vi.mock('../../database/global-queries.js');

// Create a concrete implementation for testing
class TestBaseTool extends BaseTool {
  async execute(input: any): Promise<SpeclyToolResult> {
    return this.createSuccessResult('test executed');
  }

  static getToolDefinition() {
    return {
      name: 'test-tool',
      description: 'Test tool for base tool testing',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_path: { type: 'string' }
        },
        required: ['workspace_path']
      }
    };
  }
}

describe('BaseTool', () => {
  let mockDbManager: DrizzleDatabaseManager;
  let tool: TestBaseTool;

  beforeEach(() => {
    // Mock the database manager
    mockDbManager = {
      // Add minimal mock methods as needed
    } as DrizzleDatabaseManager;

    tool = new TestBaseTool(mockDbManager, {
      name: 'test-tool',
      description: 'Test tool',
      requiredFields: ['workspace_path']
    });
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(tool.toolConfig.name).toBe('test-tool');
      expect(tool.toolConfig.description).toBe('Test tool');
      expect(tool.toolConfig.requiredFields).toEqual(['workspace_path']);
    });
  });

  describe('getAvailableStepIds', () => {
    it('should return empty array by default', async () => {
      const result = await tool.getAvailableStepIds();
      expect(result).toEqual([]);
    });
  });

  describe('getToolDefinition', () => {
    it('should return tool definition without stepId when no steps available', async () => {
      const definition = await tool.getToolDefinition();

      expect(definition).toEqual({
        name: 'test-tool',
        description: 'Test tool',
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

    it('should include stepId property when steps are available', async () => {
      // Mock getAvailableStepIds to return steps
      vi.spyOn(tool, 'getAvailableStepIds').mockResolvedValue(['step1', 'step2']);

      const definition = await tool.getToolDefinition();

      expect(definition.inputSchema.properties).toHaveProperty('stepId');
      expect(definition.inputSchema.properties.stepId).toEqual({
        type: 'string',
        enum: ['step1', 'step2'],
        description: 'Optional step ID for multi-step workflow: step1, step2'
      });
    });

    it('should merge additional properties from tool config', async () => {
      const toolWithAdditional = new TestBaseTool(mockDbManager, {
        name: 'test-tool',
        description: 'Test tool',
        requiredFields: ['workspace_path'],
        additionalProperties: {
          customField: { type: 'string', description: 'Custom field' }
        }
      });

      const definition = await toolWithAdditional.getToolDefinition();

      expect(definition.inputSchema.properties).toHaveProperty('customField');
      expect(definition.inputSchema.properties.customField).toEqual({
        type: 'string',
        description: 'Custom field'
      });
    });
  });

  describe('validateInputDynamically', () => {
    it('should return valid result by default', async () => {
      const input = { workspace_path: '/test' };
      const result = await tool.validateInputDynamically(input);

      expect(result).toEqual({
        isValid: true,
        validatedInput: input
      });
    });
  });

  describe('validateWorkspace', () => {
    it('should return valid workspace when found', async () => {
      // Mock GlobalDatabaseService
      const mockGlobalDb = {
        getWorkspaceByPath: vi.fn().mockResolvedValue({ id: 'ws-1', path: '/test' })
      };

      // Inject mock into tool
      (tool as any).globalDb = mockGlobalDb;

      const result = await tool.validateWorkspace('/test');

      expect(result).toEqual({
        isValid: true,
        workspace: { id: 'ws-1', path: '/test' }
      });
      expect(mockGlobalDb.getWorkspaceByPath).toHaveBeenCalledWith('/test');
    });

    it('should return error when workspace not found', async () => {
      const mockGlobalDb = {
        getWorkspaceByPath: vi.fn().mockResolvedValue(null)
      };

      (tool as any).globalDb = mockGlobalDb;

      const result = await tool.validateWorkspace('/nonexistent');

      expect(result).toEqual({
        isValid: false,
        error: 'Workspace not found at path: /nonexistent. Please run specly_start first to initialize the workspace.'
      });
    });

    it('should handle database errors', async () => {
      const mockGlobalDb = {
        getWorkspaceByPath: vi.fn().mockRejectedValue(new Error('DB error'))
      };

      (tool as any).globalDb = mockGlobalDb;

      const result = await tool.validateWorkspace('/test');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Error validating workspace: DB error');
    });

    it('should handle non-Error database errors', async () => {
      const mockGlobalDb = {
        getWorkspaceByPath: vi.fn().mockRejectedValue('String error')
      };

      (tool as any).globalDb = mockGlobalDb;

      const result = await tool.validateWorkspace('/test');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Error validating workspace: String error');
    });
  });

  describe('createErrorResult', () => {
    it('should create error result', () => {
      const result = tool.createErrorResult('Test error');

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Test error' }],
        isError: true
      });
    });
  });

  describe('createSuccessResult', () => {
    it('should create success result', () => {
      const result = tool.createSuccessResult('Success message');

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Success message' }],
        isError: false
      });
    });
  });

  describe('execute', () => {
    it('should execute successfully', async () => {
      const result = await tool.execute({ workspace_path: '/test' });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'test executed' }],
        isError: false
      });
    });
  });

  describe('static getToolDefinition', () => {
    it('should throw error for base class', () => {
      expect(() => BaseTool.getToolDefinition()).toThrow(
        'Static getToolDefinition() must be implemented by subclass'
      );
    });

    it('should return definition for concrete subclass', () => {
      const definition = TestBaseTool.getToolDefinition();

      expect(definition).toEqual({
        name: 'test-tool',
        description: 'Test tool for base tool testing',
        inputSchema: {
          type: 'object',
          properties: {
            workspace_path: { type: 'string' }
          },
          required: ['workspace_path']
        }
      });
    });
  });
});

describe('createBaseToolSchema', () => {
  it('should create base schema with required fields', () => {
    const schema = createBaseToolSchema('test-tool', {}, ['workspace_path']);

    expect(schema.shape).toHaveProperty('workspace_path');
    expect(schema.shape.workspace_path._def.typeName).toBe('ZodString');
  });

  it('should include additional properties', () => {
    const schema = createBaseToolSchema('test-tool', {
      customField: { type: 'string', description: 'Custom' }
    }, ['workspace_path']);

    expect(schema.shape).toHaveProperty('customField');
  });
});

describe('isToolError', () => {
  it('should return true for error results', () => {
    const errorResult: SpeclyToolResult = {
      content: [{ type: 'text', text: 'Error' }],
      isError: true
    };

    expect(isToolError(errorResult)).toBe(true);
  });

  it('should return false for success results', () => {
    const successResult: SpeclyToolResult = {
      content: [{ type: 'text', text: 'Success' }],
      isError: false
    };

    expect(isToolError(successResult)).toBe(false);
  });

  it('should return false when isError is undefined', () => {
    const result: SpeclyToolResult = {
      content: [{ type: 'text', text: 'No error flag' }]
    };

    expect(isToolError(result)).toBe(false);
  });
});