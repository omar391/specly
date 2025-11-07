import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateToolNew } from '../tools/update.js';
import { ToolNames } from '../constants/tool-names.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';

// Mock WorkspaceDatabaseService
vi.mock('../database/workspace-queries.js', () => ({
  WorkspaceDatabaseService: vi.fn()
}));

describe('UpdateToolNew', () => {
  let mockDrizzleDb: DrizzleDatabaseManager;
  let updateTool: UpdateToolNew;
  let mockWorkspaceDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockDrizzleDb = {
      query: vi.fn(),
      execute: vi.fn()
    } as unknown as DrizzleDatabaseManager;

    mockWorkspaceDb = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getTask: vi.fn(),
      updateTask: vi.fn().mockResolvedValue(undefined),
      getAllTasks: vi.fn()
    };

    (WorkspaceDatabaseService as any).mockImplementation(() => mockWorkspaceDb);

    updateTool = new UpdateToolNew(mockDrizzleDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create an instance with correct properties', () => {
      expect(updateTool).toBeDefined();
      expect(updateTool).toBeInstanceOf(UpdateToolNew);
      expect((updateTool as any).toolConfig).toBeDefined();
      expect((updateTool as any).toolConfig.name).toBe(ToolNames.UPDATE);
    });

    it('should configure required fields correctly', () => {
      const config = (updateTool as any).toolConfig;
      expect(config.requiredFields).toContain('task_id');
      expect(config.requiredFields).toContain('workspace_path');
      expect(config.requiredFields).toContain('field');
      expect(config.requiredFields).toContain('value');
      expect(config.requiredFields).toHaveLength(4);
    });

    it('should configure field enum with all supported field types', () => {
      const config = (updateTool as any).toolConfig;
      const fieldEnum = config.additionalProperties.field.enum;
      
      expect(fieldEnum).toContain('title');
      expect(fieldEnum).toContain('description');
      expect(fieldEnum).toContain('priority');
      expect(fieldEnum).toContain('status');
      expect(fieldEnum).toContain('progress');
      expect(fieldEnum).toContain('notes');
      expect(fieldEnum).toContain('connected_files');
      expect(fieldEnum).toContain('blocked_by');
      expect(fieldEnum).toHaveLength(8);
    });

    it('should configure description correctly', () => {
      const config = (updateTool as any).toolConfig;
      expect(config.description).toBe('Single-step update of task properties with audit trail.');
    });
  });

  describe('getToolName', () => {
    it('should return the tool name from static method', () => {
      const staticName = UpdateToolNew.getToolDefinition().name;
      expect(staticName).toBe('specly_update');
    });

    it('should return the tool name from instance config', () => {
      const config = (updateTool as any).toolConfig;
      expect(config.name).toBe(ToolNames.UPDATE);
    });
  });

  describe('getToolDefinition - Static', () => {
    it('should return complete tool definition', () => {
      const definition = UpdateToolNew.getToolDefinition();
      
      expect(definition).toBeDefined();
      expect(definition.name).toBe('specly_update');
      expect(definition.description).toBe('Single-step update of task properties with audit trail.');
      expect(definition.inputSchema).toBeDefined();
    });

    it('should include all required fields in schema', () => {
      const definition = UpdateToolNew.getToolDefinition();
      
      expect(definition.inputSchema.required).toContain('task_id');
      expect(definition.inputSchema.required).toContain('workspace_path');
      expect(definition.inputSchema.required).toContain('field');
      expect(definition.inputSchema.required).toContain('value');
    });

    it('should define all properties in schema', () => {
      const definition = UpdateToolNew.getToolDefinition();
      const properties = definition.inputSchema.properties;
      
      expect(properties.task_id).toBeDefined();
      expect(properties.workspace_path).toBeDefined();
      expect(properties.field).toBeDefined();
      expect(properties.value).toBeDefined();
      expect(properties.reason).toBeDefined();
    });

    it('should configure field enum in schema', () => {
      const definition = UpdateToolNew.getToolDefinition();
      const fieldProperty = definition.inputSchema.properties.field;
      
      expect(fieldProperty.enum).toEqual([
        'title', 'description', 'priority', 'status', 
        'progress', 'notes', 'connected_files', 'blocked_by'
      ]);
    });
  });

  describe('getToolDefinitionDynamic', () => {
    it('should return tool definition with dynamic database', async () => {
      const definition = await UpdateToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      
      expect(definition).toBeDefined();
      expect(definition.name).toBe('specly_update');
      expect(definition.description).toBe('Single-step update of task properties with audit trail.');
    });

    it('should match static definition structure', async () => {
      const staticDef = UpdateToolNew.getToolDefinition();
      const dynamicDef = await UpdateToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      
      expect(dynamicDef.name).toBe(staticDef.name);
      expect(dynamicDef.inputSchema.required).toEqual(staticDef.inputSchema.required);
      expect(Object.keys(dynamicDef.inputSchema.properties).sort()).toEqual(
        Object.keys(staticDef.inputSchema.properties).sort()
      );
    });
  });

  describe('execute() - Public API', () => {
    describe('Happy Path', () => {
      it('should execute successfully with valid input', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: { path: '/test/workspace', name: 'test' }
        });
        
        const mockResult = {
          content: [{ type: 'text', text: 'Task TP-001 updated successfully' }],
          isError: false
        };
        vi.spyOn(updateTool as any, 'applyUpdate').mockResolvedValue(mockResult);

        const result = await updateTool.execute({
          workspace_path: '/test/workspace',
          task_id: 'TP-001',
          field: 'title',
          value: 'New Title'
        });

        expect((updateTool as any).validateWorkspace).toHaveBeenCalledWith('/test/workspace');
        expect((updateTool as any).applyUpdate).toHaveBeenCalledWith(
          { task_id: 'TP-001', field: 'title', value: 'New Title', reason: undefined },
          { path: '/test/workspace', name: 'test' }
        );
        expect(result.isError).toBe(false);
        expect(result.content[0].text).toContain('updated successfully');
      });

      it('should propagate result from applyUpdate', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: { path: '/test', name: 'test' }
        });

        const customResult = {
          content: [{ type: 'text', text: 'Custom success message' }],
          isError: false,
          data: { custom: 'data' }
        };
        vi.spyOn(updateTool as any, 'applyUpdate').mockResolvedValue(customResult);

        const result = await updateTool.execute({
          workspace_path: '/test',
          task_id: 'TP-002',
          field: 'description',
          value: 'New Description'
        });

        expect(result).toEqual(customResult);
      });
    });

    describe('Validation Errors', () => {
      it('should return error when workspace validation fails', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: false,
          error: 'Workspace not found'
        });
        vi.spyOn(updateTool as any, 'createErrorResult').mockReturnValue({
          content: [{ type: 'text', text: 'Workspace not found' }],
          isError: true
        });
        vi.spyOn(updateTool as any, 'applyUpdate');

        const result = await updateTool.execute({
          workspace_path: '/invalid/path',
          task_id: 'TP-001',
          field: 'title',
          value: 'Test'
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Workspace not found');
        expect((updateTool as any).applyUpdate).not.toHaveBeenCalled();
      });

      it('should handle missing workspace_path', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: false,
          error: 'workspace_path is required'
        });
        vi.spyOn(updateTool as any, 'createErrorResult').mockReturnValue({
          content: [{ type: 'text', text: 'workspace_path is required' }],
          isError: true
        });

        const result = await updateTool.execute({
          task_id: 'TP-001',
          field: 'title',
          value: 'Test'
        });

        expect(result.isError).toBe(true);
      });

      it('should pass workspace_path to createErrorResult context', async () => {
        const errorSpy = vi.spyOn(updateTool as any, 'createErrorResult').mockReturnValue({
          content: [{ type: 'text', text: 'Error' }],
          isError: true
        });
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: false,
          error: 'Invalid workspace'
        });

        await updateTool.execute({
          workspace_path: '/bad/path',
          task_id: 'TP-001',
          field: 'title',
          value: 'Test'
        });

        expect(errorSpy).toHaveBeenCalledWith('Invalid workspace', { workspace_path: '/bad/path' });
      });

      it('should include reason in applyUpdate call when provided', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: { path: '/test', name: 'test' }
        });
        const applySpy = vi.spyOn(updateTool as any, 'applyUpdate').mockResolvedValue({
          content: [{ type: 'text', text: 'Success' }],
          isError: false
        });

        await updateTool.execute({
          workspace_path: '/test',
          task_id: 'TP-001',
          field: 'status',
          value: 'completed',
          reason: 'Task finished'
        });

        expect(applySpy).toHaveBeenCalledWith(
          { task_id: 'TP-001', field: 'status', value: 'completed', reason: 'Task finished' },
          { path: '/test', name: 'test' }
        );
      });
    });
  });

  describe('applyUpdate() - Core Logic', () => {
    const mockWorkspace = { path: '/test/workspace', name: 'test' };
    const mockTask = {
      id: 'TP-001',
      title: 'Original Title',
      description: 'Original description',
      status: 'in_progress',
      priority: 'medium',
      progress: 50,
      notes: 'Existing notes',
      assets: ['file1.ts'],
      metadata: { created_by: 'user' },
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    };

    beforeEach(() => {
      mockWorkspaceDb.getTask.mockResolvedValue({ ...mockTask });
      mockWorkspaceDb.updateTask.mockResolvedValue(undefined);
    });

    describe('Field Updates - Happy Paths', () => {
      it('should update title field', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'title',
          value: 'New Title'
        });

        expect(mockWorkspaceDb.getTask).toHaveBeenCalledWith('TP-001');
        expect(mockWorkspaceDb.updateTask).toHaveBeenCalled();
        
        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.title).toBe('New Title');
        expect(result.isError).toBe(false);
        expect(result.content[0].text).toContain('TP-001 updated successfully');
      });

      it('should update description field', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'description',
          value: 'New Description'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.description).toBe('New Description');
        expect(result.isError).toBe(false);
      });

      it('should update priority field with lowercase conversion', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'priority',
          value: 'HIGH'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.priority).toBe('high');
        expect(result.isError).toBe(false);
      });

      it('should update status field', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'status',
          value: 'completed'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.status).toBe('completed');
        expect(result.isError).toBe(false);
      });

      it('should update progress field with number conversion', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'progress',
          value: '75'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.progress).toBe(75);
        expect(typeof updatedTask.progress).toBe('number');
        expect(result.isError).toBe(false);
      });

      it('should update progress field with zero value', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'progress',
          value: '0'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.progress).toBe(0);
        expect(result.isError).toBe(false);
      });

      it('should update progress field with 100% value', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'progress',
          value: '100'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.progress).toBe(100);
        expect(result.isError).toBe(false);
      });

      it('should update notes field by appending with newline', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'notes',
          value: 'New note'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.notes).toBe('Existing notes\nNew note');
        expect(result.isError).toBe(false);
      });

      it('should update notes field when no existing notes', async () => {
        mockWorkspaceDb.getTask.mockResolvedValue({
          ...mockTask,
          notes: ''
        });
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'notes',
          value: 'First note'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.notes).toBe('\nFirst note');
        expect(result.isError).toBe(false);
      });

      it('should update connected_files field with CSV split', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'connected_files',
          value: 'file1.ts, file2.ts, file3.ts'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.assets).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
        expect(result.isError).toBe(false);
      });

      it('should update connected_files field with single file', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'connected_files',
          value: 'single-file.ts'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.assets).toEqual(['single-file.ts']);
        expect(result.isError).toBe(false);
      });

      it('should update blocked_by field in metadata', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'blocked_by',
          value: 'TP-002, TP-003'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.metadata.blocked_by).toEqual(['TP-002', 'TP-003']);
        expect(result.isError).toBe(false);
      });

      it('should update blocked_by field preserving existing metadata', async () => {
        mockWorkspaceDb.getTask.mockResolvedValue({
          ...mockTask,
          metadata: { other: 'value', existing: 'data' }
        });
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'blocked_by',
          value: 'TP-004'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.metadata).toEqual({
          other: 'value',
          existing: 'data',
          blocked_by: ['TP-004']
        });
        expect(result.isError).toBe(false);
      });

      it('should set updatedAt timestamp on all updates', async () => {
        const beforeTime = Date.now();
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'title',
          value: 'Test'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.updatedAt).toBeDefined();
        
        const updatedTime = new Date(updatedTask.updatedAt).getTime();
        expect(updatedTime).toBeGreaterThanOrEqual(beforeTime);
        expect(updatedTime).toBeLessThanOrEqual(Date.now());
      });

      it('should return success result with correct structure', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'title',
          value: 'Updated Title'
        });

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('TP-001');
        expect(result.content[0].text).toContain('updated successfully');
      });

      it('should include reason in response data when provided', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });
        vi.spyOn(updateTool as any, 'createSuccessResult').mockReturnValue({
          content: [{ type: 'text', text: 'Success' }],
          isError: false,
          data: {
            task_id: 'TP-001',
            field: 'status',
            value: 'completed',
            reason: 'Task finished',
            updated: true
          }
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'status',
          value: 'completed',
          reason: 'Task finished'
        });

        expect((updateTool as any).createSuccessResult).toHaveBeenCalled();
        const callArgs = (updateTool as any).createSuccessResult.mock.calls[0][1];
        expect(callArgs.data.reason).toBe('Task finished');
      });
    });

    describe('Error Handling', () => {
      it('should return error when task not found', async () => {
        mockWorkspaceDb.getTask.mockResolvedValue(null);
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-999',
          field: 'title',
          value: 'Test'
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('TP-999 not found');
        expect(mockWorkspaceDb.updateTask).not.toHaveBeenCalled();
      });

      it('should handle WorkspaceDatabaseService initialization error', async () => {
        (WorkspaceDatabaseService as any).mockImplementation(() => {
          throw new Error('Database connection failed');
        });
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'title',
          value: 'Test'
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed to update task');
        expect(result.content[0].text).toContain('Database connection failed');
      });

      it('should handle getTask throwing error', async () => {
        mockWorkspaceDb.getTask.mockRejectedValue(new Error('Query failed'));
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'title',
          value: 'Test'
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed to update task');
        expect(result.content[0].text).toContain('Query failed');
      });

      it('should handle updateTask throwing error', async () => {
        mockWorkspaceDb.getTask.mockResolvedValue({ ...mockTask });
        mockWorkspaceDb.updateTask.mockRejectedValue(new Error('Write error'));
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'title',
          value: 'Test'
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed to update task');
        expect(result.content[0].text).toContain('Write error');
      });

      it('should handle non-Error exceptions', async () => {
        mockWorkspaceDb.getTask.mockRejectedValue('String error message');
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'title',
          value: 'Test'
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed to update task');
        expect(result.content[0].text).toContain('String error message');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty task_id', async () => {
        mockWorkspaceDb.getTask.mockResolvedValue(null);
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: '',
          field: 'title',
          value: 'Test'
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not found');
      });

      it('should handle special characters in value', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const specialValue = 'Test "quotes" and \\nNewline\\t Tab';
        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'description',
          value: specialValue
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.description).toBe(specialValue);
        expect(result.isError).toBe(false);
      });

      it('should handle very long value strings', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const longValue = 'A'.repeat(10000);
        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'description',
          value: longValue
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.description).toBe(longValue);
        expect(updatedTask.description.length).toBe(10000);
        expect(result.isError).toBe(false);
      });

      it('should handle progress with non-numeric value (converts to NaN)', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'progress',
          value: 'abc'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(Number.isNaN(updatedTask.progress)).toBe(true);
        expect(result.isError).toBe(false);
      });

      it('should handle priority with mixed case', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'priority',
          value: 'MeDiUm'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.priority).toBe('medium');
        expect(result.isError).toBe(false);
      });

      it('should handle connected_files with extra spaces', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'connected_files',
          value: '  file1.ts  ,   file2.ts  '
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.assets).toEqual(['file1.ts', 'file2.ts']);
        expect(result.isError).toBe(false);
      });

      it('should handle blocked_by with single dependency', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'blocked_by',
          value: 'TP-005'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.metadata.blocked_by).toEqual(['TP-005']);
        expect(Array.isArray(updatedTask.metadata.blocked_by)).toBe(true);
        expect(result.isError).toBe(false);
      });

      it('should handle empty connected_files string', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'connected_files',
          value: ''
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.assets).toEqual(['']);
        expect(result.isError).toBe(false);
      });

      it('should handle notes when undefined', async () => {
        mockWorkspaceDb.getTask.mockResolvedValue({
          ...mockTask,
          notes: undefined
        });
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'notes',
          value: 'New note'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.notes).toBe('\nNew note');
        expect(updatedTask.notes).not.toContain('undefined');
        expect(result.isError).toBe(false);
      });

      it('should handle status with unknown value', async () => {
        vi.spyOn(updateTool as any, 'validateWorkspace').mockResolvedValue({
          isValid: true,
          workspace: mockWorkspace
        });

        const result = await updateTool.execute({
          workspace_path: mockWorkspace.path,
          task_id: 'TP-001',
          field: 'status',
          value: 'unknown_status'
        });

        const updatedTask = mockWorkspaceDb.updateTask.mock.calls[0][1];
        expect(updatedTask.status).toBe('unknown_status');
        expect(result.isError).toBe(false);
      });
    });
  });
});
