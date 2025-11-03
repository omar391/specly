import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InitToolNew } from '../tools/init.js';
import { ToolNames } from '../constants/tool-names.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';

// Mock GlobalDatabaseService and PromptOrchestrator at module level
const mockGlobalDb = {
  getWorkspaceByPath: vi.fn()
};

const mockOrchestrator = {
  orchestratePrompt: vi.fn()
};

vi.mock('../database/global-queries.js', () => ({
  GlobalDatabaseService: vi.fn().mockImplementation(() => mockGlobalDb)
}));

vi.mock('../services/prompt-orchestrator.js', () => ({
  PromptOrchestrator: vi.fn().mockImplementation(() => mockOrchestrator)
}));

describe('InitToolNew', () => {
  let mockDrizzleDb: DrizzleDatabaseManager;
  let initTool: InitToolNew;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockDrizzleDb = {
      query: vi.fn(),
      execute: vi.fn()
    } as unknown as DrizzleDatabaseManager;

    mockGlobalDb.getWorkspaceByPath.mockRejectedValue(new Error('Workspace not found'));
    mockOrchestrator.orchestratePrompt.mockResolvedValue({
      prompt_text: 'Initialization plan generated'
    });

    initTool = new InitToolNew(mockDrizzleDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with correct configuration', () => {
      expect(initTool).toBeDefined();
      expect(initTool).toBeInstanceOf(InitToolNew);
      expect((initTool as any).toolConfig).toBeDefined();
      expect((initTool as any).toolConfig.name).toBe(ToolNames.INIT);
    });

    it('should mark workspace_path as required field', () => {
      const config = (initTool as any).toolConfig;
      expect(config.requiredFields).toContain('workspace_path');
    });

    it('should include project_requirements in additional properties', () => {
      const config = (initTool as any).toolConfig;
      expect(config.additionalProperties.project_requirements).toBeDefined();
      expect(config.additionalProperties.project_requirements.type).toBe('string');
    });

    it('should have descriptive configuration', () => {
      const config = (initTool as any).toolConfig;
      expect(config.description).toBeDefined();
      expect(config.description.toLowerCase()).toContain('initialize');
      expect(config.description.length).toBeGreaterThan(0);
    });

    it('should only require workspace_path (project_requirements is optional)', () => {
      const config = (initTool as any).toolConfig;
      expect(config.requiredFields).toHaveLength(1);
      expect(config.requiredFields[0]).toBe('workspace_path');
    });
  });

  describe('Static getToolDefinition()', () => {
    it('should return tool definition without database', () => {
      const definition = InitToolNew.getToolDefinition();
      
      expect(definition).toBeDefined();
      expect(definition.name).toBe('specly_init');
      expect(definition.description).toBeDefined();
      expect(definition.inputSchema).toBeDefined();
    });

    it('should include workspace_path in input schema', () => {
      const definition = InitToolNew.getToolDefinition();
      const properties = definition.inputSchema.properties;
      
      expect(properties.workspace_path).toBeDefined();
      expect(properties.workspace_path.type).toBe('string');
    });

    it('should mark workspace_path as required', () => {
      const definition = InitToolNew.getToolDefinition();
      
      expect(definition.inputSchema.required).toContain('workspace_path');
    });

    it('should include optional project_requirements field', () => {
      const definition = InitToolNew.getToolDefinition();
      const properties = definition.inputSchema.properties;
      
      expect(properties.project_requirements).toBeDefined();
      expect(definition.inputSchema.required).not.toContain('project_requirements');
    });
  });

  describe('Static getToolDefinitionDynamic()', () => {
    it('should return tool definition with INIT name', async () => {
      const definition = await InitToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      
      expect(definition).toBeDefined();
      expect(definition.name).toBe('specly_init');
    });

    it('should include workspace_path in schema', async () => {
      const definition = await InitToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      
      expect(definition.inputSchema.properties.workspace_path).toBeDefined();
    });

    it('should match structure of static definition', async () => {
      const staticDef = InitToolNew.getToolDefinition();
      const dynamicDef = await InitToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      
      expect(dynamicDef.name).toBe(staticDef.name);
      expect(dynamicDef.inputSchema.required).toEqual(staticDef.inputSchema.required);
      expect(Object.keys(dynamicDef.inputSchema.properties).sort()).toEqual(
        Object.keys(staticDef.inputSchema.properties).sort()
      );
    });
  });

  describe('execute() - Method Delegation', () => {
    it('should execute successfully with valid workspace path', async () => {
      const result = await initTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('Initialization plan generated');
    });

    it('should execute with both workspace_path and project_requirements', async () => {
      const result = await initTool.execute({
        workspace_path: '/test/workspace',
        project_requirements: 'Build a todo app'
      });

      expect(result.isError).toBe(false);
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        'specly_init',
        'global',
        expect.objectContaining({
          workspace_path: '/test/workspace',
          project_requirements: 'Build a todo app'
        })
      );
    });

    it('should call initializeWorkspace with input', async () => {
      const spy = vi.spyOn(initTool as any, 'initializeWorkspace');
      
      await initTool.execute({
        workspace_path: '/test/workspace',
        project_requirements: 'Test project'
      });

      expect(spy).toHaveBeenCalledWith({
        workspace_path: '/test/workspace',
        project_requirements: 'Test project'
      });
    });

    it('should handle missing project_requirements gracefully', async () => {
      const result = await initTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBe(false);
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        'specly_init',
        'global',
        expect.objectContaining({
          project_requirements: 'No specific requirements provided'
        })
      );
    });

    it('should return result from initializeWorkspace', async () => {
      mockOrchestrator.orchestratePrompt.mockResolvedValue({
        prompt_text: 'Custom initialization message'
      });

      const result = await initTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.content[0].text).toBe('Custom initialization message');
    });

    it('should delegate all logic to initializeWorkspace', async () => {
      const spy = vi.spyOn(initTool as any, 'initializeWorkspace');
      
      const input = { workspace_path: '/test' };
      await initTool.execute(input);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(input);
    });
  });

  describe('initializeWorkspace() - Workspace Existence Check', () => {
    it('should check if workspace already exists', async () => {
      mockGlobalDb.getWorkspaceByPath.mockResolvedValue({
        path: '/test/workspace',
        name: 'existing',
        id: 123
      });

      const result = await initTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(mockGlobalDb.getWorkspaceByPath).toHaveBeenCalledWith('/test/workspace');
      expect(result.isError).toBe(true);
    });

    it('should return error when workspace is already initialized', async () => {
      mockGlobalDb.getWorkspaceByPath.mockResolvedValue({
        path: '/test/workspace',
        name: 'existing',
        id: 123
      });

      const result = await initTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('already initialized');
      expect(mockOrchestrator.orchestratePrompt).not.toHaveBeenCalled();
    });

    it('should continue initialization if workspace does not exist', async () => {
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue(new Error('Not found'));

      const result = await initTool.execute({
        workspace_path: '/new/workspace'
      });

      expect(result.isError).toBe(false);
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalled();
    });

    it('should handle database query errors gracefully', async () => {
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue(new Error('Database connection failed'));

      const result = await initTool.execute({
        workspace_path: '/test/workspace'
      });

      // Should continue to orchestration despite error
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalled();
    });
  });

  describe('initializeWorkspace() - Orchestration Integration', () => {
    it('should call orchestratePrompt with specly_init tool name', async () => {
      await initTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        'specly_init',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should use global context for orchestration', async () => {
      await initTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        expect.any(String),
        'global',
        expect.any(Object)
      );
    });

    it('should pass workspace_path to orchestration', async () => {
      await initTool.execute({
        workspace_path: '/my/workspace/path'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          workspace_path: '/my/workspace/path'
        })
      );
    });

    it('should pass project_requirements to orchestration', async () => {
      await initTool.execute({
        workspace_path: '/test',
        project_requirements: 'Build a REST API'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          project_requirements: 'Build a REST API'
        })
      );
    });

    it('should use default message when project_requirements missing', async () => {
      await initTool.execute({
        workspace_path: '/test'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          project_requirements: 'No specific requirements provided'
        })
      );
    });

    it('should pass step: initial to orchestration', async () => {
      await initTool.execute({
        workspace_path: '/test'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          step: 'initial'
        })
      );
    });
  });

  describe('initializeWorkspace() - Success Path', () => {
    it('should return success result with prompt text', async () => {
      mockOrchestrator.orchestratePrompt.mockResolvedValue({
        prompt_text: 'Initialization plan: Step 1, Step 2, Step 3'
      });

      const result = await initTool.execute({
        workspace_path: '/test'
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('Initialization plan: Step 1, Step 2, Step 3');
    });

    it('should use createSuccessResult helper', async () => {
      mockOrchestrator.orchestratePrompt.mockResolvedValue({
        prompt_text: 'Success message'
      });

      const result = await initTool.execute({
        workspace_path: '/test'
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.isError).toBe(false);
    });

    it('should preserve full orchestration prompt text', async () => {
      const longText = 'A'.repeat(10000);
      mockOrchestrator.orchestratePrompt.mockResolvedValue({
        prompt_text: longText
      });

      const result = await initTool.execute({
        workspace_path: '/test'
      });

      expect(result.content[0].text).toBe(longText);
      expect(result.content[0].text.length).toBe(10000);
    });
  });

  describe('initializeWorkspace() - Error Handling', () => {
    it('should handle orchestration failure', async () => {
      mockOrchestrator.orchestratePrompt.mockRejectedValue(
        new Error('Orchestration service unavailable')
      );

      const result = await initTool.execute({
        workspace_path: '/test'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to plan workspace initialization');
      expect(result.content[0].text).toContain('Orchestration service unavailable');
    });

    it('should include workspace_path in error data', async () => {
      mockOrchestrator.orchestratePrompt.mockRejectedValue(new Error('Failed'));
      vi.spyOn(initTool as any, 'createErrorResult').mockReturnValue({
        content: [{ type: 'text', text: 'Error' }],
        isError: true
      });

      await initTool.execute({
        workspace_path: '/my/test/path'
      });

      expect((initTool as any).createErrorResult).toHaveBeenCalledWith(
        expect.any(String),
        { workspace_path: '/my/test/path' }
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockOrchestrator.orchestratePrompt.mockRejectedValue('String error');

      const result = await initTool.execute({
        workspace_path: '/test'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('String error');
    });
  });

  describe('Edge Cases - Input Validation', () => {
    it('should handle empty workspace_path', async () => {
      const result = await initTool.execute({
        workspace_path: ''
      });

      // Should pass through to orchestration
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          workspace_path: ''
        })
      );
    });

    it('should handle null workspace_path', async () => {
      const result = await initTool.execute({
        workspace_path: null as any
      });

      // Type coercion or error handling
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalled();
    });

    it('should handle undefined workspace_path', async () => {
      const result = await initTool.execute({});

      // Should handle missing field
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          workspace_path: undefined
        })
      );
    });
  });

  describe('Edge Cases - Special Paths & Characters', () => {
    it('should handle workspace path with spaces', async () => {
      const result = await initTool.execute({
        workspace_path: '/path/with spaces/workspace'
      });

      expect(result.isError).toBe(false);
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          workspace_path: '/path/with spaces/workspace'
        })
      );
    });

    it('should handle relative workspace path', async () => {
      const result = await initTool.execute({
        workspace_path: './relative/path'
      });

      expect(result.isError).toBe(false);
    });

    it('should handle very long project_requirements', async () => {
      const longRequirements = 'A'.repeat(10000);
      const result = await initTool.execute({
        workspace_path: '/test',
        project_requirements: longRequirements
      });

      expect(result.isError).toBe(false);
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          project_requirements: longRequirements
        })
      );
    });
  });

  describe('Edge Cases - Infrastructure Failures', () => {
    it('should handle orchestration returning invalid structure', async () => {
      mockOrchestrator.orchestratePrompt.mockResolvedValue({} as any);

      const result = await initTool.execute({
        workspace_path: '/test'
      });

      // Should handle missing prompt_text (undefined)
      expect(result.content[0].text).toBeUndefined();
    });

    it('should handle special characters in project_requirements', async () => {
      const result = await initTool.execute({
        workspace_path: '/test',
        project_requirements: 'Test "quotes" and \\nNewlines\\t Tabs'
      });

      expect(result.isError).toBe(false);
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          project_requirements: 'Test "quotes" and \\nNewlines\\t Tabs'
        })
      );
    });

    it('should handle workspace path with unicode characters', async () => {
      const result = await initTool.execute({
        workspace_path: '/test/日本語/workspace'
      });

      expect(result.isError).toBe(false);
    });

    it('should handle concurrent initialization attempts', async () => {
      const promise1 = initTool.execute({ workspace_path: '/test1' });
      const promise2 = initTool.execute({ workspace_path: '/test2' });

      const results = await Promise.all([promise1, promise2]);

      expect(results[0].isError).toBe(false);
      expect(results[1].isError).toBe(false);
      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledTimes(2);
    });
  });
});
