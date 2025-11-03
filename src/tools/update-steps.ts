import { z } from 'zod';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { SpeclyToolResult } from '../types/index.js';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { GlobalDatabaseService } from '../database/global-queries.js';

// Input schema for specly_update_steps tool
export const updateStepsToolSchema = z.object({
    workspace_path: z.string().describe('Absolute path to the workspace directory'),
    step_name: z.string().describe('Name of the feedback step to update (e.g., workspace_rules_feedback)'),
    content: z.string().describe('New content for the feedback step'),
    reason: z.string().optional().describe('Reason for the update (for audit trail)')
});

export type UpdateStepsToolInput = z.infer<typeof updateStepsToolSchema>;

/**
 * Specly Update Steps Tool - Feedback Step Updates
 * 
 * MCP tool for updating workspace-specific feedback steps, particularly for 
 * dynamic workspace rules and custom validation steps.
 */
export class UpdateStepsTool {
    private orchestrator: PromptOrchestrator;
    private globalDb: GlobalDatabaseService;

    constructor(private drizzleDb: DrizzleDatabaseManager) {
        this.orchestrator = new PromptOrchestrator(drizzleDb);
        this.globalDb = new GlobalDatabaseService(drizzleDb);
    }

    /**
     * Execute specly_update_steps tool
     */
    async execute(input: UpdateStepsToolInput): Promise<SpeclyToolResult> {
        try {
            const { workspace_path, step_name, content, reason } = input;

            // Get workspace
            const workspace = await this.globalDb.getWorkspaceByPath(workspace_path);
            if (!workspace) {
                return {
                    content: [{
                        type: 'text',
                        text: `Error: Workspace not found at path: ${workspace_path}. Please run specly_init first to initialize the workspace.`
                    }],
                    isError: true
                };
            }

            // Generate orchestrated prompt for feedback step update
            const orchestrationResult = await this.orchestrator.orchestratePrompt(
                'specly_update_steps',
                workspace.id,
                {
                    workspace_path,
                    step_name,
                    content,
                    reason,
                    workspace_name: workspace.name,
                    timestamp: new Date().toISOString(),
                    // Include instructions for feedback step database operations
                    update_instructions: `Update or create workspace-specific feedback step '${step_name}' in the database with the provided content`
                }
            );

            return {
                content: [{
                    type: 'text',
                    text: orchestrationResult.prompt_text
                }]
            };
        } catch (error) {
            console.error('Error in specly_update_steps:', error);
            return {
                content: [{
                    type: 'text',
                    text: `Error updating feedback steps: ${error instanceof Error ? error.message : 'Unknown error'}`
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
            name: 'specly_update_steps',
            description: 'Update workspace-specific feedback steps and validation rules',
            inputSchema: {
                type: 'object',
                properties: {
                    workspace_path: {
                        type: 'string',
                        description: 'Absolute path to the workspace directory'
                    },
                    step_name: {
                        type: 'string',
                        description: 'Name of the feedback step to update (e.g., workspace_rules_feedback)'
                    },
                    content: {
                        type: 'string',
                        description: 'New content for the feedback step'
                    },
                    reason: {
                        type: 'string',
                        description: 'Reason for the update (for audit trail)'
                    }
                },
                required: ['workspace_path', 'step_name', 'content']
            }
        };
    }
}
