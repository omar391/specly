import { z } from 'zod';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import type { SpeclyToolResult } from '../types/index.js';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { GlobalDatabaseService } from '../database/global-queries.js';

// Input schema for specly_update_resources tool
export const updateResourcesToolSchema = z.object({
    workspace_path: z.string().describe('Absolute path to the workspace directory'),
    resource_type: z.enum(['project.md', 'design.md']).describe('Resource file to update'),
    content: z.string().describe('New content for the resource file'),
    reason: z.string().optional().describe('Reason for the update (for audit trail)')
});

export type UpdateResourcesToolInput = z.infer<typeof updateResourcesToolSchema>;

/**
 * Specly Update Resources Tool - Project Documentation Updates
 * 
 * MCP tool for updating project documentation resources like project.md and design.md
 * files in the .specly directory structure.
 */
export class UpdateResourcesTool {
    private orchestrator: PromptOrchestrator;
    private globalDb: GlobalDatabaseService;

    constructor(private drizzleDb: DrizzleDatabaseManager) {
        this.orchestrator = new PromptOrchestrator(drizzleDb);
        this.globalDb = new GlobalDatabaseService(drizzleDb);
    }

    /**
     * Execute specly_update_resources tool
     */
    async execute(input: UpdateResourcesToolInput): Promise<SpeclyToolResult> {
        try {
            const { workspace_path, resource_type, content, reason } = input;

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

            // Generate orchestrated prompt for resource update
            const orchestrationResult = await this.orchestrator.orchestratePrompt(
                'specly_update_resources',
                workspace.id,
                {
                    workspace_path,
                    resource_type,
                    content,
                    reason,
                    workspace_name: workspace.name,
                    timestamp: new Date().toISOString(),
                    // Include instructions for file operations
                    resource_file_path: `${workspace_path}/.specly/${resource_type}`,
                    update_instructions: `Create or update the ${resource_type} file in the .specly directory with the provided content`
                }
            );

            return {
                content: [{
                    type: 'text',
                    text: orchestrationResult.prompt_text
                }]
            };
        } catch (error) {
            console.error('Error in specly_update_resources:', error);
            return {
                content: [{
                    type: 'text',
                    text: `Error updating resources: ${error instanceof Error ? error.message : 'Unknown error'}`
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
            name: 'specly_update_resources',
            description: 'Update project documentation resources like project.md and design.md',
            inputSchema: {
                type: 'object',
                properties: {
                    workspace_path: {
                        type: 'string',
                        description: 'Absolute path to the workspace directory'
                    },
                    resource_type: {
                        type: 'string',
                        enum: ['project.md', 'design.md'],
                        description: 'Resource file to update'
                    },
                    content: {
                        type: 'string',
                        description: 'New content for the resource file'
                    },
                    reason: {
                        type: 'string',
                        description: 'Reason for the update (for audit trail)'
                    }
                },
                required: ['workspace_path', 'resource_type', 'content']
            }
        };
    }
}
