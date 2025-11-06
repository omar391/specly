import { z } from 'zod';
import type { SpeclyToolResult } from '../types/index.js';
import { BaseTool, BaseToolConfig, ToolDefinition, createBaseToolSchema } from './base-tool.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { ToolNames } from '../constants/tool-names.js';

export const updateToolSchema = createBaseToolSchema(ToolNames.UPDATE, {
  task_id: z.string().describe('Task ID to update (e.g., TP-001)'),
  field: z.enum(['title', 'description', 'priority', 'status', 'progress', 'notes', 'connected_files', 'blocked_by']).describe('Field to update'),
  value: z.string().describe('New value for the field'),
  reason: z.string().optional().describe('Reason for the update (for audit trail)')
}, ['task_id', 'workspace_path', 'field', 'value']);

export type UpdateToolInput = z.infer<typeof updateToolSchema>;

/**
 * Specly Update Tool - Refactored using BaseTool interface
 * 
 * Enhanced with database-driven stepId enumeration and common error handling.
 */
export class UpdateToolNew extends BaseTool {
  constructor(drizzleDb: DrizzleDatabaseManager) {
    const config: BaseToolConfig = {
      name: ToolNames.UPDATE,
      description: 'Single-step update of task properties with audit trail.',
      requiredFields: ['task_id', 'workspace_path', 'field', 'value'],
      additionalProperties: {
        task_id: {
          type: 'string',
          description: 'Task ID to update (e.g., TP-001)'
        },
        field: {
          type: 'string',
          enum: ['title', 'description', 'priority', 'status', 'progress', 'notes', 'connected_files', 'blocked_by'],
          description: 'Field to update'
        },
        value: {
          type: 'string',
          description: 'New value for the field'
        },
        reason: {
          type: 'string',
          description: 'Reason for the update (for audit trail)'
        }
      }
    };

    super(drizzleDb, config);
  }

  async execute(input: any): Promise<SpeclyToolResult> {
    const { workspace_path, task_id, field, value, reason } = input as UpdateToolInput & { workspace_path: string };
    const workspaceValidation = await this.validateWorkspace(workspace_path);
    if (!workspaceValidation.isValid) {
      return this.createErrorResult(workspaceValidation.error!, { workspace_path });
    }
    const workspace = workspaceValidation.workspace;
    return this.applyUpdate({ task_id, field, value, reason } as UpdateToolInput, workspace);
  }

  private async applyUpdate(input: UpdateToolInput, workspace: any): Promise<SpeclyToolResult> {
    const { task_id, field, value, reason } = input;
    try {
      const workspaceDb = new WorkspaceDatabaseService(workspace.path, this.drizzleDb);
      const task = await workspaceDb.getTask(task_id);
      if (!task) {
        return this.createErrorResult(`Task ${task_id} not found`, { task_id });
      }
      const updatedTask = { ...task } as any;
      switch (field) {
        case 'title':
          updatedTask.title = value;
          break;
        case 'description':
          updatedTask.description = value;
          break;
        case 'priority':
          updatedTask.priority = value.toLowerCase();
          break;
        case 'status':
          updatedTask.status = value as any;
          break;
        case 'progress':
          updatedTask.progress = Number(value);
          break;
        case 'notes':
          updatedTask.notes = (updatedTask.notes || '') + '\n' + value;
          break;
        case 'connected_files':
          updatedTask.assets = value.split(',').map((v: string) => v.trim());
          break;
        case 'blocked_by':
          // store as externalReferences metadata note for now
          updatedTask.metadata = { ...(updatedTask.metadata || {}), blocked_by: value.split(',').map((v: string) => v.trim()) };
          break;
      }
      updatedTask.updatedAt = new Date().toISOString();
      await workspaceDb.updateTask(task_id, updatedTask);
      return this.createSuccessResult(
        `Task ${task_id} updated successfully`,
        { isFinalStep: true, feedback: 'Update applied', data: { task_id, field, value, reason, updated: true } }
      );
    } catch (error) {
      return this.createErrorResult(`Failed to update task: ${error instanceof Error ? error.message : String(error)}`, { task_id, field, value });
    }
  }

  /**
   * Get tool definition with dynamic stepId enumeration
   */
  static async getToolDefinitionDynamic(drizzleDb: DrizzleDatabaseManager): Promise<ToolDefinition> {
    const instance = new UpdateToolNew(drizzleDb);
    return await instance.getToolDefinition();
  }

  /**
   * Static tool definition for immediate use (fallback)
   */
  static getToolDefinition(): ToolDefinition {
    return {
      name: 'specly_update',
      description: 'Single-step update of task properties with audit trail.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'Task ID to update (e.g., TP-001)'
          },
          workspace_path: {
            type: 'string',
            description: 'Absolute path to the workspace directory'
          },
          field: {
            type: 'string',
            enum: ['title', 'description', 'priority', 'status', 'progress', 'notes', 'connected_files', 'blocked_by'],
            description: 'Field to update'
          },
          value: {
            type: 'string',
            description: 'New value for the field'
          },
          reason: {
            type: 'string',
            description: 'Reason for the update (for audit trail)'
          }
        },
        required: ['task_id', 'workspace_path', 'field', 'value']
      }
    };
  }
}
