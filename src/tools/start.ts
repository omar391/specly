import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { TaskPilotToolResult } from '../types/index.js';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import type { NewWorkspace, NewSession } from '../database/schema/global-schema.js';

// Input schema for taskpilot_start tool
export const startToolSchema = z.object({
  workspace_path: z.string().describe('Absolute path to the workspace directory')
});

export type StartToolInput = z.infer<typeof startToolSchema>;

/**
 * TaskPilot Start Tool - Session Initiation (Pure TypeScript/Drizzle)
 * 
 * Core MCP tool that initiates workspace sessions and returns comprehensive 
 * prompt_text for LLM context. Includes workspace setup, active task 
 * identification, and analytical framework instructions.
 */
export class StartTool {
  private orchestrator: PromptOrchestrator;
  private globalDb: GlobalDatabaseService;

  constructor(private drizzleDb: DrizzleDatabaseManager) {
    this.orchestrator = new PromptOrchestrator(drizzleDb);
    this.globalDb = new GlobalDatabaseService(drizzleDb);
  }

  /**
   * Execute taskpilot_start tool
   */
  async execute(input: StartToolInput): Promise<TaskPilotToolResult> {
    try {
      const { workspace_path } = input;

      // Create or get workspace
      const workspace = await this.ensureWorkspace(workspace_path);
      
      // Create new session
      const session = await this.createSession(workspace.id);
      
  // Rules subsystem removed (legacy feedback steps). Placeholder values.
  const workspaceRules = null;
  const standardGlobalRules = null;
      
      // Generate orchestrated prompt with comprehensive context
      const orchestrationResult = await this.orchestrator.orchestratePrompt(
        'taskpilot_start',
        workspace.id,
        {
          workspace_name: workspace.name,
          workspace_path: workspace_path,
          session_id: session.id,
          timestamp: new Date().toISOString(),
          workspace_rules: workspaceRules,
          standard_global_rules: standardGlobalRules
        }
      );

      // Update workspace activity
      await this.globalDb.updateWorkspaceActivity(workspace.id);

      return {
        content: [{
          type: 'text',
          text: orchestrationResult.prompt_text
        }]
      };
    } catch (error) {
      console.error('Error in taskpilot_start:', error);
      return {
        content: [{
          type: 'text',
          text: `Error initiating TaskPilot session: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  /**
   * Ensure workspace exists in database, create if necessary
   */
  private async ensureWorkspace(workspacePath: string): Promise<any> {
    // Check if workspace already exists
    let workspace = await this.globalDb.getWorkspaceByPath(workspacePath);

    if (!workspace) {
      // Create new workspace
      const workspaceId = uuidv4();
      const workspaceName = workspacePath.split('/').pop() || 'Unknown Project';
      
      const newWorkspace: NewWorkspace = {
        id: workspaceId,
        path: workspacePath,
        name: workspaceName,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      workspace = await this.globalDb.createWorkspace(newWorkspace);
    } else {
      // Activate existing workspace
      workspace = await this.globalDb.updateWorkspace(workspace.id, {
        status: 'active',
        updatedAt: new Date().toISOString()
      });
    }

    return workspace;
  }

  /**
   * Create new session for the workspace
   */
  private async createSession(workspaceId: string): Promise<any> {
    // Close any existing active sessions for this workspace
    const activeSessions = await this.globalDb.getWorkspaceSessions(workspaceId);
    for (const session of activeSessions.filter(s => s.isActive)) {
      await this.globalDb.closeSession(session.id);
    }

    // Create new session
    const sessionId = uuidv4();
    const newSession: NewSession = {
      id: sessionId,
      workspaceId: workspaceId,
      isActive: true,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    return await this.globalDb.createSession(newSession);
  }

  /**
   * Get workspace-specific rules from feedback steps
   */
  // Legacy feedback-step based rule retrieval removed

  /**
   * Get tool definition for MCP server
   */
  static getToolDefinition() {
    return {
      name: 'taskpilot_start',
      description: 'Initialize TaskPilot session for a workspace and provide comprehensive project context',
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