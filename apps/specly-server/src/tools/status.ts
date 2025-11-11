import { z } from 'zod';
import type { SpeclyToolResult } from '../types/index.js';
import { BaseTool, BaseToolConfig, ToolDefinition, createBaseToolSchema } from './base-tool.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';
// Legacy multi-step executor removed.
import { ToolNames } from '../constants/tool-names.js';

export const statusToolSchema = createBaseToolSchema(ToolNames.STATUS, {}, ['workspace_path']);

export type StatusToolInput = z.infer<typeof statusToolSchema>;

/**
 * Specly Status Tool (single-step).
 * Legacy ToolFlowExecutor and multi-step routing removed; now returns a single
 * consolidated status summary.
 */
export class StatusToolNew extends BaseTool {

  constructor(drizzleDb: DrizzleDatabaseManager) {
    const config: BaseToolConfig = {
      name: ToolNames.STATUS,
      description: 'Generate comprehensive project status report with analysis and recommendations. Uses database-driven flow execution.',
      requiredFields: ['workspace_path'],
      additionalProperties: {}
    };

    super(drizzleDb, config);
  }

  /**
   * Execute specly_status tool with database-driven step routing
   */
  async execute(input: any): Promise<SpeclyToolResult> {
    const { workspace_path } = input;
    const workspaceValidation = await this.validateWorkspace(workspace_path);
    if (!workspaceValidation.isValid) {
      return this.createErrorResult(workspaceValidation.error!, { workspace_path });
    }
    return this.handleOverview(workspaceValidation.workspace);
  }

  /**
   * Get tool name for database lookup
   */
  getToolName(): string {
    return ToolNames.STATUS;
  }

  // Multi-step handlers removed (intentionally not reintroduced).

  /**
   * Overview step - provide high-level status summary
   */
  private async handleOverview(workspace: any): Promise<SpeclyToolResult> {
    try {
      const workspaceDb = new WorkspaceDatabaseService(workspace.path);
      await workspaceDb.initialize();
      const tasks = await workspaceDb.getAllTasks();

      // Calculate status metrics
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
      const blockedTasks = tasks.filter(t => t.status === 'blocked').length;

      // Generate status prompt
      return this.createSuccessResult(
        'Workspace status summary generated',
        {
          isFinalStep: true,
          feedback: 'Status overview complete',
          data: {
            summary: {
              total_tasks: totalTasks,
              completed_tasks: completedTasks,
              in_progress_tasks: inProgressTasks,
              blocked_tasks: blockedTasks,
              completion_percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
            }
          }
        }
      );

    } catch (error) {
      return this.createErrorResult(
        `Failed to generate status overview: ${error instanceof Error ? error.message : String(error)}`,
        { workspace_path: workspace?.path }
      );
    }
  }

  /**
   * Detailed step - provide comprehensive analysis
   */
  /**
   * Get tool definition with dynamic stepId enumeration from database
   */
  static async getToolDefinitionDynamic(drizzleDb: DrizzleDatabaseManager): Promise<ToolDefinition> {
    return {
      name: ToolNames.STATUS,
      description: 'Generate a simple project status summary.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_path: {
            type: 'string',
            description: 'Absolute path to the workspace directory'
          }
        },
        required: ['workspace_path']
      }
    };
  }

  /**
   * Static tool definition for immediate use (fallback)
   */
  static getToolDefinition(): ToolDefinition {
    return {
      name: ToolNames.STATUS,
      description: 'Generate a simple project status summary.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_path: {
            type: 'string',
            description: 'Absolute path to the workspace directory'
          }
        },
        required: ['workspace_path']
      }
    };
  }
}
