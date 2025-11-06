import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuditToolNew, auditToolSchema } from '../tools/audit.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';

// Mock WorkspaceDatabaseService
vi.mock('../database/workspace-queries.js', () => ({
  WorkspaceDatabaseService: vi.fn()
}));

describe('AuditToolNew', () => {
  let auditTool: AuditToolNew;
  let mockDrizzleDb: DrizzleDatabaseManager;
  let mockWorkspaceDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDrizzleDb = {} as DrizzleDatabaseManager;

    // Create mock WorkspaceDatabaseService
    mockWorkspaceDb = {
      getAllTasks: vi.fn().mockResolvedValue([])
    };

    // Mock the WorkspaceDatabaseService constructor
    (WorkspaceDatabaseService as any).mockImplementation(() => mockWorkspaceDb);

    auditTool = new AuditToolNew(mockDrizzleDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with correct configuration', () => {
      expect(auditTool).toBeDefined();
      expect(auditTool).toBeInstanceOf(AuditToolNew);
    });

    it('should set tool name to specly_audit', () => {
      const config = (auditTool as any).toolConfig;
      expect(config.name).toBe('specly_audit');
    });

    it('should mark workspace_path as required field', () => {
      const config = (auditTool as any).toolConfig;
      expect(config.requiredFields).toContain('workspace_path');
      expect(config.requiredFields).toHaveLength(1);
    });

    it('should have empty additional properties', () => {
      const config = (auditTool as any).toolConfig;
      expect(config.additionalProperties).toEqual({});
    });

    it('should have descriptive configuration about audit functionality', () => {
      const config = (auditTool as any).toolConfig;
      expect(config.description).toBeDefined();
      expect(config.description.toLowerCase()).toContain('audit');
      expect(config.description.length).toBeGreaterThan(20);
    });
  });

  describe('Static getToolDefinition()', () => {
    it('should return tool definition', () => {
      const definition = AuditToolNew.getToolDefinition();
      expect(definition).toBeDefined();
      expect(definition.name).toBe('specly_audit');
    });

    it('should have correct inputSchema type', () => {
      const definition = AuditToolNew.getToolDefinition();
      expect(definition.inputSchema.type).toBe('object');
    });

    it('should include workspace_path property', () => {
      const definition = AuditToolNew.getToolDefinition();
      const workspacePath = definition.inputSchema.properties.workspace_path;

      expect(workspacePath.type).toBe('string');
      expect(workspacePath.description).toContain('workspace');
    });

    it('should mark workspace_path as required', () => {
      const definition = AuditToolNew.getToolDefinition();

      expect(definition.inputSchema.required).toContain('workspace_path');
      expect(definition.inputSchema.required).toHaveLength(1);
    });

    it('should have descriptive text about audit', () => {
      const definition = AuditToolNew.getToolDefinition();

      expect(definition.description).toContain('audit');
      expect(definition.description.toLowerCase()).toContain('task');
    });

    it('should be callable as static method without class instance', () => {
      expect(() => AuditToolNew.getToolDefinition()).not.toThrow();
    });
  });

  describe('execute() - Happy Path', () => {
    it('should execute successfully with empty task list', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test/workspace', name: 'test-workspace' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([]);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Tasks: 0');
      expect(result.content[0].text).toContain('Done: 0');
    });

    it('should count completed tasks correctly', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test/workspace', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([
        { id: '1', status: 'completed', priority: 'low' },
        { id: '2', status: 'completed', priority: 'medium' },
        { id: '3', status: 'in_progress', priority: 'high' }
      ]);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Tasks: 3');
      expect(result.content[0].text).toContain('Done: 2');
    });

    it('should count in-progress tasks correctly', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([
        { id: '1', status: 'in_progress', priority: 'low' },
        { id: '2', status: 'in_progress', priority: 'medium' },
        { id: '3', status: 'completed', priority: 'high' }
      ]);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('In-Progress: 2');
    });

    it('should count blocked tasks correctly', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([
        { id: '1', status: 'blocked', priority: 'high' },
        { id: '2', status: 'blocked', priority: 'low' },
        { id: '3', status: 'in_progress', priority: 'medium' }
      ]);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Blocked: 2');
    });

    it('should count high-priority open tasks correctly', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([
        { id: '1', status: 'pending', priority: 'high' },
        { id: '2', status: 'in_progress', priority: 'high' },
        { id: '3', status: 'completed', priority: 'high' },
        { id: '4', status: 'blocked', priority: 'high' }
      ]);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('High-Priority Open: 3');
    });

    it('should return success result with correct summary format', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([
        { id: '1', status: 'completed', priority: 'low' },
        { id: '2', status: 'in_progress', priority: 'medium' }
      ]);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toMatch(/^Tasks: \d+, Done: \d+, In-Progress: \d+, Blocked: \d+, High-Priority Open: \d+$/);
    });

    it('should call validateWorkspace with input workspace_path', async () => {
      const validateSpy = vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([]);

      await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(validateSpy).toHaveBeenCalledWith('/test/workspace');
    });

    it('should create WorkspaceDatabaseService with workspace path', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/my/workspace', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([]);

      await auditTool.execute({
        workspace_path: '/my/workspace'
      });

      expect(WorkspaceDatabaseService).toHaveBeenCalledWith('/my/workspace', mockDrizzleDb);
    });

    it('should handle mixed task statuses and priorities', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([
        { id: '1', status: 'completed', priority: 'high' },
        { id: '2', status: 'in_progress', priority: 'high' },
        { id: '3', status: 'blocked', priority: 'low' },
        { id: '4', status: 'pending', priority: 'medium' },
        { id: '5', status: 'completed', priority: 'low' }
      ]);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Tasks: 5');
      expect(result.content[0].text).toContain('Done: 2');
      expect(result.content[0].text).toContain('In-Progress: 1');
      expect(result.content[0].text).toContain('Blocked: 1');
      expect(result.content[0].text).toContain('High-Priority Open: 1');
    });
  });

  describe('execute() - Error Paths', () => {
    it('should return error when workspace validation fails', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Workspace not found at path: /invalid/path. Please run specly_start first to initialize the workspace.'
      });

      const result = await auditTool.execute({
        workspace_path: '/invalid/path'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Workspace not found');
    });

    it('should propagate exact validation error message', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Custom validation error'
      });

      const result = await auditTool.execute({
        workspace_path: '/bad/path'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Custom validation error');
    });

    it('should return error object with isError flag', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Workspace not found'
      });

      const result = await auditTool.execute({
        workspace_path: '/invalid'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
    });

    it('should handle getAllTasks throwing Error', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockRejectedValue(new Error('Database connection failed'));

      const result = await auditTool.execute({
        workspace_path: '/test'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Audit failed');
      expect(result.content[0].text).toContain('Database connection failed');
    });

    it('should handle getAllTasks throwing non-Error exception', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockRejectedValue('String error message');

      const result = await auditTool.execute({
        workspace_path: '/test'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Audit failed');
      expect(result.content[0].text).toContain('String error message');
    });

    it('should format error message with "Audit failed" prefix', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockRejectedValue(new Error('Test error'));

      const result = await auditTool.execute({
        workspace_path: '/test'
      });

      expect(result.content[0].text).toMatch(/^Audit failed:/);
    });

    it('should return proper error result structure from catch block', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockRejectedValue(new Error('Failure'));

      const result = await auditTool.execute({
        workspace_path: '/test'
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.isError).toBe(true);
    });
  });

  describe('Edge Cases and Branch Coverage', () => {
    it('should handle tasks with null status', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([
        { id: '1', status: null, priority: 'high' },
        { id: '2', status: 'completed', priority: 'low' }
      ]);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Tasks: 2');
    });

    it('should handle tasks with null priority', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([
        { id: '1', status: 'in_progress', priority: null },
        { id: '2', status: 'completed', priority: 'high' }
      ]);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('High-Priority Open: 0');
    });

    it('should handle empty string workspace_path', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Workspace not found at path: . Please run specly_start first to initialize the workspace.'
      });

      const result = await auditTool.execute({
        workspace_path: ''
      });

      expect(result.isError).toBe(true);
    });

    it('should handle very large task lists', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      const largeTasks = Array.from({ length: 1000 }, (_, i) => ({
        id: `task-${i}`,
        status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'in_progress' : 'blocked',
        priority: i % 2 === 0 ? 'high' : 'low'
      }));

      mockWorkspaceDb.getAllTasks.mockResolvedValue(largeTasks);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Tasks: 1000');
    });

    it('should handle tasks with unusual status values', async () => {
      vi.spyOn(auditTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });

      mockWorkspaceDb.getAllTasks.mockResolvedValue([
        { id: '1', status: 'custom_status', priority: 'high' },
        { id: '2', status: 'completed', priority: 'low' }
      ]);

      const result = await auditTool.execute({
        workspace_path: '/test/workspace'
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Tasks: 2');
      expect(result.content[0].text).toContain('Done: 1');
    });
  });

  describe('auditToolSchema Export', () => {
    it('should export auditToolSchema', () => {
      expect(auditToolSchema).toBeDefined();
    });

    it('should have correct schema structure with workspace_path', () => {
      const result = auditToolSchema.safeParse({
        workspace_path: '/test'
      });

      expect(result.success).toBe(true);
    });

    it('should reject missing workspace_path', () => {
      const result = auditToolSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });
});
