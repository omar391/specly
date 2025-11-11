import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateResourcesTool, updateResourcesToolSchema, type UpdateResourcesToolInput } from '../update-resources.js';
import { DrizzleDatabaseManager } from '../../database/drizzle-connection.js';
import { PromptOrchestrator } from '../../services/prompt-orchestrator.js';
import { GlobalDatabaseService } from '../../database/global-queries.js';

// Mock dependencies
const mockGlobalDb = {
  getWorkspaceByPath: vi.fn()
};

const mockOrchestrator = {
  orchestratePrompt: vi.fn()
};

vi.mock('../../database/global-queries.js', () => ({
  GlobalDatabaseService: vi.fn().mockImplementation(() => mockGlobalDb)
}));

vi.mock('../../services/prompt-orchestrator.js', () => ({
  PromptOrchestrator: vi.fn().mockImplementation(() => mockOrchestrator)
}));

describe('UpdateResourcesTool', () => {
    let mockDrizzleDb: DrizzleDatabaseManager;
    let tool: UpdateResourcesTool;

    const mockWorkspace = {
        id: 'test-workspace-id',
        name: 'test-workspace',
        path: '/test/workspace',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockDrizzleDb = {} as DrizzleDatabaseManager;

        tool = new UpdateResourcesTool(mockDrizzleDb);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with drizzle database manager', () => {
            expect(tool).toBeInstanceOf(UpdateResourcesTool);
        });

        it('should create PromptOrchestrator with drizzle db', () => {
            expect(PromptOrchestrator).toHaveBeenCalledWith(mockDrizzleDb);
        });

        it('should create GlobalDatabaseService with drizzle db', () => {
            expect(GlobalDatabaseService).toHaveBeenCalledWith(mockDrizzleDb);
        });
    });

    describe('execute - success cases', () => {
        const validInput: UpdateResourcesToolInput = {
            workspace_path: '/test/workspace',
            resource_type: 'project.md',
            content: 'New project content',
            reason: 'Test update'
        };

        beforeEach(() => {
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(mockWorkspace);
            mockOrchestrator.orchestratePrompt.mockResolvedValue({
                prompt_text: 'Successfully updated project.md'
            });
        });

        it('should execute successfully with valid input', async () => {
            const result = await tool.execute(validInput);

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: 'Successfully updated project.md'
                }]
            });
            expect(result.isError).toBeUndefined();
        });

        it('should call getWorkspaceByPath with correct path', async () => {
            await tool.execute(validInput);

            expect(mockGlobalDb.getWorkspaceByPath).toHaveBeenCalledWith('/test/workspace');
        });

        it('should call orchestratePrompt with correct parameters', async () => {
            await tool.execute(validInput);

            expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
                'specly_update_resources',
                'test-workspace-id',
                {
                    workspace_path: '/test/workspace',
                    resource_type: 'project.md',
                    content: 'New project content',
                    reason: 'Test update',
                    workspace_name: 'test-workspace',
                    timestamp: expect.any(String),
                    resource_file_path: '/test/workspace/.specly/project.md',
                    update_instructions: 'Create or update the project.md file in the .specly directory with the provided content'
                }
            );
        });

        it('should work with design.md resource type', async () => {
            const designInput = { ...validInput, resource_type: 'design.md' as const };
            await tool.execute(designInput);

            expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
                'specly_update_resources',
                'test-workspace-id',
                expect.objectContaining({
                    resource_type: 'design.md',
                    resource_file_path: '/test/workspace/.specly/design.md',
                    update_instructions: 'Create or update the design.md file in the .specly directory with the provided content'
                })
            );
        });

        it('should work without reason parameter', async () => {
            const inputWithoutReason = { ...validInput };
            delete inputWithoutReason.reason;

            await tool.execute(inputWithoutReason);

            expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
                'specly_update_resources',
                'test-workspace-id',
                expect.objectContaining({
                    reason: undefined
                })
            );
        });
    });

    describe('execute - error cases', () => {
        const validInput: UpdateResourcesToolInput = {
            workspace_path: '/test/workspace',
            resource_type: 'project.md',
            content: 'New content'
        };

        it('should return error when workspace not found', async () => {
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);

            const result = await tool.execute(validInput);

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: 'Error: Workspace not found at path: /test/workspace. Please run specly_init first to initialize the workspace.'
                }],
                isError: true
            });
        });

        it('should return error when getWorkspaceByPath throws', async () => {
            mockGlobalDb.getWorkspaceByPath.mockRejectedValue(new Error('Database connection failed'));

            const result = await tool.execute(validInput);

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: 'Error updating resources: Database connection failed'
                }],
                isError: true
            });
        });

        it('should return error when orchestratePrompt throws', async () => {
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(mockWorkspace);
            mockOrchestrator.orchestratePrompt.mockRejectedValue(new Error('Orchestration failed'));

            const result = await tool.execute(validInput);

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: 'Error updating resources: Orchestration failed'
                }],
                isError: true
            });
        });

        it('should return error for unknown error type', async () => {
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(mockWorkspace);
            mockOrchestrator.orchestratePrompt.mockRejectedValue('String error');

            const result = await tool.execute(validInput);

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: 'Error updating resources: Unknown error'
                }],
                isError: true
            });
        });
    });

    describe('getToolDefinition', () => {
        it('should return correct tool definition', () => {
            const definition = UpdateResourcesTool.getToolDefinition();

            expect(definition).toEqual({
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
            });
        });
    });

    describe('schema validation', () => {
        it('should validate valid input', () => {
            const validInput = {
                workspace_path: '/test/workspace',
                resource_type: 'project.md',
                content: 'Test content',
                reason: 'Test reason'
            };

            expect(() => updateResourcesToolSchema.parse(validInput)).not.toThrow();
        });

        it('should reject invalid resource_type', () => {
            const invalidInput = {
                workspace_path: '/test/workspace',
                resource_type: 'invalid.md',
                content: 'Test content'
            };

            expect(() => updateResourcesToolSchema.parse(invalidInput)).toThrow();
        });

        it('should reject missing required fields', () => {
            const invalidInput = {
                workspace_path: '/test/workspace',
                resource_type: 'project.md'
                // missing content
            };

            expect(() => updateResourcesToolSchema.parse(invalidInput)).toThrow();
        });

        it('should accept input without reason', () => {
            const validInput = {
                workspace_path: '/test/workspace',
                resource_type: 'project.md',
                content: 'Test content'
            };

            expect(() => updateResourcesToolSchema.parse(validInput)).not.toThrow();
        });
    });
});