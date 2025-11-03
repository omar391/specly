import { z } from 'zod';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { SpeclyToolResult } from '../types/index.js';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { GlobalDatabaseService } from '../database/global-queries.js';

// Input schema for specly_github tool
export const githubToolSchema = z.object({
  workspace_path: z.string().describe('Absolute path to the workspace directory'),
  action: z.enum(['create_issue', 'create_pr', 'sync_tasks']).describe('GitHub action to perform'),
  title: z.string().optional().describe('Title for issue or PR'),
  description: z.string().optional().describe('Description for issue or PR'),
  branch: z.string().optional().describe('Branch name for PR')
});

export type GitHubToolInput = z.infer<typeof githubToolSchema>;

/**
 * Specly GitHub Tool - GitHub Integration (Pure TypeScript/Drizzle)
 * 
 * MCP tool for GitHub integration including issue creation, PR management,
 * and task synchronization with GitHub projects.
 */
export class GitHubTool {
  private orchestrator: PromptOrchestrator;
  private globalDb: GlobalDatabaseService;

  constructor(private drizzleDb: DrizzleDatabaseManager) {
    this.orchestrator = new PromptOrchestrator(drizzleDb);
    this.globalDb = new GlobalDatabaseService(drizzleDb);
  }

  /**
   * Execute specly_github tool
   */
  async execute(input: GitHubToolInput): Promise<SpeclyToolResult> {
    try {
      const { workspace_path, action, title, description, branch } = input;

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

      // Generate orchestrated prompt for GitHub integration
      const orchestrationResult = await this.orchestrator.orchestratePrompt(
        'specly_github',
        workspace.id,
        {
          workspace_path,
          workspace_name: workspace.name,
          action,
          title,
          description,
          branch,
          timestamp: new Date().toISOString(),
          // Include instructions for GitHub integration
          github_instructions: `Perform GitHub ${action} action using available GitHub MCP tools and task file integration`
        }
      );

      return {
        content: [{
          type: 'text',
          text: orchestrationResult.prompt_text
        }]
      };
    } catch (error) {
      console.error('Error in specly_github:', error);
      return {
        content: [{
          type: 'text',
          text: `Error performing GitHub action: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      name: 'specly_github',
      description: 'Integrate with GitHub for issue creation, PR management, and task synchronization',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_path: {
            type: 'string',
            description: 'Absolute path to the workspace directory'
          },
          action: {
            type: 'string',
            enum: ['create_issue', 'create_pr', 'sync_tasks'],
            description: 'GitHub action to perform'
          },
          title: {
            type: 'string',
            description: 'Title for issue or PR'
          },
          description: {
            type: 'string',
            description: 'Description for issue or PR'
          },
          branch: {
            type: 'string',
            description: 'Branch name for PR'
          }
        },
        required: ['workspace_path', 'action']
      }
    };
  }
}
