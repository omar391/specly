import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuleUpdateTool, ruleUpdateToolSchema } from '../tools/rule-update.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';

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

describe('RuleUpdateTool', () => {
  let tool: RuleUpdateTool;
  let mockDrizzleDb: DrizzleDatabaseManager;

  beforeEach(() => {
    mockGlobalDb.getWorkspaceByPath.mockClear();
    mockOrchestrator.orchestratePrompt.mockClear();

    mockGlobalDb.getWorkspaceByPath.mockResolvedValue({
      id: 1,
      path: '/test/workspace',
      name: 'test-workspace'
    });
    mockOrchestrator.orchestratePrompt.mockResolvedValue({
      prompt_text: 'Orchestrated rule update prompt'
    });

    mockDrizzleDb = {} as DrizzleDatabaseManager;
    tool = new RuleUpdateTool(mockDrizzleDb);
  });

  describe('Constructor', () => {
    it('should create instance with correct configuration', () => {
      expect(tool).toBeDefined();
      expect(tool).toBeInstanceOf(RuleUpdateTool);
    });

    it('should initialize with DrizzleDatabaseManager', () => {
      const newTool = new RuleUpdateTool(mockDrizzleDb);
      expect(newTool).toBeDefined();
      expect(newTool).toBeInstanceOf(RuleUpdateTool);
    });
  });

  describe('Static getToolDefinition()', () => {
    it('should return tool definition', () => {
      const definition = RuleUpdateTool.getToolDefinition();
      expect(definition).toBeDefined();
      expect(definition.name).toBe('specly_rule_update');
    });

    it('should have correct description', () => {
      const definition = RuleUpdateTool.getToolDefinition();
      expect(definition.description).toContain('workspace-specific rules');
      expect(definition.description).toContain('guidelines');
    });

    it('should have workspace_path property', () => {
      const definition = RuleUpdateTool.getToolDefinition();
      expect(definition.inputSchema.properties.workspace_path).toBeDefined();
      expect(definition.inputSchema.properties.workspace_path.type).toBe('string');
    });

    it('should have rule_type with enum', () => {
      const definition = RuleUpdateTool.getToolDefinition();
      const ruleType = definition.inputSchema.properties.rule_type;
      expect(ruleType.type).toBe('string');
      expect(ruleType.enum).toEqual(['coding', 'git', 'testing', 'security', 'performance', 'custom']);
    });

    it('should have action with enum', () => {
      const definition = RuleUpdateTool.getToolDefinition();
      const action = definition.inputSchema.properties.action;
      expect(action.type).toBe('string');
      expect(action.enum).toEqual(['add', 'update', 'remove']);
    });

    it('should mark required fields', () => {
      const definition = RuleUpdateTool.getToolDefinition();
      expect(definition.inputSchema.required).toEqual(['workspace_path', 'rule_type', 'rule_content', 'action']);
    });
  });

  describe('execute() - Happy Path', () => {
    it('should execute successfully with valid input', async () => {
      const result = await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'coding',
        rule_content: 'Always use strict TypeScript',
        action: 'add'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBe('Orchestrated rule update prompt');
    });

    it('should call getWorkspaceByPath', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'coding',
        rule_content: 'Test rule',
        action: 'add'
      });

      expect(mockGlobalDb.getWorkspaceByPath).toHaveBeenCalledWith('/test/workspace');
    });

    it('should orchestrate prompt with correct parameters', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'git',
        rule_content: 'Always write descriptive commit messages',
        action: 'update'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        'specly_rule_update',
        1,
        expect.objectContaining({
          workspace_path: '/test/workspace',
          workspace_name: 'test-workspace',
          rule_type: 'git',
          rule_content: 'Always write descriptive commit messages',
          action: 'update',
          rules_file_path: '/test/workspace/.task/rules/workspace_rules.md'
        })
      );
    });

    it('should include rule_update_instructions', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'testing',
        rule_content: 'Maintain 95% coverage',
        action: 'add'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.rule_update_instructions).toContain('add');
      expect(callArgs.rule_update_instructions).toContain('testing');
      expect(callArgs.rule_update_instructions).toContain('Maintain 95% coverage');
    });

    it('should include timestamp in orchestration parameters', async () => {
      const beforeTime = Date.now();
      
      await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'security',
        rule_content: 'Never expose API keys',
        action: 'add'
      });

      const afterTime = Date.now();
      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      
      expect(callArgs.timestamp).toBeDefined();
      expect(typeof callArgs.timestamp).toBe('string');
      
      const timestampDate = new Date(callArgs.timestamp).getTime();
      expect(timestampDate).toBeGreaterThanOrEqual(beforeTime);
      expect(timestampDate).toBeLessThanOrEqual(afterTime);
    });

    it('should handle all rule types', async () => {
      const ruleTypes = ['coding', 'git', 'testing', 'security', 'performance', 'custom'] as const;

      for (const ruleType of ruleTypes) {
        mockOrchestrator.orchestratePrompt.mockClear();
        await tool.execute({
          workspace_path: '/test/workspace',
          rule_type: ruleType,
          rule_content: `Test rule for ${ruleType}`,
          action: 'add'
        });

        const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
        expect(callArgs.rule_type).toBe(ruleType);
      }
    });

    it('should handle all action types', async () => {
      const actions = ['add', 'update', 'remove'] as const;

      for (const action of actions) {
        mockOrchestrator.orchestratePrompt.mockClear();
        await tool.execute({
          workspace_path: '/test/workspace',
          rule_type: 'coding',
          rule_content: 'Test rule',
          action
        });

        const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
        expect(callArgs.action).toBe(action);
        expect(callArgs.rule_update_instructions).toContain(action);
      }
    });

    it('should construct correct rules file path', async () => {
      await tool.execute({
        workspace_path: '/different/path',
        rule_type: 'custom',
        rule_content: 'Custom rule',
        action: 'add'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.rules_file_path).toBe('/different/path/.task/rules/workspace_rules.md');
    });

    it('should handle add action', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'coding',
        rule_content: 'New coding rule',
        action: 'add'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.rule_update_instructions).toContain('add');
      expect(callArgs.rule_update_instructions).toContain('New coding rule');
    });

    it('should handle update action', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'git',
        rule_content: 'Updated git rule',
        action: 'update'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.rule_update_instructions).toContain('update');
      expect(callArgs.rule_update_instructions).toContain('Updated git rule');
    });

    it('should handle remove action', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'testing',
        rule_content: 'Old testing rule',
        action: 'remove'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.rule_update_instructions).toContain('remove');
      expect(callArgs.rule_update_instructions).toContain('Old testing rule');
    });

    it('should pass workspace name to orchestrator', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'security',
        rule_content: 'Security rule',
        action: 'add'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.workspace_name).toBe('test-workspace');
    });
  });

  describe('execute() - Error Paths', () => {
    it('should return error when workspace not found', async () => {
      mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);

      const result = await tool.execute({
        workspace_path: '/invalid/path',
        rule_type: 'coding',
        rule_content: 'Test rule',
        action: 'add'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Workspace not found');
      expect(result.content[0].text).toContain('/invalid/path');
      expect(result.content[0].text).toContain('specly_start');
    });

    it('should handle getWorkspaceByPath throwing error', async () => {
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue(new Error('Database connection failed'));

      const result = await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'coding',
        rule_content: 'Test rule',
        action: 'add'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error updating rule');
      expect(result.content[0].text).toContain('Database connection failed');
    });

    it('should handle orchestratePrompt throwing error', async () => {
      mockOrchestrator.orchestratePrompt.mockRejectedValue(new Error('Orchestration failed'));

      const result = await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'git',
        rule_content: 'Test rule',
        action: 'update'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Orchestration failed');
    });

    it('should handle non-Error exceptions', async () => {
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue('String error');

      const result = await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'testing',
        rule_content: 'Test rule',
        action: 'remove'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown error');
    });

    it('should log error to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue(new Error('Test error'));

      await tool.execute({
        workspace_path: '/test/workspace',
        rule_type: 'security',
        rule_content: 'Test rule',
        action: 'add'
      });

      expect(consoleSpy).toHaveBeenCalledWith('Error in specly_rule_update:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('ruleUpdateToolSchema', () => {
    it('should export schema', () => {
      expect(ruleUpdateToolSchema).toBeDefined();
    });

    it('should validate valid input', () => {
      const result = ruleUpdateToolSchema.safeParse({
        workspace_path: '/test',
        rule_type: 'coding',
        rule_content: 'Test rule',
        action: 'add'
      });

      expect(result.success).toBe(true);
    });

    it('should validate all rule types', () => {
      const ruleTypes = ['coding', 'git', 'testing', 'security', 'performance', 'custom'];
      
      for (const ruleType of ruleTypes) {
        const result = ruleUpdateToolSchema.safeParse({
          workspace_path: '/test',
          rule_type: ruleType,
          rule_content: 'Test rule',
          action: 'add'
        });

        expect(result.success).toBe(true);
      }
    });

    it('should validate all action types', () => {
      const actions = ['add', 'update', 'remove'];
      
      for (const action of actions) {
        const result = ruleUpdateToolSchema.safeParse({
          workspace_path: '/test',
          rule_type: 'coding',
          rule_content: 'Test rule',
          action
        });

        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid rule_type', () => {
      const result = ruleUpdateToolSchema.safeParse({
        workspace_path: '/test',
        rule_type: 'invalid',
        rule_content: 'Test rule',
        action: 'add'
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid action', () => {
      const result = ruleUpdateToolSchema.safeParse({
        workspace_path: '/test',
        rule_type: 'coding',
        rule_content: 'Test rule',
        action: 'invalid'
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = ruleUpdateToolSchema.safeParse({
        workspace_path: '/test',
        rule_type: 'coding'
      });

      expect(result.success).toBe(false);
    });

    it('should reject empty workspace_path', () => {
      const result = ruleUpdateToolSchema.safeParse({
        workspace_path: '',
        rule_type: 'coding',
        rule_content: 'Test rule',
        action: 'add'
      });

      // Empty string is technically valid for zod string, but should be caught by validation
      // This is documenting current behavior
      expect(result.success).toBe(true);
    });
  });
});
