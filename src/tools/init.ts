import { z } from 'zod';
import type { TaskPilotToolResult } from '../types/index.js';
import { BaseTool, BaseToolConfig, ToolDefinition, createBaseToolSchema } from './base-tool.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';
import { ToolNames } from '../constants/tool-names.js';

// Input schema using the new base pattern
export const initToolSchema = createBaseToolSchema(ToolNames.INIT, {
    project_requirements: z.string().describe('Initial project requirements and description')
}, ['project_requirements', 'workspace_path']);

export type InitToolInput = z.infer<typeof initToolSchema>;

/**
 * TaskPilot Init Tool - Refactored using BaseTool interface
 * 
 * Single-step simplified initialization tool.
 */
export class InitToolNew extends BaseTool {
  constructor(drizzleDb: DrizzleDatabaseManager) {
    const config: BaseToolConfig = {
      name: ToolNames.INIT,
      description: 'Initialize TaskPilot workspace with folder structure and initial configuration (single-step).',
      requiredFields: ['workspace_path'],
      additionalProperties: {
        project_requirements: {
          type: 'string',
          description: 'Initial project requirements or description'
        }
      }
    };

    super(drizzleDb, config);
  }

  /**
   * Execute taskpilot_init tool with multi-step support using base class validation
   */
  async execute(input: any): Promise<TaskPilotToolResult> { return this.initializeWorkspace(input as InitToolInput); }

  /**
   * Initial step - validate workspace and show initialization plan
   */
  private async initializeWorkspace(input: InitToolInput): Promise<TaskPilotToolResult> {
    const { workspace_path, project_requirements } = input;

    try {
      // Check if workspace already exists and is initialized
      try {
        const workspace = await this.globalDb.getWorkspaceByPath(workspace_path);
        if (workspace) {
          return this.createErrorResult(
            'Workspace is already initialized. Use other TaskPilot tools to manage tasks.',
            { workspace_path }
          );
        }
      } catch (error) {
        // Workspace doesn't exist, which is expected for initialization
      }

      // Generate initialization plan prompt
      const orchestrationResult = await this.orchestrator.orchestratePrompt(
        'taskpilot_init',
        'global', // Use global context since workspace doesn't exist yet
        {
          workspace_path,
          project_requirements: project_requirements || 'No specific requirements provided',
          step: 'initial'
        }
      );

      return this.createSuccessResult(orchestrationResult.prompt_text);

    } catch (error) {
      return this.createErrorResult(
        `Failed to plan workspace initialization: ${error instanceof Error ? error.message : String(error)}`,
        { workspace_path }
      );
    }
  }

  // Legacy multi-step methods removed.

  /**
   * Get tool definition
   */
  static async getToolDefinitionDynamic(drizzleDb: DrizzleDatabaseManager): Promise<ToolDefinition> {
    const instance = new InitToolNew(drizzleDb);
    return await instance.getToolDefinition();
  }

  /**
   * Static tool definition for immediate use (fallback)
   */
  static getToolDefinition(): ToolDefinition {
    return {
      name: 'taskpilot_init',
      description: 'Initialize TaskPilot workspace with folder structure and initial configuration (single-step).',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_path: {
            type: 'string',
            description: 'Absolute path to the workspace directory'
          },
          project_requirements: {
            type: 'string',
            description: 'Initial project requirements or description'
          }
        },
        required: ['workspace_path']
      }
    };
  }
}
