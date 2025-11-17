import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FocusToolNew } from '../focus.js';
import type { DrizzleDatabaseManager } from '../../database/drizzle-connection.js';

// Mock dependencies
vi.mock('../../database/drizzle-connection.js');
vi.mock('../../services/prompt-orchestrator.js');
vi.mock('../../database/global-queries.js');

describe('FocusToolNew', () => {
  let mockDbManager: DrizzleDatabaseManager;
  let tool: FocusToolNew;

  beforeEach(() => {
    // Mock the database manager
    mockDbManager = {
      // Add minimal mock methods as needed
    } as DrizzleDatabaseManager;

    tool = new FocusToolNew(mockDbManager);
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(tool.toolConfig.name).toBe('specly_focus');
      expect(tool.toolConfig.description).toBe('Focus on specific task and provide implementation guidance. Supports multi-step workflow.');
      expect(tool.toolConfig.requiredFields).toEqual(['task_id', 'workspace_path']);
      expect(tool.toolConfig.additionalProperties).toHaveProperty('task_id');
    });
  });

  describe('execute', () => {
    it('should return success with default query when workspace is valid', async () => {
      // Mock validateWorkspace to return valid
      const mockValidateWorkspace = vi.spyOn(tool, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { id: 'ws-1', path: '/test' }
      });

      const input = { task_id: 'TP-001', workspace_path: '/test' };
      const result = await tool.execute(input);

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Focus captured: focus' }],
        isError: false
      });
      expect(mockValidateWorkspace).toHaveBeenCalledWith('/test');
    });

    it('should return success with custom query when provided', async () => {
      const mockValidateWorkspace = vi.spyOn(tool, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { id: 'ws-1', path: '/test' }
      });

      const input = { task_id: 'TP-001', workspace_path: '/test', query: 'custom focus' };
      const result = await tool.execute(input);

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Focus captured: custom focus' }],
        isError: false
      });
    });

    it('should return error when workspace validation fails', async () => {
      const mockValidateWorkspace = vi.spyOn(tool, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Workspace not found'
      });

      const input = { task_id: 'TP-001', workspace_path: '/invalid' };
      const result = await tool.execute(input);

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Workspace not found' }],
        isError: true
      });
    });

    it('should handle errors and return error result', async () => {
      const mockValidateWorkspace = vi.spyOn(tool, 'validateWorkspace').mockRejectedValue(new Error('Validation error'));

      const input = { task_id: 'TP-001', workspace_path: '/test' };
      const result = await tool.execute(input);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Error in specly_focus: Validation error');
    });

    it('should handle non-Error exceptions', async () => {
      const mockValidateWorkspace = vi.spyOn(tool, 'validateWorkspace').mockRejectedValue('String error');

      const input = { task_id: 'TP-001', workspace_path: '/test' };
      const result = await tool.execute(input);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Error in specly_focus: String error');
    });
  });

  describe('getToolDefinitionDynamic', () => {
    it('should create instance and return tool definition', async () => {
      const definition = await FocusToolNew.getToolDefinitionDynamic(mockDbManager);

      expect(definition.name).toBe('specly_focus');
      expect(definition.description).toBe('Focus on specific task and provide implementation guidance. Supports multi-step workflow.');
      expect(definition.inputSchema.properties).toHaveProperty('task_id');
      expect(definition.inputSchema.properties).toHaveProperty('workspace_path');
      expect(definition.inputSchema.required).toEqual(['task_id', 'workspace_path']);
    });
  });

  describe('getToolDefinition', () => {
    it('should return static tool definition', () => {
      const definition = FocusToolNew.getToolDefinition();

      expect(definition).toEqual({
        name: 'specly_focus',
        description: 'Focus on specific task and provide implementation guidance. Supports multi-step workflow.',
        inputSchema: {
          type: 'object',
          properties: {
            stepId: {
              type: 'string',
              enum: ['analyze', 'plan', 'implement'],
              description: 'Optional step ID for multi-step workflow: analyze, plan, implement'
            },
            task_id: {
              type: 'string',
              description: 'Task ID to focus on (e.g., TP-001)'
            },
            workspace_path: {
              type: 'string',
              description: 'Absolute path to the workspace directory'
            }
          },
          required: ['task_id', 'workspace_path']
        }
      });
    });
  });
});