import { z } from 'zod';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { SpeclyToolResult } from '../types/index.js';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { GlobalDatabaseService } from '../database/global-queries.js';

// Input schema for specly_rule_update tool
export const ruleUpdateToolSchema = z.object({
  workspace_path: z.string().describe('Absolute path to the workspace directory'),
  rule_type: z.enum(['coding', 'git', 'testing', 'security', 'performance', 'custom']).describe('Type of rule to update'),
  rule_content: z.string().describe('Rule content or instruction'),
  action: z.enum(['add', 'update', 'remove']).describe('Action to perform on the rule')
});

export type RuleUpdateToolInput = z.infer<typeof ruleUpdateToolSchema>;

/**
 * Specly Rule Update Tool - Workspace Rules Management (Pure TypeScript/Drizzle)
 * 
 * MCP tool for managing workspace-specific rules and guidelines.
 * Updates workspace rules based on user interactions and preferences.
 */
export class RuleUpdateTool {
  private orchestrator: PromptOrchestrator;
  private globalDb: GlobalDatabaseService;

  constructor(private drizzleDb: DrizzleDatabaseManager) {
    this.orchestrator = new PromptOrchestrator(drizzleDb);
    this.globalDb = new GlobalDatabaseService(drizzleDb);
  }

  /**
   * Execute specly_rule_update tool
   */
  async execute(input: RuleUpdateToolInput): Promise<SpeclyToolResult> {
    try {
      const { workspace_path, rule_type, rule_content, action } = input;

      // Get workspace
      const workspace = await this.globalDb.getWorkspaceByPath(workspace_path);
      if (!workspace) {
        return {
          content: [{
            type: 'text',
            text: `Error: Workspace not found at path: ${workspace_path}. Please run specly_start first to initialize the workspace.`
          }],
          isError: true
        };
      }

      // Generate orchestrated prompt for rule updates
      const orchestrationResult = await this.orchestrator.orchestratePrompt(
        'specly_rule_update',
        workspace.id,
        {
          workspace_path,
          workspace_name: workspace.name,
          rule_type,
          rule_content,
          action,
          timestamp: new Date().toISOString(),
          // Include instructions for rule file updates
          rules_file_path: `${workspace_path}/.task/rules/workspace_rules.md`,
          rule_update_instructions: `${action} ${rule_type} rule in workspace_rules.md file: "${rule_content}"`
        }
      );

      return {
        content: [{
          type: 'text',
          text: orchestrationResult.prompt_text
        }]
      };
    } catch (error) {
      console.error('Error in specly_rule_update:', error);
      return {
        content: [{
          type: 'text',
          text: `Error updating rule: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  /**
   * Get tool definition for MCP server
   */
  static getToolDefinition() {
    return {
      name: 'specly_rule_update',
      description: 'Manage workspace-specific rules and guidelines',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_path: {
            type: 'string',
            description: 'Absolute path to the workspace directory'
          },
          rule_type: {
            type: 'string',
            enum: ['coding', 'git', 'testing', 'security', 'performance', 'custom'],
            description: 'Type of rule to update'
          },
          rule_content: {
            type: 'string',
            description: 'Rule content or instruction'
          },
          action: {
            type: 'string',
            enum: ['add', 'update', 'remove'],
            description: 'Action to perform on the rule'
          }
        },
        required: ['workspace_path', 'rule_type', 'rule_content', 'action']
      }
    };
  }
}
