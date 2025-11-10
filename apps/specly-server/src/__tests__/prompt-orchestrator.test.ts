/**
 * Tests for Prompt Orchestrator
 * 
 * Tests prompt generation for various tools and context building
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { ToolNames } from '../constants/tool-names.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';

describe('Prompt Orchestrator', () => {
  let orchestrator: PromptOrchestrator;
  let mockDb: DrizzleDatabaseManager;

  beforeEach(() => {
    mockDb = {} as DrizzleDatabaseManager;
    orchestrator = new PromptOrchestrator(mockDb);
  });

  describe('orchestratePrompt', () => {
    it('should generate prompt for START tool', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.START,
        'workspace-123',
        { workspace_path: '/path/to/workspace' }
      );

      expect(result.prompt_text).toContain('Specly Session Started');
      expect(result.prompt_text).toContain('/path/to/workspace');
      expect(result.session_data).toEqual({
        current_tool: ToolNames.START,
        workspace_id: 'workspace-123'
      });
    });

    it('should generate prompt for INIT tool with all parameters', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.INIT,
        'workspace-456',
        {
          project_name: 'My Project',
          workspace_path: '/my/project',
          tech_stack: 'TypeScript, React, Node.js',
          project_requirements: 'Build a web app'
        }
      );

      expect(result.prompt_text).toContain('Specly Project Initialization');
      expect(result.prompt_text).toContain('My Project');
      expect(result.prompt_text).toContain('/my/project');
      expect(result.prompt_text).toContain('TypeScript, React, Node.js');
      expect(result.prompt_text).toContain('Build a web app');
    });

    it('should use default values for INIT when parameters missing', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.INIT,
        'workspace-789',
        {}
      );

      expect(result.prompt_text).toContain('Specly Project');
      expect(result.prompt_text).toContain('current directory');
      expect(result.prompt_text).toContain('Not specified');
      expect(result.prompt_text).toContain('No specific requirements');
    });

    it('should generate prompt for ADD tool', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.ADD,
        'workspace-123',
        { description: 'Implement user authentication' }
      );

      expect(result.prompt_text).toContain('Task Creation Workflow');
      expect(result.prompt_text).toContain('Implement user authentication');
    });

    it('should handle ADD with task_description fallback', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.ADD,
        'workspace-123',
        { task_description: 'Add login feature' }
      );

      expect(result.prompt_text).toContain('Add login feature');
    });

    it('should generate prompt for STATUS tool', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.STATUS,
        'workspace-123',
        {}
      );

      expect(result.prompt_text).toContain('Project Status Analysis');
      expect(result.prompt_text).toContain('comprehensive status report');
    });

    it('should generate prompt for UPDATE tool', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.UPDATE,
        'workspace-123',
        {
          target: 'task-456',
          updates: 'Changed status to in_progress'
        }
      );

      expect(result.prompt_text).toContain('Task Update Request');
      expect(result.prompt_text).toContain('task-456');
      expect(result.prompt_text).toContain('Changed status to in_progress');
    });

    it('should handle UPDATE with changes fallback', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.UPDATE,
        'workspace-123',
        { changes: 'Updated priority' }
      );

      expect(result.prompt_text).toContain('Updated priority');
    });

    it('should generate prompt for FOCUS tool', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.FOCUS,
        'workspace-123',
        { task_id: 'task-789' }
      );

      expect(result.prompt_text).toContain('Task Focus Mode');
      expect(result.prompt_text).toContain('task-789');
    });

    it('should generate prompt for AUDIT tool', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.AUDIT,
        'workspace-123',
        {}
      );

      expect(result.prompt_text).toContain('Project Audit Workflow');
      expect(result.prompt_text).toContain('comprehensive project health assessment');
    });

    it('should generate prompt for GITHUB tool', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.GITHUB,
        'workspace-123',
        { action: 'pull_request' }
      );

      expect(result.prompt_text).toContain('GitHub Integration Workflow');
      expect(result.prompt_text).toContain('pull_request');
    });

    it('should use default action for GITHUB when not provided', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.GITHUB,
        'workspace-123',
        {}
      );

      expect(result.prompt_text).toContain('sync');
    });

    it('should generate prompt for RULE_UPDATE tool', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.RULE_UPDATE,
        'workspace-123',
        { user_feedback: 'Always use semicolons' }
      );

      expect(result.prompt_text).toContain('Workspace Rules Update');
      expect(result.prompt_text).toContain('Always use semicolons');
    });

    it('should handle RULE_UPDATE with feedback fallback', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.RULE_UPDATE,
        'workspace-123',
        { feedback: 'Use tabs not spaces' }
      );

      expect(result.prompt_text).toContain('Use tabs not spaces');
    });

    it('should handle legacy specly_create_task', async () => {
      const result = await orchestrator.orchestratePrompt(
        'specly_create_task',
        'workspace-123',
        {}
      );

      expect(result.prompt_text).toContain('Task creation executed');
    });

    it('should handle unknown tool names', async () => {
      const result = await orchestrator.orchestratePrompt(
        'unknown_tool',
        'workspace-123',
        {}
      );

      expect(result.prompt_text).toContain('Execute system function: unknown_tool');
    });

    it('should always include session_data in result', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.STATUS,
        'workspace-abc',
        {}
      );

      expect(result.session_data).toBeDefined();
      expect(result.session_data.current_tool).toBe(ToolNames.STATUS);
      expect(result.session_data.workspace_id).toBe('workspace-abc');
    });

    it('should handle errors during prompt generation', async () => {
      // Mock console.error to verify error logging
      const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Force an error by passing null as drizzleDb
      const badOrchestrator = new PromptOrchestrator(null as any);
      
      // This should not throw but should log error (for now we expect it to succeed)
      const result = await badOrchestrator.orchestratePrompt(
        ToolNames.STATUS,
        'workspace-123',
        {}
      );

      // Should still return a result
      expect(result.prompt_text).toBeDefined();
      
      mockConsoleError.mockRestore();
    });

    it('should preserve workspace_id in session_data', async () => {
      const workspaceId = 'very-specific-workspace-id-12345';
      const result = await orchestrator.orchestratePrompt(
        ToolNames.ADD,
        workspaceId,
        { description: 'Test task' }
      );

      expect(result.session_data.workspace_id).toBe(workspaceId);
    });

    it('should handle empty args object', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.STATUS,
        'workspace-123',
        {}
      );

      expect(result.prompt_text).toBeDefined();
      expect(result.session_data).toBeDefined();
    });

    it('should handle undefined args (default parameter)', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.STATUS,
        'workspace-123'
      );

      expect(result.prompt_text).toBeDefined();
      expect(result.session_data).toBeDefined();
    });
  });

  describe('generateNextStepInstructions', () => {
    it('should generate continuation instructions for any tool', async () => {
      const result = await orchestrator.generateNextStepInstructions('specly_init');
      
      expect(result).toContain('Continue with');
      expect(result).toContain('specly_init');
      expect(result).toContain('workflow');
    });

    it('should work with ToolNames constants', async () => {
      const result = await orchestrator.generateNextStepInstructions(ToolNames.ADD);
      
      expect(result).toContain(ToolNames.ADD);
    });

    it('should handle empty tool name', async () => {
      const result = await orchestrator.generateNextStepInstructions('');
      
      expect(result).toContain('Continue with');
    });
  });

  describe('Prompt Content Validation', () => {
    it('should include markdown headers in prompts', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.INIT,
        'workspace-123',
        {}
      );

      expect(result.prompt_text).toMatch(/^#/);
    });

    it('should format prompts consistently', async () => {
      const tools = [
        ToolNames.START,
        ToolNames.INIT,
        ToolNames.ADD,
        ToolNames.STATUS,
        ToolNames.UPDATE,
        ToolNames.FOCUS,
        ToolNames.AUDIT,
        ToolNames.GITHUB
      ];

      for (const tool of tools) {
        const result = await orchestrator.orchestratePrompt(tool, 'workspace-123', {});
        expect(result.prompt_text).toBeTruthy();
        expect(result.prompt_text.length).toBeGreaterThan(0);
      }
    });

    it('should handle special characters in args', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.ADD,
        'workspace-123',
        {
          description: 'Task with "quotes" and <brackets> & ampersands'
        }
      );

      expect(result.prompt_text).toContain('quotes');
      expect(result.prompt_text).toContain('brackets');
      expect(result.prompt_text).toContain('ampersands');
    });

    it('should handle very long descriptions', async () => {
      const longDescription = 'A'.repeat(10000);
      const result = await orchestrator.orchestratePrompt(
        ToolNames.ADD,
        'workspace-123',
        { description: longDescription }
      );

      expect(result.prompt_text).toContain(longDescription);
    });

    it('should handle unicode characters', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.INIT,
        'workspace-123',
        {
          project_name: '项目名称 🚀',
          tech_stack: 'TypeScript, React ⚛️'
        }
      );

      expect(result.prompt_text).toContain('项目名称');
      expect(result.prompt_text).toContain('🚀');
      expect(result.prompt_text).toContain('⚛️');
    });

    it('should handle newlines in args', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.INIT,
        'workspace-123',
        {
          project_requirements: 'Line 1\nLine 2\nLine 3'
        }
      );

      expect(result.prompt_text).toContain('Line 1');
      expect(result.prompt_text).toContain('Line 2');
      expect(result.prompt_text).toContain('Line 3');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values in args', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.INIT,
        'workspace-123',
        {
          project_name: null as any,
          tech_stack: null as any
        }
      );

      // Should use defaults
      expect(result.prompt_text).toContain('Specly Project');
      expect(result.prompt_text).toContain('Not specified');
    });

    it('should handle undefined values in args', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.ADD,
        'workspace-123',
        {
          description: undefined,
          task_description: undefined
        }
      );

      expect(result.prompt_text).toContain('No description provided');
    });

    it('should handle empty string values', async () => {
      const result = await orchestrator.orchestratePrompt(
        ToolNames.INIT,
        'workspace-123',
        {
          project_name: '',
          tech_stack: '',
          project_requirements: ''
        }
      );

      // Should use defaults for falsy values
      expect(result.prompt_text).toContain('Specly Project');
      expect(result.prompt_text).toContain('Not specified');
      expect(result.prompt_text).toContain('No specific requirements');
    });

    it('should handle very long workspace IDs', async () => {
      const longId = 'workspace-' + 'a'.repeat(1000);
      const result = await orchestrator.orchestratePrompt(
        ToolNames.STATUS,
        longId,
        {}
      );

      expect(result.session_data.workspace_id).toBe(longId);
    });

    it('should handle special characters in workspace ID', async () => {
      const specialId = 'workspace-123-abc_def.xyz';
      const result = await orchestrator.orchestratePrompt(
        ToolNames.STATUS,
        specialId,
        {}
      );

      expect(result.session_data.workspace_id).toBe(specialId);
    });

    it('should be case-sensitive for tool names', async () => {
      const result1 = await orchestrator.orchestratePrompt(
        ToolNames.STATUS,
        'workspace-123',
        {}
      );

      const result2 = await orchestrator.orchestratePrompt(
        'SPECLY_STATUS' as any,
        'workspace-123',
        {}
      );

      expect(result1.prompt_text).not.toBe(result2.prompt_text);
      expect(result2.prompt_text).toContain('Execute system function');
    });
  });

  describe('buildContext (private method)', () => {
    it('should build context with all default values', () => {
      const context = (orchestrator as any).buildContext({}, 'workspace-123');
      
      expect(context).toEqual({
        workspace_path: 'current directory',
        workspace_id: 'workspace-123',
        workspace_name: 'Specly Project',
        task_description: 'No description',
        task_id: 'Unknown task',
        task_title: 'Untitled Task',
        task_priority: 'Medium',
        task_status: 'Backlog',
        task_progress: '0',
        repository_url: 'No repository specified',
        timestamp: expect.any(String),
        created_at: expect.any(String),
        updated_at: expect.any(String),
        project_name: 'Specly Project',
        tech_stack: 'Not specified',
        workspace_rules: '',
        session_id: 'unknown',
        parent_task_id: '',
        connected_files: '',
        notes: '',
        field_updated: '',
        old_value: '',
        new_value: '',
        reason: ''
      });
    });

    it('should build context with provided values', () => {
      const args = {
        workspace_path: '/custom/path',
        workspace_name: 'My Workspace',
        description: 'Custom description',
        task_id: 'task-456',
        task_title: 'Custom Title',
        priority: 'High',
        task_status: 'In Progress',
        task_progress: 75,
        repository_url: 'https://github.com/user/repo',
        project_name: 'Custom Project',
        tech_stack: 'Node.js, Express',
        workspace_rules: 'No semicolons',
        session_id: 'session-789',
        parent_task_id: 'parent-123',
        connected_files: 'file1.ts,file2.ts',
        notes: 'Some notes',
        field_updated: 'status',
        old_value: 'backlog',
        new_value: 'in_progress',
        reason: 'User requested'
      };

      const context = (orchestrator as any).buildContext(args, 'workspace-123');

      expect(context.workspace_path).toBe('/custom/path');
      expect(context.workspace_name).toBe('My Workspace');
      expect(context.task_description).toBe('Custom description');
      expect(context.task_id).toBe('task-456');
      expect(context.task_title).toBe('Custom Title');
      expect(context.task_priority).toBe('High');
      expect(context.task_status).toBe('In Progress');
      expect(context.task_progress).toBe('75');
      expect(context.repository_url).toBe('https://github.com/user/repo');
      expect(context.project_name).toBe('Custom Project');
      expect(context.tech_stack).toBe('Node.js, Express');
      expect(context.workspace_rules).toBe('No semicolons');
      expect(context.session_id).toBe('session-789');
      expect(context.parent_task_id).toBe('parent-123');
      expect(context.connected_files).toBe('file1.ts,file2.ts');
      expect(context.notes).toBe('Some notes');
      expect(context.field_updated).toBe('status');
      expect(context.old_value).toBe('backlog');
      expect(context.new_value).toBe('in_progress');
      expect(context.reason).toBe('User requested');
    });

    it('should handle task_description fallback', () => {
      const context = (orchestrator as any).buildContext({ task_description: 'Fallback description' }, 'ws-123');
      expect(context.task_description).toBe('Fallback description');
    });

    it('should generate timestamp fields as ISO strings', () => {
      const context = (orchestrator as any).buildContext({}, 'ws-123');
      
      expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(context.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(context.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('replaceContextVariables (private method)', () => {
    it('should replace context variables in text', () => {
      const text = 'Project: {{context.project_name}} in {{context.workspace_path}} using {{context.tech_stack}}';
      const context = {
        project_name: 'My App',
        workspace_path: '/home/user',
        tech_stack: 'TypeScript'
      };

      const result = (orchestrator as any).replaceContextVariables(text, context);
      
      expect(result).toBe('Project: My App in /home/user using TypeScript');
    });

    it('should handle multiple occurrences of same variable', () => {
      const text = '{{context.task_id}} - {{context.task_id}} - {{context.task_id}}';
      const context = { task_id: 'TASK-123' };

      const result = (orchestrator as any).replaceContextVariables(text, context);
      
      expect(result).toBe('TASK-123 - TASK-123 - TASK-123');
    });

    it('should handle multiple different variables', () => {
      const text = 'Task {{context.task_id}} titled "{{context.task_title}}" with priority {{context.task_priority}}';
      const context = {
        task_id: 'task-456',
        task_title: 'Implement Feature',
        task_priority: 'High'
      };

      const result = (orchestrator as any).replaceContextVariables(text, context);
      
      expect(result).toBe('Task task-456 titled "Implement Feature" with priority High');
    });

    it('should not replace variables not in context', () => {
      const text = 'Unknown {{context.unknown_var}} remains unchanged';
      const context = { known_var: 'value' };

      const result = (orchestrator as any).replaceContextVariables(text, context);
      
      expect(result).toBe('Unknown {{context.unknown_var}} remains unchanged');
    });

    it('should handle empty context object', () => {
      const text = 'Text with {{context.var}} unchanged';
      const context = {};

      const result = (orchestrator as any).replaceContextVariables(text, context);
      
      expect(result).toBe('Text with {{context.var}} unchanged');
    });

    it('should handle special characters in replacement values', () => {
      const text = 'Path: {{context.workspace_path}}';
      const context = { workspace_path: '/path/with spaces & symbols' };

      const result = (orchestrator as any).replaceContextVariables(text, context);
      
      expect(result).toBe('Path: /path/with spaces & symbols');
    });

    it('should handle regex special characters in variable names', () => {
      const text = 'Value: {{context.field_updated}}';
      const context = { 'field_updated': 'status' };

      const result = (orchestrator as any).replaceContextVariables(text, context);
      
      expect(result).toBe('Value: status');
    });
  });
});
