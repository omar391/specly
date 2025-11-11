import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { ToolNames } from '../constants/tool-names.js';

export interface PromptOrchestrationResult {
  prompt_text: string;
  next_tool?: string;
  session_data: Record<string, any>;
}
export class PromptOrchestrator {
  constructor(private drizzleDb: DrizzleDatabaseManager) {}

  /**
   * Orchestrate prompt generation for a tool call
   */
  async orchestratePrompt(
    toolName: string,
    workspaceId: string,
    args: Record<string, any> = {}
  ): Promise<PromptOrchestrationResult> {
    try {
      const promptText = await this.generateBasicPrompt(toolName, args);
      return {
        prompt_text: promptText,
        session_data: {
          current_tool: toolName,
          workspace_id: workspaceId
        }
      };
    } catch (error) {
      console.error('Error orchestrating prompt:', error);
      throw error;
    }
  }

  /**
   * Generate basic prompt text for a tool
   */
  private async generateBasicPrompt(
    toolName: string,
    args: Record<string, any>
  ): Promise<string> {
    switch (toolName) {
      case ToolNames.START: // 'specly_start'
        return `# Specly Session Started\n\n` +
               `Workspace: ${args.workspace_path || 'current directory'}\n` +
               `Session ready for task management.`;

      case ToolNames.INIT: // 'specly_init'
        return `# Specly Project Initialization\n\n` +
               `Project: ${args.project_name || 'Specly Project'}\n` +
               `Workspace: ${args.workspace_path || 'current directory'}\n` +
               `Tech Stack: ${args.tech_stack || 'Not specified'}\n` +
               `Requirements: ${args.project_requirements || 'No specific requirements'}\n\n` +
               `Ready to initialize project structure and rules.`;

      case ToolNames.ADD: // 'specly_add'
        return `# Task Creation Workflow\n\n` +
               `Task Description: ${args.description || args.task_description || 'No description provided'}\n\n` +
               `Ready to validate and create task.`;

      case 'specly_create_task':
        return `Task creation executed. Task details processed and stored.`;

      case ToolNames.STATUS: // 'specly_status'
        return `# Project Status Analysis\n\n` +
               `Generate comprehensive status report for the current workspace.`;

      case ToolNames.UPDATE: // 'specly_update'
        return `# Task Update Request\n\n` +
               `Target: ${args.target || 'unspecified target'}\n` +
               `Updates: ${args.updates || args.changes || 'No updates specified'}\n\n` +
               `Ready to apply changes.`;

      case ToolNames.FOCUS: // 'specly_focus'
        return `# Task Focus Mode\n\n` +
               `Target Task: ${args.task_id || 'No task specified'}\n\n` +
               `Ready to begin focused work on specified task.`;

      case ToolNames.AUDIT: // 'specly_audit'
        return `# Project Audit Workflow\n\n` +
               `Execute comprehensive project health assessment.`;

      case ToolNames.GITHUB: // 'specly_github'
        return `# GitHub Integration Workflow\n\n` +
               `Action: ${args.action || 'sync'}\n\n` +
               `Ready to execute GitHub synchronization and management.`;

      case ToolNames.RULE_UPDATE: // 'specly_rule_update'
        return `# Workspace Rules Update\n\n` +
               `User Feedback: ${args.user_feedback || args.feedback || 'No feedback provided'}\n\n` +
               `Ready to process rule updates from user feedback.`;

      default:
        return `Execute system function: ${toolName}`;
    }
  }

  /**
   * Build context object for variable substitution
   */
  private buildContext(args: Record<string, any>, workspaceId: string): Record<string, string> {
    return {
      workspace_path: args.workspace_path || 'current directory',
      workspace_id: workspaceId,
      workspace_name: args.workspace_name || 'Specly Project',
      task_description: args.description || args.task_description || 'No description',
      task_id: args.task_id || 'Unknown task',
      task_title: args.task_title || 'Untitled Task',
      task_priority: args.priority || 'Medium',
      task_status: args.task_status || 'Backlog',
      task_progress: args.task_progress?.toString() || '0',
      repository_url: args.repository_url || 'No repository specified',
      timestamp: new Date().toISOString(),
      created_at: args.created_at || new Date().toISOString(),
      updated_at: args.updated_at || new Date().toISOString(),
      project_name: args.project_name || 'Specly Project',
      tech_stack: args.tech_stack || 'Not specified',
      workspace_rules: args.workspace_rules || '',
      session_id: args.session_id || 'unknown',
      parent_task_id: args.parent_task_id || '',
      connected_files: args.connected_files || '',
      notes: args.notes || '',
      field_updated: args.field_updated || '',
      old_value: args.old_value || '',
      new_value: args.new_value || '',
      reason: args.reason || ''
    };
  }

  // Simplified next-step generation (multi-step removed)
  async generateNextStepInstructions(toolName: string): Promise<string> {
    return `Continue with ${toolName} workflow as needed.`;
  }

  /**
   * Replace {{context.variable}} placeholders with actual values
   */
  private replaceContextVariables(text: string, context: Record<string, string>): string {
    return Object.entries(context).reduce((acc, [key, value]) => acc.replace(new RegExp(`{{context\\.${key}}}`, 'g'), value), text);
  }
}
