import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubTool, githubToolSchema } from '../tools/github.js';
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

describe('GitHubTool', () => {
  let tool: GitHubTool;
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
      prompt_text: 'Orchestrated GitHub prompt'
    });

    mockDrizzleDb = {} as DrizzleDatabaseManager;
    tool = new GitHubTool(mockDrizzleDb);
  });

  describe('Constructor', () => {
    it('should create instance with correct configuration', () => {
      expect(tool).toBeDefined();
      expect(tool).toBeInstanceOf(GitHubTool);
    });

    it('should initialize with DrizzleDatabaseManager', () => {
      const newTool = new GitHubTool(mockDrizzleDb);
      expect(newTool).toBeDefined();
      expect(newTool).toBeInstanceOf(GitHubTool);
    });
  });

  describe('Static getToolDefinition()', () => {
    it('should return tool definition', () => {
      const definition = GitHubTool.getToolDefinition();
      expect(definition).toBeDefined();
      expect(definition.name).toBe('specly_github');
    });

    it('should have correct description', () => {
      const definition = GitHubTool.getToolDefinition();
      expect(definition.description).toContain('GitHub');
      expect(definition.description).toContain('issue');
      expect(definition.description).toContain('PR');
      expect(definition.description).toContain('synchronization');
    });

    it('should have workspace_path property', () => {
      const definition = GitHubTool.getToolDefinition();
      expect(definition.inputSchema.properties.workspace_path).toBeDefined();
      expect(definition.inputSchema.properties.workspace_path.type).toBe('string');
    });

    it('should have action with enum', () => {
      const definition = GitHubTool.getToolDefinition();
      const action = definition.inputSchema.properties.action;
      expect(action.type).toBe('string');
      expect(action.enum).toEqual(['create_issue', 'create_pr', 'sync_tasks']);
    });

    it('should have optional title property', () => {
      const definition = GitHubTool.getToolDefinition();
      expect(definition.inputSchema.properties.title).toBeDefined();
      expect(definition.inputSchema.properties.title.type).toBe('string');
    });

    it('should have optional description property', () => {
      const definition = GitHubTool.getToolDefinition();
      expect(definition.inputSchema.properties.description).toBeDefined();
      expect(definition.inputSchema.properties.description.type).toBe('string');
    });

    it('should have optional branch property', () => {
      const definition = GitHubTool.getToolDefinition();
      expect(definition.inputSchema.properties.branch).toBeDefined();
      expect(definition.inputSchema.properties.branch.type).toBe('string');
    });

    it('should mark required fields', () => {
      const definition = GitHubTool.getToolDefinition();
      expect(definition.inputSchema.required).toEqual(['workspace_path', 'action']);
    });
  });

  describe('execute() - Happy Path', () => {
    it('should execute successfully with minimal input', async () => {
      const result = await tool.execute({
        workspace_path: '/test/workspace',
        action: 'sync_tasks'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBe('Orchestrated GitHub prompt');
    });

    it('should call getWorkspaceByPath', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        action: 'create_issue'
      });

      expect(mockGlobalDb.getWorkspaceByPath).toHaveBeenCalledWith('/test/workspace');
    });

    it('should orchestrate prompt with correct parameters', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        action: 'create_issue',
        title: 'Bug fix',
        description: 'Fix critical bug'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        'specly_github',
        1,
        expect.objectContaining({
          workspace_path: '/test/workspace',
          workspace_name: 'test-workspace',
          action: 'create_issue',
          title: 'Bug fix',
          description: 'Fix critical bug'
        })
      );
    });

    it('should include github_instructions', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        action: 'create_pr'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.github_instructions).toContain('GitHub');
      expect(callArgs.github_instructions).toContain('create_pr');
      expect(callArgs.github_instructions).toContain('MCP tools');
    });

    it('should include timestamp', async () => {
      const beforeTime = Date.now();
      
      await tool.execute({
        workspace_path: '/test/workspace',
        action: 'sync_tasks'
      });

      const afterTime = Date.now();
      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      
      expect(callArgs.timestamp).toBeDefined();
      expect(typeof callArgs.timestamp).toBe('string');
      
      const timestampDate = new Date(callArgs.timestamp).getTime();
      expect(timestampDate).toBeGreaterThanOrEqual(beforeTime);
      expect(timestampDate).toBeLessThanOrEqual(afterTime);
    });

    it('should handle create_issue action', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        action: 'create_issue',
        title: 'New feature request',
        description: 'Add new functionality'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.action).toBe('create_issue');
      expect(callArgs.title).toBe('New feature request');
      expect(callArgs.description).toBe('Add new functionality');
    });

    it('should handle create_pr action', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        action: 'create_pr',
        title: 'Feature PR',
        description: 'Implement feature',
        branch: 'feature/new-feature'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.action).toBe('create_pr');
      expect(callArgs.title).toBe('Feature PR');
      expect(callArgs.branch).toBe('feature/new-feature');
    });

    it('should handle sync_tasks action', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        action: 'sync_tasks'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.action).toBe('sync_tasks');
      expect(callArgs.github_instructions).toContain('sync_tasks');
    });

    it('should handle optional parameters being undefined', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        action: 'sync_tasks'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.title).toBeUndefined();
      expect(callArgs.description).toBeUndefined();
      expect(callArgs.branch).toBeUndefined();
    });

    it('should pass workspace name to orchestrator', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        action: 'create_issue',
        title: 'Test issue'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.workspace_name).toBe('test-workspace');
    });

    it('should handle all action types', async () => {
      const actions = ['create_issue', 'create_pr', 'sync_tasks'] as const;

      for (const action of actions) {
        mockOrchestrator.orchestratePrompt.mockClear();
        await tool.execute({
          workspace_path: '/test/workspace',
          action
        });

        const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
        expect(callArgs.action).toBe(action);
        expect(callArgs.github_instructions).toContain(action);
      }
    });
  });

  describe('execute() - Error Paths', () => {
    it('should return error when workspace not found', async () => {
      mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);

      const result = await tool.execute({
        workspace_path: '/invalid/path',
        action: 'create_issue'
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
        action: 'create_pr'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error performing GitHub action');
      expect(result.content[0].text).toContain('Database connection failed');
    });

    it('should handle orchestratePrompt throwing error', async () => {
      mockOrchestrator.orchestratePrompt.mockRejectedValue(new Error('Orchestration failed'));

      const result = await tool.execute({
        workspace_path: '/test/workspace',
        action: 'sync_tasks'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Orchestration failed');
    });

    it('should handle non-Error exceptions', async () => {
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue('String error');

      const result = await tool.execute({
        workspace_path: '/test/workspace',
        action: 'create_issue'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown error');
    });

    it('should log error to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue(new Error('Test error'));

      await tool.execute({
        workspace_path: '/test/workspace',
        action: 'create_pr'
      });

      expect(consoleSpy).toHaveBeenCalledWith('Error in specly_github:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('githubToolSchema', () => {
    it('should export schema', () => {
      expect(githubToolSchema).toBeDefined();
    });

    it('should validate minimal valid input', () => {
      const result = githubToolSchema.safeParse({
        workspace_path: '/test',
        action: 'sync_tasks'
      });

      expect(result.success).toBe(true);
    });

    it('should validate with all optional parameters', () => {
      const result = githubToolSchema.safeParse({
        workspace_path: '/test',
        action: 'create_pr',
        title: 'Test PR',
        description: 'Test description',
        branch: 'feature/test'
      });

      expect(result.success).toBe(true);
    });

    it('should validate all action types', () => {
      const actions = ['create_issue', 'create_pr', 'sync_tasks'];
      
      for (const action of actions) {
        const result = githubToolSchema.safeParse({
          workspace_path: '/test',
          action
        });

        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid action', () => {
      const result = githubToolSchema.safeParse({
        workspace_path: '/test',
        action: 'invalid_action'
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = githubToolSchema.safeParse({
        workspace_path: '/test'
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing workspace_path', () => {
      const result = githubToolSchema.safeParse({
        action: 'create_issue'
      });

      expect(result.success).toBe(false);
    });

    it('should allow optional title', () => {
      const withTitle = githubToolSchema.safeParse({
        workspace_path: '/test',
        action: 'create_issue',
        title: 'Test'
      });

      const withoutTitle = githubToolSchema.safeParse({
        workspace_path: '/test',
        action: 'create_issue'
      });

      expect(withTitle.success).toBe(true);
      expect(withoutTitle.success).toBe(true);
    });

    it('should allow optional description', () => {
      const result = githubToolSchema.safeParse({
        workspace_path: '/test',
        action: 'create_issue',
        description: 'Test description'
      });

      expect(result.success).toBe(true);
    });

    it('should allow optional branch', () => {
      const result = githubToolSchema.safeParse({
        workspace_path: '/test',
        action: 'create_pr',
        branch: 'main'
      });

      expect(result.success).toBe(true);
    });
  });
});
