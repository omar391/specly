import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseTool, createBaseToolSchema, isToolError, type BaseToolConfig, type ToolDefinition } from '../tools/base-tool.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { SpeclyToolResult } from '../types/index.js';
import { z } from 'zod';

// Mock GlobalDatabaseService
const mockGlobalDb = {
  getWorkspaceByPath: vi.fn()
};

// Mock PromptOrchestrator
const mockOrchestrator = {
  orchestratePrompt: vi.fn()
};

vi.mock('../database/global-queries.js', () => ({
  GlobalDatabaseService: vi.fn().mockImplementation(() => mockGlobalDb)
}));

vi.mock('../services/prompt-orchestrator.js', () => ({
  PromptOrchestrator: vi.fn().mockImplementation(() => mockOrchestrator)
}));

// Concrete implementation for testing
class TestTool extends BaseTool {
  async execute(input: any): Promise<SpeclyToolResult> {
    const validation = await this.validateWorkspace(input.workspace_path);
    if (!validation.isValid) {
      return this.createErrorResult(validation.error!);
    }
    return this.createSuccessResult('Test executed successfully');
  }

  static getToolDefinition(): ToolDefinition {
    return {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_path: { type: 'string', description: 'Workspace path' }
        },
        required: ['workspace_path']
      }
    };
  }
}

describe('BaseTool', () => {
  let tool: TestTool;
  let mockDrizzleDb: DrizzleDatabaseManager;
  let config: BaseToolConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDrizzleDb = {} as DrizzleDatabaseManager;
    config = {
      name: 'test_tool',
      description: 'Test tool for testing',
      requiredFields: ['workspace_path']
    };
    
    mockGlobalDb.getWorkspaceByPath.mockResolvedValue({
      id: 1,
      path: '/test/workspace',
      name: 'test-workspace'
    });

    tool = new TestTool(mockDrizzleDb, config);
  });

  describe('Constructor', () => {
    it('should create instance with config', () => {
      expect(tool).toBeDefined();
      expect(tool).toBeInstanceOf(BaseTool);
      expect(tool).toBeInstanceOf(TestTool);
    });

    it('should store config', () => {
      expect((tool as any).toolConfig).toEqual(config);
    });

    it('should store dbManager', () => {
      expect((tool as any).dbManager).toBe(mockDrizzleDb);
    });
  });

  describe('getToolDefinition', () => {
    it('should return tool definition without stepIds', async () => {
      const definition = await tool.getToolDefinition();
      
      expect(definition.name).toBe('test_tool');
      expect(definition.description).toBe('Test tool for testing');
      expect(definition.inputSchema.properties.workspace_path).toBeDefined();
    });

    it('should include workspace_path property', async () => {
      const definition = await tool.getToolDefinition();
      expect(definition.inputSchema.properties.workspace_path).toEqual({
        type: 'string',
        description: 'Absolute path to the workspace directory'
      });
    });

    it('should use required fields from config', async () => {
      const definition = await tool.getToolDefinition();
      expect(definition.inputSchema.required).toEqual(['workspace_path']);
    });

    it('should not include stepId when no steps available', async () => {
      const definition = await tool.getToolDefinition();
      expect(definition.inputSchema.properties.stepId).toBeUndefined();
    });

    it('should include stepId with enum when steps are available', async () => {
      class ToolWithSteps extends BaseTool {
        protected async getAvailableStepIds(): Promise<string[]> {
          return ['step1', 'step2', 'step3'];
        }

        async execute(input: any): Promise<SpeclyToolResult> {
          return this.createSuccessResult('Success');
        }

        static getToolDefinition(): ToolDefinition {
          return {
            name: 'tool_with_steps',
            description: 'Tool with steps',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          };
        }
      }

      const toolWithSteps = new ToolWithSteps(mockDrizzleDb, config);
      const definition = await toolWithSteps.getToolDefinition();
      
      expect(definition.inputSchema.properties.stepId).toBeDefined();
      expect(definition.inputSchema.properties.stepId.type).toBe('string');
      expect(definition.inputSchema.properties.stepId.enum).toEqual(['step1', 'step2', 'step3']);
      expect(definition.inputSchema.properties.stepId.description).toContain('step1');
    });

    it('should merge additional properties from config', async () => {
      const configWithProps: BaseToolConfig = {
        name: 'test_tool',
        description: 'Test tool',
        requiredFields: ['workspace_path', 'action'],
        additionalProperties: {
          action: {
            type: 'string',
            enum: ['create', 'update'],
            description: 'Action to perform'
          },
          optional_param: {
            type: 'string',
            description: 'Optional parameter'
          }
        }
      };

      const toolWithProps = new TestTool(mockDrizzleDb, configWithProps);
      const definition = await toolWithProps.getToolDefinition();
      
      expect(definition.inputSchema.properties.action).toBeDefined();
      expect(definition.inputSchema.properties.optional_param).toBeDefined();
      expect(definition.inputSchema.required).toContain('action');
    });
  });

  describe('validateWorkspace', () => {
    it('should return valid for existing workspace', async () => {
      const result = await (tool as any).validateWorkspace('/test/workspace');
      
      expect(result.isValid).toBe(true);
      expect(result.workspace).toBeDefined();
      expect(result.workspace.id).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for non-existent workspace', async () => {
      mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);
      
      const result = await (tool as any).validateWorkspace('/invalid/path');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Workspace not found');
      expect(result.error).toContain('/invalid/path');
      expect(result.error).toContain('specly_start');
      expect(result.workspace).toBeUndefined();
    });

    it('should handle database errors', async () => {
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue(new Error('Database error'));
      
      const result = await (tool as any).validateWorkspace('/test/workspace');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Error validating workspace');
      expect(result.error).toContain('Database error');
    });

    it('should handle non-Error exceptions', async () => {
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue('String error');
      
      const result = await (tool as any).validateWorkspace('/test/workspace');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('String error');
    });
  });

  describe('createErrorResult', () => {
    it('should create error result with message', () => {
      const result = (tool as any).createErrorResult('Test error');
      
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Test error');
    });

    it('should accept optional data parameter', () => {
      const result = (tool as any).createErrorResult('Test error', { extra: 'data' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Test error');
    });
  });

  describe('createSuccessResult', () => {
    it('should create success result with text', () => {
      const result = (tool as any).createSuccessResult('Success message');
      
      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Success message');
    });

    it('should accept optional details parameter', () => {
      const result = (tool as any).createSuccessResult('Success', { detail: 'info' });
      
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('Success');
    });
  });

  describe('execute (concrete implementation)', () => {
    it('should execute successfully with valid workspace', async () => {
      const result = await tool.execute({ workspace_path: '/test/workspace' });
      
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('Test executed successfully');
    });

    it('should return error for invalid workspace', async () => {
      mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);
      
      const result = await tool.execute({ workspace_path: '/invalid' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Workspace not found');
    });
  });

  describe('Static getToolDefinition', () => {
    it('should return tool definition', () => {
      const definition = TestTool.getToolDefinition();
      
      expect(definition.name).toBe('test_tool');
      expect(definition.description).toBe('Test tool');
    });

    it('should throw error for base class', () => {
      expect(() => BaseTool.getToolDefinition()).toThrow('must be implemented by subclass');
    });
  });

  describe('validateInputDynamically', () => {
    it('should return valid by default', async () => {
      const result = await (tool as any).validateInputDynamically({ test: 'input' });
      
      expect(result.isValid).toBe(true);
      expect(result.validatedInput).toEqual({ test: 'input' });
      expect(result.error).toBeUndefined();
    });
  });

  describe('getAvailableStepIds', () => {
    it('should return empty array by default', async () => {
      const stepIds = await (tool as any).getAvailableStepIds();
      
      expect(stepIds).toEqual([]);
      expect(Array.isArray(stepIds)).toBe(true);
    });
  });
});

describe('createBaseToolSchema', () => {
  it('should create schema with workspace_path', () => {
    const schema = createBaseToolSchema('test_tool');
    
    expect(schema).toBeDefined();
    const parsed = schema.safeParse({ workspace_path: '/test' });
    expect(parsed.success).toBe(true);
  });

  it('should require workspace_path by default', () => {
    const schema = createBaseToolSchema('test_tool');
    
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('should include additional properties', () => {
    const schema = createBaseToolSchema('test_tool', {
      action: z.string(),
      count: z.number()
    });
    
    const parsed = schema.safeParse({
      workspace_path: '/test',
      action: 'create',
      count: 5
    });
    
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.action).toBe('create');
      expect(parsed.data.count).toBe(5);
    }
  });

  it('should validate additional property types', () => {
    const schema = createBaseToolSchema('test_tool', {
      action: z.enum(['create', 'update'])
    });
    
    const validParsed = schema.safeParse({
      workspace_path: '/test',
      action: 'create'
    });
    expect(validParsed.success).toBe(true);
    
    const invalidParsed = schema.safeParse({
      workspace_path: '/test',
      action: 'invalid'
    });
    expect(invalidParsed.success).toBe(false);
  });

  it('should handle empty additional properties', () => {
    const schema = createBaseToolSchema('test_tool', {});
    
    const parsed = schema.safeParse({ workspace_path: '/test' });
    expect(parsed.success).toBe(true);
  });

  it('should accept custom required fields parameter (not currently applied)', () => {
    // NOTE: The requiredFields parameter is accepted but not currently used in the implementation
    // The function always requires workspace_path and treats additional properties based on their Zod definition
    const schema = createBaseToolSchema('test_tool', {
      action: z.string().optional()
    }, ['workspace_path', 'action']);
    
    // workspace_path is always required
    const parsed = schema.safeParse({ workspace_path: '/test' });
    expect(parsed.success).toBe(true);
  });
});

describe('isToolError', () => {
  it('should return true for error result', () => {
    const errorResult: SpeclyToolResult = {
      content: [{ type: 'text', text: 'Error' }],
      isError: true
    };
    
    expect(isToolError(errorResult)).toBe(true);
  });

  it('should return false for success result', () => {
    const successResult: SpeclyToolResult = {
      content: [{ type: 'text', text: 'Success' }],
      isError: false
    };
    
    expect(isToolError(successResult)).toBe(false);
  });

  it('should return false when isError is undefined', () => {
    const result: SpeclyToolResult = {
      content: [{ type: 'text', text: 'Result' }]
    };
    
    expect(isToolError(result)).toBe(false);
  });

  it('should handle explicit false value', () => {
    const result: SpeclyToolResult = {
      content: [{ type: 'text', text: 'Success' }],
      isError: false
    };
    
    expect(isToolError(result)).toBe(false);
  });
});
