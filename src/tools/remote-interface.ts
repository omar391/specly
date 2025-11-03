import { z } from 'zod';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { SpeclyToolResult } from '../types/index.js';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { GlobalDatabaseService } from '../database/global-queries.js';

// Input schema for specly_remote_interface tool
export const remoteInterfaceToolSchema = z.object({
  workspace_path: z.string().describe('Absolute path to the workspace directory'),
  interface_type: z.enum(['github', 'jira', 'linear', 'asana', 'trello', 'custom']).describe('Type of remote interface'),
  action: z.enum(['connect', 'sync', 'configure', 'test']).describe('Action to perform'),
  config: z.string().optional().describe('Configuration parameters as JSON string')
});

export type RemoteInterfaceToolInput = z.infer<typeof remoteInterfaceToolSchema>;

/**
 * Specly Remote Interface Tool - External System Integration (Pure TypeScript/Drizzle)
 * 
 * MCP tool for managing connections to external systems like GitHub, Jira, Linear,
 * Asana, Trello, and custom interfaces for task synchronization.
 */
export class RemoteInterfaceTool {
  private orchestrator: PromptOrchestrator;
  private globalDb: GlobalDatabaseService;

  constructor(private drizzleDb: DrizzleDatabaseManager) {
    this.orchestrator = new PromptOrchestrator(drizzleDb);
    this.globalDb = new GlobalDatabaseService(drizzleDb);
  }

  /**
   * Execute specly_remote_interface tool
   */
  async execute(input: RemoteInterfaceToolInput): Promise<SpeclyToolResult> {
    try {
      const { workspace_path, interface_type, action, config } = input;

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

      // Get MCP server mappings for this interface type
      const mcpMappings = await this.globalDb.getMcpServerMappingsByType(interface_type);
      const defaultMapping = await this.globalDb.getDefaultMcpServerMapping(interface_type);

      // Generate orchestrated prompt for remote interface management
      const orchestrationResult = await this.orchestrator.orchestratePrompt(
        'specly_remote_interface',
        workspace.id,
        {
          workspace_path,
          workspace_name: workspace.name,
          interface_type,
          action,
          config,
          available_servers: JSON.stringify(mcpMappings.map(m => m.mcpServerName)),
          default_server: defaultMapping?.mcpServerName || null,
          timestamp: new Date().toISOString(),
          // Include instructions for remote interface integration
          remote_interface_instructions: `${action} ${interface_type} interface using available MCP servers and configuration`
        }
      );

      return {
        content: [{
          type: 'text',
          text: orchestrationResult.prompt_text
        }]
      };
    } catch (error) {
      console.error('Error in specly_remote_interface:', error);
      return {
        content: [{
          type: 'text',
          text: `Error managing remote interface: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      name: 'specly_remote_interface',
      description: 'Manage connections to external systems for task synchronization',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_path: {
            type: 'string',
            description: 'Absolute path to the workspace directory'
          },
          interface_type: {
            type: 'string',
            enum: ['github', 'jira', 'linear', 'asana', 'trello', 'custom'],
            description: 'Type of remote interface'
          },
          action: {
            type: 'string',
            enum: ['connect', 'sync', 'configure', 'test'],
            description: 'Action to perform'
          },
          config: {
            type: 'string',
            description: 'Configuration parameters as JSON string'
          }
        },
        required: ['workspace_path', 'interface_type', 'action']
      }
    };
  }
}
