import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RemoteInterfaceTool, remoteInterfaceToolSchema } from '../tools/remote-interface.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';

// Mock GlobalDatabaseService
const mockGlobalDb = {
  getWorkspaceByPath: vi.fn(),
  getMcpServerMappingsByType: vi.fn(),
  getDefaultMcpServerMapping: vi.fn()
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

describe('RemoteInterfaceTool', () => {
  let tool: RemoteInterfaceTool;
  let mockDrizzleDb: DrizzleDatabaseManager;

  beforeEach(() => {
    mockGlobalDb.getWorkspaceByPath.mockClear();
    mockGlobalDb.getMcpServerMappingsByType.mockClear();
    mockGlobalDb.getDefaultMcpServerMapping.mockClear();
    mockOrchestrator.orchestratePrompt.mockClear();

    mockGlobalDb.getWorkspaceByPath.mockResolvedValue({
      id: 1,
      path: '/test/workspace',
      name: 'test-workspace'
    });
    mockGlobalDb.getMcpServerMappingsByType.mockResolvedValue([]);
    mockGlobalDb.getDefaultMcpServerMapping.mockResolvedValue(null);
    mockOrchestrator.orchestratePrompt.mockResolvedValue({
      prompt_text: 'Orchestrated prompt'
    });

    mockDrizzleDb = {} as DrizzleDatabaseManager;
    tool = new RemoteInterfaceTool(mockDrizzleDb);
  });

  describe('Constructor', () => {
    it('should create instance with correct configuration', () => {
      expect(tool).toBeDefined();
      expect(tool).toBeInstanceOf(RemoteInterfaceTool);
    });

    it('should initialize with DrizzleDatabaseManager', () => {
      const newTool = new RemoteInterfaceTool(mockDrizzleDb);
      expect(newTool).toBeDefined();
      expect(newTool).toBeInstanceOf(RemoteInterfaceTool);
    });
  });

  describe('Static getToolDefinition()', () => {
    it('should return tool definition', () => {
      const definition = RemoteInterfaceTool.getToolDefinition();
      expect(definition).toBeDefined();
      expect(definition.name).toBe('specly_remote_interface');
    });

    it('should have correct description', () => {
      const definition = RemoteInterfaceTool.getToolDefinition();
      expect(definition.description).toContain('connections');
      expect(definition.description).toContain('external systems');
    });

    it('should have workspace_path property', () => {
      const definition = RemoteInterfaceTool.getToolDefinition();
      expect(definition.inputSchema.properties.workspace_path).toBeDefined();
      expect(definition.inputSchema.properties.workspace_path.type).toBe('string');
    });

    it('should have interface_type with enum', () => {
      const definition = RemoteInterfaceTool.getToolDefinition();
      const interfaceType = definition.inputSchema.properties.interface_type;
      expect(interfaceType.type).toBe('string');
      expect(interfaceType.enum).toEqual(['github', 'jira', 'linear', 'asana', 'trello', 'custom']);
    });

    it('should have action with enum', () => {
      const definition = RemoteInterfaceTool.getToolDefinition();
      const action = definition.inputSchema.properties.action;
      expect(action.type).toBe('string');
      expect(action.enum).toEqual(['connect', 'sync', 'configure', 'test']);
    });

    it('should mark required fields', () => {
      const definition = RemoteInterfaceTool.getToolDefinition();
      expect(definition.inputSchema.required).toEqual(['workspace_path', 'interface_type', 'action']);
    });
  });

  describe('execute() - Happy Path', () => {
    it('should execute successfully with valid input', async () => {
      const result = await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'connect'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toBe('Orchestrated prompt');
    });

    it('should call getWorkspaceByPath', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'connect'
      });

      expect(mockGlobalDb.getWorkspaceByPath).toHaveBeenCalledWith('/test/workspace');
    });

    it('should call getMcpServerMappingsByType with interface_type', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'jira',
        action: 'sync'
      });

      expect(mockGlobalDb.getMcpServerMappingsByType).toHaveBeenCalledWith('jira');
    });

    it('should call getDefaultMcpServerMapping with interface_type', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'linear',
        action: 'configure'
      });

      expect(mockGlobalDb.getDefaultMcpServerMapping).toHaveBeenCalledWith('linear');
    });

    it('should orchestrate prompt with correct parameters', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'test',
        config: '{"token": "abc123"}'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        'specly_remote_interface',
        1,
        expect.objectContaining({
          workspace_path: '/test/workspace',
          workspace_name: 'test-workspace',
          interface_type: 'github',
          action: 'test',
          config: '{"token": "abc123"}',
          available_servers: '[]',
          default_server: null
        })
      );
    });

    it('should handle available MCP server mappings', async () => {
      mockGlobalDb.getMcpServerMappingsByType.mockResolvedValue([
        { mcpServerName: 'github-server-1' },
        { mcpServerName: 'github-server-2' }
      ]);

      await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'connect'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        'specly_remote_interface',
        1,
        expect.objectContaining({
          available_servers: '["github-server-1","github-server-2"]'
        })
      );
    });

    it('should handle default MCP server mapping', async () => {
      mockGlobalDb.getDefaultMcpServerMapping.mockResolvedValue({
        mcpServerName: 'default-github-server'
      });

      await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'connect'
      });

      expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
        'specly_remote_interface',
        1,
        expect.objectContaining({
          default_server: 'default-github-server'
        })
      );
    });

    it('should handle all interface types', async () => {
      const types = ['github', 'jira', 'linear', 'asana', 'trello', 'custom'] as const;

      for (const type of types) {
        mockGlobalDb.getMcpServerMappingsByType.mockClear();
        await tool.execute({
          workspace_path: '/test/workspace',
          interface_type: type,
          action: 'connect'
        });

        expect(mockGlobalDb.getMcpServerMappingsByType).toHaveBeenCalledWith(type);
      }
    });

    it('should handle all action types', async () => {
      const actions = ['connect', 'sync', 'configure', 'test'] as const;

      for (const action of actions) {
        mockOrchestrator.orchestratePrompt.mockClear();
        await tool.execute({
          workspace_path: '/test/workspace',
          interface_type: 'github',
          action
        });

        expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalled();
      }
    });

    it('should include timestamp in orchestration parameters', async () => {
      const beforeTime = Date.now();
      
      await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'connect'
      });

      const afterTime = Date.now();
      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      
      expect(callArgs.timestamp).toBeDefined();
      expect(typeof callArgs.timestamp).toBe('string');
      
      // Parse ISO timestamp to compare
      const timestampDate = new Date(callArgs.timestamp).getTime();
      expect(timestampDate).toBeGreaterThanOrEqual(beforeTime);
      expect(timestampDate).toBeLessThanOrEqual(afterTime);
    });

    it('should include remote_interface_instructions', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'sync'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.remote_interface_instructions).toContain('sync');
      expect(callArgs.remote_interface_instructions).toContain('github');
    });

    it('should handle optional config parameter', async () => {
      await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'connect'
      });

      const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
      expect(callArgs.config).toBeUndefined();
    });
  });

  describe('execute() - Error Paths', () => {
    it('should return error when workspace not found', async () => {
      mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);

      const result = await tool.execute({
        workspace_path: '/invalid/path',
        interface_type: 'github',
        action: 'connect'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Workspace not found');
      expect(result.content[0].text).toContain('/invalid/path');
    });

    it('should handle getWorkspaceByPath throwing error', async () => {
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue(new Error('Database error'));

      const result = await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'connect'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error managing remote interface');
      expect(result.content[0].text).toContain('Database error');
    });

    it('should handle getMcpServerMappingsByType throwing error', async () => {
      mockGlobalDb.getMcpServerMappingsByType.mockRejectedValue(new Error('Mapping error'));

      const result = await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'connect'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Mapping error');
    });

    it('should handle orchestratePrompt throwing error', async () => {
      mockOrchestrator.orchestratePrompt.mockRejectedValue(new Error('Orchestration failed'));

      const result = await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'connect'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Orchestration failed');
    });

    it('should handle non-Error exceptions', async () => {
      mockGlobalDb.getWorkspaceByPath.mockRejectedValue('String error');

      const result = await tool.execute({
        workspace_path: '/test/workspace',
        interface_type: 'github',
        action: 'connect'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown error');
    });
  });

  describe('remoteInterfaceToolSchema', () => {
    it('should export schema', () => {
      expect(remoteInterfaceToolSchema).toBeDefined();
    });

    it('should validate valid input', () => {
      const result = remoteInterfaceToolSchema.safeParse({
        workspace_path: '/test',
        interface_type: 'github',
        action: 'connect'
      });

      expect(result.success).toBe(true);
    });

    it('should validate with config', () => {
      const result = remoteInterfaceToolSchema.safeParse({
        workspace_path: '/test',
        interface_type: 'jira',
        action: 'sync',
        config: '{"key": "value"}'
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid interface_type', () => {
      const result = remoteInterfaceToolSchema.safeParse({
        workspace_path: '/test',
        interface_type: 'invalid',
        action: 'connect'
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid action', () => {
      const result = remoteInterfaceToolSchema.safeParse({
        workspace_path: '/test',
        interface_type: 'github',
        action: 'invalid'
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = remoteInterfaceToolSchema.safeParse({
        workspace_path: '/test'
      });

      expect(result.success).toBe(false);
    });
  });
});
