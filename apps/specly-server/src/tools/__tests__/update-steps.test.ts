import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateStepsTool, updateStepsToolSchema, type UpdateStepsToolInput } from '../update-steps.js';
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

describe('UpdateStepsTool', () => {
    let mockDrizzleDb: DrizzleDatabaseManager;
    let tool: UpdateStepsTool;

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

        tool = new UpdateStepsTool(mockDrizzleDb);
    });

    describe('constructor', () => {
        it('should initialize with drizzle database manager', () => {
            expect(tool).toBeInstanceOf(UpdateStepsTool);
        });

        it('should create PromptOrchestrator with drizzle db', () => {
            expect(PromptOrchestrator).toHaveBeenCalledWith(mockDrizzleDb);
        });

        it('should create GlobalDatabaseService with drizzle db', () => {
            expect(GlobalDatabaseService).toHaveBeenCalledWith(mockDrizzleDb);
        });
    });

    describe('execute - success cases', () => {
        const validInput: UpdateStepsToolInput = {
            workspace_path: '/test/workspace',
            step_name: 'workspace_rules_feedback',
            content: 'New feedback step content',
            reason: 'Test update'
        };

        beforeEach(() => {
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(mockWorkspace);
            mockOrchestrator.orchestratePrompt.mockResolvedValue({
                prompt_text: 'Successfully updated feedback step'
            });
        });

        it('should execute successfully with valid input', async () => {
            const result = await tool.execute(validInput);

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: 'Successfully updated feedback step'
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
                'specly_update_steps',
                'test-workspace-id',
                {
                    workspace_path: '/test/workspace',
                    step_name: 'workspace_rules_feedback',
                    content: 'New feedback step content',
                    reason: 'Test update',
                    workspace_name: 'test-workspace',
                    timestamp: expect.any(String),
                    update_instructions: 'Update or create workspace-specific feedback step \'workspace_rules_feedback\' in the database with the provided content'
                }
            );
        });

        it('should work with different step names', async () => {
            const customStepInput = { ...validInput, step_name: 'custom_validation_step' };
            await tool.execute(customStepInput);

            expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
                'specly_update_steps',
                'test-workspace-id',
                expect.objectContaining({
                    step_name: 'custom_validation_step',
                    update_instructions: 'Update or create workspace-specific feedback step \'custom_validation_step\' in the database with the provided content'
                })
            );
        });

        it('should accept empty reason string', async () => {
            const inputWithEmptyReason = { ...validInput, reason: '' };
            await tool.execute(inputWithEmptyReason);

            expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
                'specly_update_steps',
                'test-workspace-id',
                expect.objectContaining({
                    reason: ''
                })
            );
        });

        it('should handle empty content string', async () => {
            const inputWithEmptyContent = { ...validInput, content: '' };
            await tool.execute(inputWithEmptyContent);

            expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
                'specly_update_steps',
                'test-workspace-id',
                expect.objectContaining({
                    content: ''
                })
            );
        });

        it('should handle special characters in content', async () => {
            const inputWithSpecialChars = { ...validInput, content: 'Content with\nnewlines\tand\ttabs' };
            await tool.execute(inputWithSpecialChars);

            expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
                'specly_update_steps',
                'test-workspace-id',
                expect.objectContaining({
                    content: 'Content with\nnewlines\tand\ttabs'
                })
            );
        });

        it('should generate valid ISO timestamp', async () => {
            const before = new Date();
            await tool.execute(validInput);
            const after = new Date();

            const callArgs = mockOrchestrator.orchestratePrompt.mock.calls[0][2];
            const timestamp = new Date(callArgs.timestamp);

            expect(timestamp).toBeInstanceOf(Date);
            expect(isNaN(timestamp.getTime())).toBe(false);
            expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
        });
    });

    describe('execute - error cases', () => {
        const validInput: UpdateStepsToolInput = {
            workspace_path: '/test/workspace',
            step_name: 'workspace_rules_feedback',
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
                    text: 'Error updating feedback steps: Database connection failed'
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
                    text: 'Error updating feedback steps: Orchestration failed'
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
                    text: 'Error updating feedback steps: Unknown error'
                }],
                isError: true
            });
        });
    });

    describe('getToolDefinition', () => {
        it('should return correct tool definition', () => {
            const definition = UpdateStepsTool.getToolDefinition();

            expect(definition).toEqual({
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
            });
        });
    });

    describe('schema validation', () => {
        it('should validate valid input', () => {
            const validInput = {
                workspace_path: '/test/workspace',
                step_name: 'workspace_rules_feedback',
                content: 'Test content',
                reason: 'Test reason'
            };

            expect(() => updateStepsToolSchema.parse(validInput)).not.toThrow();
        });

        it('should validate input without reason', () => {
            const validInput = {
                workspace_path: '/test/workspace',
                step_name: 'workspace_rules_feedback',
                content: 'Test content'
            };

            expect(() => updateStepsToolSchema.parse(validInput)).not.toThrow();
        });

        it('should reject missing required fields', () => {
            const invalidInput = {
                workspace_path: '/test/workspace',
                step_name: 'workspace_rules_feedback'
                // missing content
            };

            expect(() => updateStepsToolSchema.parse(invalidInput)).toThrow();
        });

        it('should accept various step names', () => {
            const validInputs = [
                { workspace_path: '/test', step_name: 'workspace_rules_feedback', content: 'test' },
                { workspace_path: '/test', step_name: 'custom_validation_step', content: 'test' },
                { workspace_path: '/test', step_name: 'step_123', content: 'test' },
                { workspace_path: '/test', step_name: 'step-with-dashes', content: 'test' },
                { workspace_path: '/test', step_name: 'step_with_underscores', content: 'test' }
            ];

            validInputs.forEach(input => {
                expect(() => updateStepsToolSchema.parse(input)).not.toThrow();
            });
        });

        it('should accept empty strings for all string fields', () => {
            const inputWithEmptyStrings = {
                workspace_path: '',
                step_name: '',
                content: '',
                reason: ''
            };

            expect(() => updateStepsToolSchema.parse(inputWithEmptyStrings)).not.toThrow();
        });

        it('should accept very long strings', () => {
            const longString = 'a'.repeat(10000);
            const inputWithLongStrings = {
                workspace_path: longString,
                step_name: longString,
                content: longString,
                reason: longString
            };

            expect(() => updateStepsToolSchema.parse(inputWithLongStrings)).not.toThrow();
        });

        it('should accept strings with special characters', () => {
            const inputWithSpecialChars = {
                workspace_path: '/path/with spaces & symbols',
                step_name: 'step-name_with.special.chars',
                content: 'Content with émojis 🎉 and symbols @#$%^&*()',
                reason: 'Reason with quotes "and" apostrophes \'test\''
            };

            expect(() => updateStepsToolSchema.parse(inputWithSpecialChars)).not.toThrow();
        });
    });
});