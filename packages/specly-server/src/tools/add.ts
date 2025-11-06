import { z } from 'zod';
import type { SpeclyToolResult } from '../types/index.js';
import { BaseTool, BaseToolConfig, ToolDefinition, createBaseToolSchema } from './base-tool.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';
import type { NewTask } from '../database/schema/workspace-schema.js';
import { ToolNames } from '../constants/tool-names.js';

export const addToolSchema = createBaseToolSchema(ToolNames.ADD, {
  task_description: z.string().describe('Description of the task to add'),
}, ['task_description', 'workspace_path']);

export type AddToolInput = z.infer<typeof addToolSchema>;

/**
 * Specly Add Tool - Refactored using BaseTool interface
 * 
 * Enhanced with database-driven stepId enumeration and common error handling.
 * Demonstrates the new pattern all tools should follow.
 */
export class AddToolNew extends BaseTool {
  constructor(drizzleDb: DrizzleDatabaseManager) {
    const config: BaseToolConfig = {
      name: ToolNames.ADD,
      description: 'Multi-step task creation workflow with analytical validation and creation. Supports dynamic stepId parameter for iterative LLM calls.',
      requiredFields: ['task_description', 'workspace_path'],
      additionalProperties: {
        task_description: {
          type: 'string',
          description: 'Description of the task to be created'
        },
        priority: {
          type: 'string',
          enum: ['High', 'Medium', 'Low'],
          description: 'Task priority level (defaults to Medium)'
        },
        parent_task_id: {
          type: 'string',
          description: 'ID of parent task if this is a subtask'
        },
        title: {
          type: 'string',
          description: 'Concise task title (will be generated from description if not provided)'
        }
      }
    };

    super(drizzleDb, config);
  }

  /**
   * Execute specly_add tool with multi-step support using base class validation
   */
  async execute(input: any): Promise<SpeclyToolResult> {
    const { workspace_path, task_description, priority = 'Medium', parent_task_id, title } = input as AddToolInput & { workspace_path: string };
    const workspaceValidation = await this.validateWorkspace(workspace_path);
    if (!workspaceValidation.isValid) {
      return this.createErrorResult(workspaceValidation.error!, { workspace_path });
    }
    const workspace = workspaceValidation.workspace;
    return this.handleCreationStep({ task_description, priority, parent_task_id, title } as AddToolInput, workspace);
  }

  /**
   * Initial step - start analytical validation workflow
   */
  /**
   * Handle creation step - create task directly (single-step simplified)
   */
  private async handleCreationStep(input: AddToolInput, workspace: any): Promise<SpeclyToolResult> {
    const { task_description, priority, parent_task_id, title } = input;

    try {
      // Generate task ID and title if not provided
      const taskId = `TP-${String(Date.now()).slice(-6)}`;
      const taskTitle = title || this.generateTaskTitle(task_description);

      // Create task in workspace database
      const workspaceDb = new WorkspaceDatabaseService(workspace.path);
      await workspaceDb.initialize();

      const newTask: NewTask = {
        id: taskId,
        title: taskTitle,
        description: task_description,
        priority: (priority?.toLowerCase() as 'high' | 'medium' | 'low') || 'medium',
        status: 'queued',
        progress: 0,
        notes: '',
        assets: [],
        externalReferences: [],
        metadata: {},
        tags: [],
        profileVersionId: null,
        blockedReason: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Use final Specly method
      await workspaceDb.createTask(newTask);

      return this.createSuccessResult(
        `Task ${taskId} created successfully`,
        {
          isFinalStep: true,
          feedback: `Task ${taskId} created successfully`,
          data: {
            task_id: taskId,
            task_title: taskTitle,
            created: true,
            workspace_id: workspace.id
          }
        }
      );

    } catch (error) {
      return this.createErrorResult(
        `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
        { task_description, workspace_path: workspace.path }
      );
    }
  }

  /**
   * Generate a concise task title from description
   */
  private generateTaskTitle(description: string): string {
    // Extract first sentence or first 50 characters
    const sentences = description.split(/[.!?]+/);
    const firstSentence = sentences[0]?.trim();

    if (firstSentence && firstSentence.length <= 60) {
      return firstSentence;
    }

    // Fallback to first 50 characters with ellipsis
    return description.substring(0, 50).trim() + (description.length > 50 ? '...' : '');
  }

  /**
   * Get tool definition with dynamic stepId enumeration
   */
  static async getToolDefinitionDynamic(drizzleDb: DrizzleDatabaseManager): Promise<ToolDefinition> {
    const instance = new AddToolNew(drizzleDb);
    return await instance.getToolDefinition();
  }

  /**
   * Static tool definition for immediate use (fallback)
   */
  static getToolDefinition(): ToolDefinition {
    return {
      name: ToolNames.ADD,
      description: 'Multi-step task creation workflow with analytical validation. Supports dynamic stepId parameter for iterative LLM calls.',
      inputSchema: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            enum: ['validate', 'create'],
            description: 'Optional step ID for multi-step workflow: validate, create'
          },
          task_description: {
            type: 'string',
            description: 'Description of the task to be created'
          },
          workspace_path: {
            type: 'string',
            description: 'Absolute path to the workspace directory'
          },
          priority: {
            type: 'string',
            enum: ['High', 'Medium', 'Low'],
            description: 'Task priority level (defaults to Medium)'
          },
          parent_task_id: {
            type: 'string',
            description: 'ID of parent task if this is a subtask'
          }
        },
        required: ['task_description', 'workspace_path']
      }
    };
  }
}
