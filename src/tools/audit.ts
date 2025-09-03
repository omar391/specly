import type { TaskPilotToolResult } from '../types/index.js';
import { BaseTool, BaseToolConfig, ToolDefinition, createBaseToolSchema } from './base-tool.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';

// Simplified single-step audit tool schema
export const auditToolSchema = createBaseToolSchema('taskpilot_audit', {}, ['workspace_path']);
export type AuditToolInput = { workspace_path: string };

export class AuditToolNew extends BaseTool {
  constructor(drizzleDb: DrizzleDatabaseManager) {
    const config: BaseToolConfig = {
      name: 'taskpilot_audit',
      description: 'Single-step audit of workspace tasks summarizing status and potential blockers.',
      requiredFields: ['workspace_path'],
      additionalProperties: {}
    };
    super(drizzleDb, config);
  }

  async execute(input: AuditToolInput): Promise<TaskPilotToolResult> {
    const { workspace_path } = input;
    const workspaceValidation = await this.validateWorkspace(workspace_path);
    if (!workspaceValidation.isValid) {
      return this.createErrorResult(workspaceValidation.error!, { workspace_path });
    }
    const workspace = workspaceValidation.workspace;
    try {
      const workspaceDb = new WorkspaceDatabaseService(workspace.path, this.drizzleDb);
      const tasks = await workspaceDb.getAllTasks();
      const total = tasks.length;
      const done = tasks.filter(t => t.status === 'done').length;
      const inProgress = tasks.filter(t => t.status === 'in-progress').length;
      const blocked = tasks.filter(t => t.status === 'blocked').length;
      const highPriorityOpen = tasks.filter(t => t.priority === 'high' && t.status !== 'done');
      const summary = `Tasks: ${total}, Done: ${done}, In-Progress: ${inProgress}, Blocked: ${blocked}, High-Priority Open: ${highPriorityOpen.length}`;
      return this.createSuccessResult(summary);
    } catch (error) {
      return this.createErrorResult(`Audit failed: ${error instanceof Error ? error.message : String(error)}`, { workspace_path });
    }
  }

  static getToolDefinition(): ToolDefinition {
    return {
      name: 'taskpilot_audit',
      description: 'Single-step audit of workspace tasks summarizing status and potential blockers.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace_path: { type: 'string', description: 'Absolute path to the workspace directory' }
        },
        required: ['workspace_path']
      }
    };
  }
}
