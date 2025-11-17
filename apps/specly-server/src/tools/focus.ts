import { z } from 'zod';
import type { SpeclyToolResult } from '../types/index.js';
import { BaseTool, BaseToolConfig, ToolDefinition, createBaseToolSchema } from './base-tool.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';

// Input schema using the new base pattern
export const focusToolSchema = createBaseToolSchema('specly_focus', {
  task_id: z.string().describe('Task ID to focus on (e.g., TP-001)')
}, ['task_id', 'workspace_path']);

/**
 * Specly Focus Tool - Refactored using BaseTool interface
 * 
 * Enhanced with database-driven stepId enumeration and common error handling.
 */
export class FocusToolNew extends BaseTool {
  constructor(drizzleDb: DrizzleDatabaseManager) {
    const config: BaseToolConfig = {
      name: 'specly_focus',
      description: 'Focus on specific task and provide implementation guidance. Supports multi-step workflow.',
      requiredFields: ['task_id', 'workspace_path'],
      additionalProperties: {
        task_id: {
          type: 'string',
          description: 'Task ID to focus on (e.g., TP-001)'
        }
      }
    };

    super(drizzleDb, config);
  }

  /**
   * Execute specly_focus tool with multi-step support using base class validation
   */
  async execute(input: any): Promise<SpeclyToolResult> {
    try {
      const { stepId, workspace_path } = input;
      // Single-step simplified focus tool

      // Use base class workspace validation
      const workspaceValidation = await this.validateWorkspace(workspace_path);
      if (!workspaceValidation.isValid) {
        return {
          content: [{ type: 'text', text: workspaceValidation.error! }],
          isError: true
        };
      }

      const workspace = workspaceValidation.workspace;

      const query = input.query || 'focus';
      return this.createSuccessResult(`Focus captured: ${query}`);

    } catch (error) {
      const errorMessage = `Error in specly_focus: ${error instanceof Error ? error.message : String(error)}`;
      return {
        content: [{ type: 'text', text: errorMessage }],
        isError: true
      };
    }
  }

  /**
   * Initial step - basic task focus
   */



  /**
   * Analyze step - detailed task analysis
   */



  /**
   * Plan step - implementation planning
   */



  /**
   * Implement step - implementation guidance (final step)
   */



  /**
   * Get tool definition with dynamic stepId enumeration
   */
  static async getToolDefinitionDynamic(drizzleDb: DrizzleDatabaseManager): Promise<ToolDefinition> {
    const instance = new FocusToolNew(drizzleDb);
    return await instance.getToolDefinition();
  }

  /**
   * Static tool definition for immediate use (fallback)
   */
  static getToolDefinition(): ToolDefinition {
    return {
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
    };
  }
}
