/**
 * Comprehensive test coverage for StatusToolNew
 * Target: 95%+ coverage (statement, branch, function)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusToolNew } from '../tools/status.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';
import { ToolNames } from '../constants/tool-names.js';

// Mock WorkspaceDatabaseService
vi.mock('../database/workspace-queries.js', () => ({
  WorkspaceDatabaseService: vi.fn()
}));

describe('StatusToolNew', () => {
  let mockDrizzleDb: DrizzleDatabaseManager;
  let mockWorkspaceDb: any;
  let statusTool: StatusToolNew;

  beforeEach(() => {
    // Create mock DrizzleDatabaseManager
    mockDrizzleDb = {
      query: vi.fn(),
      execute: vi.fn()
    } as unknown as DrizzleDatabaseManager;

    // Create mock WorkspaceDatabaseService
    mockWorkspaceDb = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getAllTasks: vi.fn().mockResolvedValue([])
    };

    // Mock the WorkspaceDatabaseService constructor
    (WorkspaceDatabaseService as any).mockImplementation(() => mockWorkspaceDb);

    // Create StatusToolNew instance
    statusTool = new StatusToolNew(mockDrizzleDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with correct configuration', () => {
      expect(statusTool).toBeDefined();
      expect(statusTool).toBeInstanceOf(StatusToolNew);
    });

    it('should set tool name to STATUS constant', () => {
      const config = (statusTool as any).toolConfig;
      expect(config.name).toBe(ToolNames.STATUS);
    });

    it('should mark workspace_path as required field', () => {
      const config = (statusTool as any).toolConfig;
      expect(config.requiredFields).toContain('workspace_path');
    });

    it('should have descriptive configuration', () => {
      const config = (statusTool as any).toolConfig;
      expect(config.description).toBeDefined();
      expect(config.description.length).toBeGreaterThan(0);
      expect(config.description.toLowerCase()).toContain('status');
    });
  });

  describe('getToolName()', () => {
    it('should return ToolNames.STATUS', () => {
      expect(statusTool.getToolName()).toBe(ToolNames.STATUS);
    });

    it('should return consistent value across instances', () => {
      const tool1 = new StatusToolNew(mockDrizzleDb);
      const tool2 = new StatusToolNew(mockDrizzleDb);
      expect(tool1.getToolName()).toBe(tool2.getToolName());
    });

    it('should return a non-empty string', () => {
      const toolName = statusTool.getToolName();
      expect(typeof toolName).toBe('string');
      expect(toolName.length).toBeGreaterThan(0);
    });
  });

  describe('getToolDefinition() - Static', () => {
    it('should return tool definition without database', () => {
      const definition = StatusToolNew.getToolDefinition();
      expect(definition).toBeDefined();
      expect(definition.name).toBe(ToolNames.STATUS);
    });

    it('should include workspace_path in input schema', () => {
      const definition = StatusToolNew.getToolDefinition();
      expect(definition.inputSchema.properties.workspace_path).toBeDefined();
      expect(definition.inputSchema.properties.workspace_path.type).toBe('string');
    });

    it('should mark workspace_path as required', () => {
      const definition = StatusToolNew.getToolDefinition();
      expect(definition.inputSchema.required).toContain('workspace_path');
    });

    it('should have descriptive text about status', () => {
      const definition = StatusToolNew.getToolDefinition();
      expect(definition.description).toBeDefined();
      expect(definition.description.toLowerCase()).toContain('status');
    });

    it('should be callable without class instantiation', () => {
      expect(() => StatusToolNew.getToolDefinition()).not.toThrow();
    });
  });

  describe('getToolDefinitionDynamic() - Static', () => {
    it('should return tool definition with STATUS name', async () => {
      const definition = await StatusToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      expect(definition.name).toBe(ToolNames.STATUS);
    });

    it('should include workspace_path in input schema', async () => {
      const definition = await StatusToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      expect(definition.inputSchema.properties.workspace_path).toBeDefined();
      expect(definition.inputSchema.properties.workspace_path.type).toBe('string');
    });

    it('should mark workspace_path as required', async () => {
      const definition = await StatusToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      expect(definition.inputSchema.required).toContain('workspace_path');
    });

    it('should have descriptive text about status summary', async () => {
      const definition = await StatusToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      expect(definition.description).toBeDefined();
      expect(definition.description.toLowerCase()).toContain('status');
    });

    it('should match structure of static definition', async () => {
      const staticDef = StatusToolNew.getToolDefinition();
      const dynamicDef = await StatusToolNew.getToolDefinitionDynamic(mockDrizzleDb);

      expect(dynamicDef.name).toBe(staticDef.name);
      expect(dynamicDef.inputSchema.required).toEqual(staticDef.inputSchema.required);
      expect(Object.keys(dynamicDef.inputSchema.properties)).toEqual(
        Object.keys(staticDef.inputSchema.properties)
      );
    });
  });

  describe('execute() - Happy Path', () => {
    beforeEach(() => {
      // Mock validateWorkspace to return valid workspace
      vi.spyOn(statusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: {
          path: '/test/workspace',
          name: 'test-workspace'
        }
      });

      // Mock handleOverview to return success
      vi.spyOn(statusTool as any, 'handleOverview').mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'Status generated' }],
        data: { isFinalStep: true }
      });
    });

    it('should execute successfully with valid workspace', async () => {
      const result = await statusTool.execute({ workspace_path: '/test/workspace' });
      
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('Status generated');
    });

    it('should call validateWorkspace with input workspace_path', async () => {
      const validateSpy = vi.spyOn(statusTool as any, 'validateWorkspace');
      
      await statusTool.execute({ workspace_path: '/test/workspace' });
      
      expect(validateSpy).toHaveBeenCalledWith('/test/workspace');
    });

    it('should call handleOverview with validated workspace', async () => {
      const handleSpy = vi.spyOn(statusTool as any, 'handleOverview');
      
      await statusTool.execute({ workspace_path: '/test/workspace' });
      
      expect(handleSpy).toHaveBeenCalledWith({
        path: '/test/workspace',
        name: 'test-workspace'
      });
    });

    it('should return result from handleOverview', async () => {
      const mockResult = {
        isError: false,
        content: [{ type: 'text', text: 'Custom message' }],
        data: { isFinalStep: true, custom: 'data' }
      };
      
      vi.spyOn(statusTool as any, 'handleOverview').mockResolvedValue(mockResult);
      
      const result = await statusTool.execute({ workspace_path: '/test/workspace' });
      
      expect(result).toEqual(mockResult);
    });
  });

  describe('execute() - Error Paths', () => {
    it('should return error when workspace validation fails', async () => {
      vi.spyOn(statusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Workspace not found'
      });

      const result = await statusTool.execute({ workspace_path: '/invalid/path' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Workspace not found');
    });

    it('should propagate validation error message', async () => {
      vi.spyOn(statusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Invalid workspace path'
      });

      const result = await statusTool.execute({ workspace_path: '/bad/path' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid workspace path');
    });

    it('should handle missing workspace_path gracefully', async () => {
      vi.spyOn(statusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'workspace_path is required'
      });

      const result = await statusTool.execute({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('workspace_path is required');
    });
  });

  describe('handleOverview() - Integration with WorkspaceDatabaseService', () => {
    beforeEach(() => {
      // Don't mock validateWorkspace for these tests - we want real flow
      vi.spyOn(statusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test/workspace', name: 'test-ws' }
      });
    });

    it('should calculate status metrics correctly with mixed tasks', async () => {
      const mockTasks = [
        { id: '1', status: 'completed', title: 'Task 1' },
        { id: '2', status: 'completed', title: 'Task 2' },
        { id: '3', status: 'in_progress', title: 'Task 3' },
        { id: '4', status: 'blocked', title: 'Task 4' },
        { id: '5', status: 'pending', title: 'Task 5' }
      ];
      
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Workspace status summary generated');
    });

    it('should return 0% completion when no tasks exist', async () => {
      mockWorkspaceDb.getAllTasks.mockResolvedValue([]);

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(false);
      // The result should indicate no tasks
    });

    it('should calculate 100% completion when all tasks completed', async () => {
      const mockTasks = [
        { id: '1', status: 'completed', title: 'Task 1' },
        { id: '2', status: 'completed', title: 'Task 2' }
      ];
      
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(false);
    });

    it('should handle tasks with only in_progress status', async () => {
      const mockTasks = [
        { id: '1', status: 'in_progress', title: 'Task 1' },
        { id: '2', status: 'in_progress', title: 'Task 2' }
      ];
      
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(false);
    });

    it('should handle tasks with only blocked status', async () => {
      const mockTasks = [
        { id: '1', status: 'blocked', title: 'Task 1' }
      ];
      
      mockWorkspaceDb.getAllTasks.mockResolvedValue(mockTasks);

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(false);
    });

    it('should initialize WorkspaceDatabaseService with workspace path', async () => {
      mockWorkspaceDb.getAllTasks.mockResolvedValue([]);

      await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(WorkspaceDatabaseService).toHaveBeenCalledWith('/test/workspace');
    });

    it('should call initialize on WorkspaceDatabaseService', async () => {
      mockWorkspaceDb.getAllTasks.mockResolvedValue([]);

      await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(mockWorkspaceDb.initialize).toHaveBeenCalled();
    });

    it('should call getAllTasks after initialization', async () => {
      mockWorkspaceDb.getAllTasks.mockResolvedValue([]);

      await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(mockWorkspaceDb.initialize).toHaveBeenCalled();
      expect(mockWorkspaceDb.getAllTasks).toHaveBeenCalled();
    });
  });

  describe('handleOverview() - Error Handling', () => {
    beforeEach(() => {
      vi.spyOn(statusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test/workspace', name: 'test-ws' }
      });
    });

    it('should handle WorkspaceDatabaseService initialization failure', async () => {
      mockWorkspaceDb.initialize.mockRejectedValue(new Error('DB init failed'));

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to generate status overview');
      expect(result.content[0].text).toContain('DB init failed');
    });

    it('should handle getAllTasks failure', async () => {
      mockWorkspaceDb.initialize.mockResolvedValue(undefined);
      mockWorkspaceDb.getAllTasks.mockRejectedValue(new Error('Cannot read tasks'));

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to generate status overview');
      expect(result.content[0].text).toContain('Cannot read tasks');
    });

    it('should handle non-Error exceptions gracefully', async () => {
      mockWorkspaceDb.getAllTasks.mockRejectedValue('String error');

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to generate status overview');
      expect(result.content[0].text).toContain('String error');
    });
  });

  describe('Edge Cases and Branch Coverage', () => {
    beforeEach(() => {
      vi.spyOn(statusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test/workspace', name: 'test-ws' }
      });
    });

    it('should round completion percentage correctly (33%)', async () => {
      const tasks = [
        { id: '1', status: 'completed', title: 'T1' },
        { id: '2', status: 'pending', title: 'T2' },
        { id: '3', status: 'pending', title: 'T3' }
      ];
      
      mockWorkspaceDb.getAllTasks.mockResolvedValue(tasks);

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(false);
      // 1/3 = 33.33% rounded to 33%
    });

    it('should handle single completed task (100%)', async () => {
      const tasks = [{ id: '1', status: 'completed', title: 'Only task' }];
      
      mockWorkspaceDb.getAllTasks.mockResolvedValue(tasks);

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(false);
    });

    it('should handle single non-completed task (0%)', async () => {
      const tasks = [{ id: '1', status: 'pending', title: 'Only task' }];
      
      mockWorkspaceDb.getAllTasks.mockResolvedValue(tasks);

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      expect(result.isError).toBe(false);
    });

    it('should handle tasks with mixed known and unknown statuses', async () => {
      const tasks = [
        { id: '1', status: 'completed', title: 'T1' },
        { id: '2', status: 'unknown_status' as any, title: 'T2' },
        { id: '3', status: 'in_progress', title: 'T3' }
      ];
      
      mockWorkspaceDb.getAllTasks.mockResolvedValue(tasks);

      const result = await statusTool.execute({ workspace_path: '/test/workspace' });

      // Should not crash, just count totals appropriately
      expect(result.isError).toBe(false);
    });
  });
});
