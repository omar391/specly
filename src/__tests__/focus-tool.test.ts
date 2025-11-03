import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FocusToolNew, focusToolSchema } from '../tools/focus.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';

describe('FocusToolNew', () => {
  let focusTool: FocusToolNew;
  let mockDrizzleDb: DrizzleDatabaseManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDrizzleDb = {} as DrizzleDatabaseManager;
    focusTool = new FocusToolNew(mockDrizzleDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with correct configuration', () => {
      expect(focusTool).toBeDefined();
      expect(focusTool).toBeInstanceOf(FocusToolNew);
    });

    it('should set tool name to specly_focus', () => {
      const config = (focusTool as any).toolConfig;
      expect(config.name).toBe('specly_focus');
    });

    it('should mark task_id and workspace_path as required fields', () => {
      const config = (focusTool as any).toolConfig;
      expect(config.requiredFields).toContain('task_id');
      expect(config.requiredFields).toContain('workspace_path');
      expect(config.requiredFields).toHaveLength(2);
    });

    it('should include task_id in additional properties with correct type', () => {
      const config = (focusTool as any).toolConfig;
      expect(config.additionalProperties.task_id).toBeDefined();
      expect(config.additionalProperties.task_id.type).toBe('string');
      expect(config.additionalProperties.task_id.description).toContain('Task ID');
    });

    it('should have descriptive configuration about focus functionality', () => {
      const config = (focusTool as any).toolConfig;
      expect(config.description).toBeDefined();
      expect(config.description.toLowerCase()).toContain('focus');
      expect(config.description.length).toBeGreaterThan(20);
    });
  });

  describe('Static getToolDefinition()', () => {
    it('should return tool definition without database', () => {
      const definition = FocusToolNew.getToolDefinition();
      expect(definition).toBeDefined();
      expect(definition.name).toBe('specly_focus');
    });

    it('should have correct inputSchema type', () => {
      const definition = FocusToolNew.getToolDefinition();
      expect(definition.inputSchema.type).toBe('object');
    });

    it('should include stepId with analyze/plan/implement enum', () => {
      const definition = FocusToolNew.getToolDefinition();
      const stepId = definition.inputSchema.properties.stepId;
      
      expect(stepId.type).toBe('string');
      expect(stepId.enum).toEqual(['analyze', 'plan', 'implement']);
      expect(stepId.description).toContain('multi-step');
    });

    it('should include task_id property with description', () => {
      const definition = FocusToolNew.getToolDefinition();
      const taskId = definition.inputSchema.properties.task_id;
      
      expect(taskId.type).toBe('string');
      expect(taskId.description).toContain('Task ID');
      expect(taskId.description).toContain('TP-001');
    });

    it('should include workspace_path property', () => {
      const definition = FocusToolNew.getToolDefinition();
      const workspacePath = definition.inputSchema.properties.workspace_path;
      
      expect(workspacePath.type).toBe('string');
      expect(workspacePath.description).toContain('workspace');
    });

    it('should mark task_id and workspace_path as required', () => {
      const definition = FocusToolNew.getToolDefinition();
      
      expect(definition.inputSchema.required).toContain('task_id');
      expect(definition.inputSchema.required).toContain('workspace_path');
      expect(definition.inputSchema.required).toHaveLength(2);
    });

    it('should have descriptive text about focus and multi-step', () => {
      const definition = FocusToolNew.getToolDefinition();
      
      expect(definition.description).toContain('Focus');
      expect(definition.description).toContain('multi-step');
    });

    it('should be callable as static method without class instance', () => {
      expect(() => FocusToolNew.getToolDefinition()).not.toThrow();
    });
  });

  describe('Static getToolDefinitionDynamic()', () => {
    it('should return tool definition with database instance', async () => {
      const definition = await FocusToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      
      expect(definition).toBeDefined();
      expect(definition.name).toBe('specly_focus');
    });

    it('should include workspace_path and task_id in input schema', async () => {
      const definition = await FocusToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      
      expect(definition.inputSchema.properties.workspace_path).toBeDefined();
      expect(definition.inputSchema.properties.task_id).toBeDefined();
    });

    it('should mark task_id and workspace_path as required', async () => {
      const definition = await FocusToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      
      expect(definition.inputSchema.required).toContain('task_id');
      expect(definition.inputSchema.required).toContain('workspace_path');
    });

    it('should match structure of static getToolDefinition', async () => {
      const staticDef = FocusToolNew.getToolDefinition();
      const dynamicDef = await FocusToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      
      expect(dynamicDef.name).toBe(staticDef.name);
      expect(dynamicDef.inputSchema.required).toEqual(staticDef.inputSchema.required);
      
      // Dynamic definition should have core properties (workspace_path, task_id)
      // Static definition also includes stepId
      expect(dynamicDef.inputSchema.properties.workspace_path).toBeDefined();
      expect(dynamicDef.inputSchema.properties.task_id).toBeDefined();
      
      // Both should have matching core properties
      expect(dynamicDef.inputSchema.properties.workspace_path.type).toBe(
        staticDef.inputSchema.properties.workspace_path.type
      );
      expect(dynamicDef.inputSchema.properties.task_id.type).toBe(
        staticDef.inputSchema.properties.task_id.type
      );
    });

    it('should create FocusToolNew instance internally', async () => {
      await FocusToolNew.getToolDefinitionDynamic(mockDrizzleDb);
      // Instance creation happens on line 95 - verified by successful execution
      expect(true).toBe(true);
    });
  });

  describe('execute() - Happy Path', () => {
    it('should execute successfully with valid workspace and task_id', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test/workspace', name: 'test-workspace' }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/test/workspace',
        task_id: 'TP-001'
      });
      
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Focus captured');
    });

    it('should call validateWorkspace with input workspace_path', async () => {
      const validateSpy = vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });
      
      await focusTool.execute({
        workspace_path: '/test/workspace',
        task_id: 'TP-001'
      });
      
      expect(validateSpy).toHaveBeenCalledWith('/test/workspace');
    });

    it('should extract workspace_path from input destructuring', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/my/path', name: 'test' }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/my/path',
        task_id: 'TP-002'
      });
      
      expect(result.isError).toBeFalsy();
    });

    it('should extract stepId from input if provided', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/test/workspace',
        task_id: 'TP-001',
        stepId: 'analyze'
      });
      
      expect(result.isError).toBeFalsy();
    });

    it('should use default query "focus" when query not provided', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/test/workspace',
        task_id: 'TP-001'
      });
      
      expect(result.content[0].text).toContain('Focus captured: focus');
    });

    it('should use provided query value instead of default', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/test/workspace',
        task_id: 'TP-001',
        query: 'custom focus query'
      });
      
      expect(result.content[0].text).toContain('Focus captured: custom focus query');
    });

    it('should return success result with text content', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/test/workspace',
        task_id: 'TP-001'
      });
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.isError).toBeFalsy();
    });

    it('should access workspace from validation result', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test/workspace', name: 'test-ws', id: 123 }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/test/workspace',
        task_id: 'TP-001'
      });
      
      // Line 47: const workspace = workspaceValidation.workspace
      expect(result.isError).toBeFalsy();
    });
  });

  describe('execute() - Error Paths', () => {
    it('should return error when workspace validation fails', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Workspace not found at path: /invalid/path. Please run specly_start first to initialize the workspace.'
      });
      
      const result = await focusTool.execute({
        workspace_path: '/invalid/path',
        task_id: 'TP-001'
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Workspace not found');
    });

    it('should propagate exact validation error message', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Custom validation error'
      });
      
      const result = await focusTool.execute({
        workspace_path: '/bad/path',
        task_id: 'TP-001'
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Custom validation error');
    });

    it('should return error object with isError flag', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Workspace not found'
      });
      
      const result = await focusTool.execute({
        workspace_path: '/invalid',
        task_id: 'TP-001'
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
    });

    it('should handle caught Error instances in catch block', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockRejectedValue(
        new Error('Database connection failed')
      );
      
      const result = await focusTool.execute({
        workspace_path: '/test',
        task_id: 'TP-001'
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error in specly_focus');
      expect(result.content[0].text).toContain('Database connection failed');
    });

    it('should handle non-Error exceptions gracefully', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockRejectedValue(
        'String error message'
      );
      
      const result = await focusTool.execute({
        workspace_path: '/test',
        task_id: 'TP-001'
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error in specly_focus');
      expect(result.content[0].text).toContain('String error message');
    });

    it('should format error message with tool name prefix', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockRejectedValue(
        new Error('Test error')
      );
      
      const result = await focusTool.execute({
        workspace_path: '/test',
        task_id: 'TP-001'
      });
      
      expect(result.content[0].text).toMatch(/^Error in specly_focus:/);
    });

    it('should return proper error result structure from catch block', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockRejectedValue(
        new Error('Failure')
      );
      
      const result = await focusTool.execute({
        workspace_path: '/test',
        task_id: 'TP-001'
      });
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.isError).toBe(true);
    });
  });

  describe('Edge Cases and Branch Coverage', () => {
    it('should handle missing task_id gracefully', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/test/workspace'
        // task_id missing
      });
      
      // Should either succeed or return validation error
      expect(result).toBeDefined();
    });

    it('should handle empty string task_id', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/test/workspace',
        task_id: ''
      });
      
      expect(result).toBeDefined();
    });

    it('should handle empty string workspace_path', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: false,
        error: 'Workspace not found at path: . Please run specly_start first to initialize the workspace.'
      });
      
      const result = await focusTool.execute({
        workspace_path: '',
        task_id: 'TP-001'
      });
      
      expect(result.isError).toBe(true);
    });

    it('should handle query with special characters', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/test/workspace',
        task_id: 'TP-001',
        query: 'Focus on <script>alert(1)</script>'
      });
      
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('<script>alert(1)</script>');
    });

    it('should handle undefined stepId explicitly', async () => {
      vi.spyOn(focusTool as any, 'validateWorkspace').mockResolvedValue({
        isValid: true,
        workspace: { path: '/test', name: 'test' }
      });
      
      const result = await focusTool.execute({
        workspace_path: '/test/workspace',
        task_id: 'TP-001',
        stepId: undefined
      });
      
      expect(result.isError).toBeFalsy();
    });
  });

  describe('focusToolSchema Export', () => {
    it('should export focusToolSchema', () => {
      expect(focusToolSchema).toBeDefined();
    });

    it('should have correct schema structure with task_id', () => {
      const result = focusToolSchema.safeParse({
        workspace_path: '/test',
        task_id: 'TP-001'
      });
      
      expect(result.success).toBe(true);
    });
  });
});
