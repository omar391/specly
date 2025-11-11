import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextStepTemplateGenerator } from '../next-step-generator.js';
import type { DrizzleDatabaseManager } from '../../database/drizzle-connection.js';

// Mock the database manager
const mockDbManager = {
    // Mock methods as needed
} as DrizzleDatabaseManager;

describe('NextStepTemplateGenerator', () => {
    let generator: NextStepTemplateGenerator;

    beforeEach(() => {
        generator = new NextStepTemplateGenerator(mockDbManager);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with database manager and empty cache', () => {
            const newGenerator = new NextStepTemplateGenerator(mockDbManager);
            expect(newGenerator).toBeInstanceOf(NextStepTemplateGenerator);
            // Cache should be empty initially
            expect((newGenerator as any).instructionCache.size).toBe(0);
        });
    });

    describe('generateNextStepInstructions', () => {
        it('should return cached result when available', async () => {
            const mockInstruction = {
                instructionText: 'Cached instruction',
                toolName: 'specly_add',
                stepId: 'validate'
            };

            // Manually set cache
            (generator as any).instructionCache.set('specly_add:validate:global', mockInstruction);

            const result = await generator.generateNextStepInstructions('specly_add', 'validate');
            expect(result).toEqual(mockInstruction);
        });

        it('should return null when tool flow is not found', async () => {
            // Mock getToolFlow to return null
            const getToolFlowSpy = vi.spyOn(generator as any, 'getToolFlow').mockResolvedValue(null);

            const result = await generator.generateNextStepInstructions('unknown_tool');
            expect(result).toBeNull();
            expect(getToolFlowSpy).toHaveBeenCalledWith('unknown_tool', undefined);
        });

        it('should return null when next step cannot be determined', async () => {
            const mockToolFlow = {
                flow_steps: [
                    { system_tool_fn: 'specly_add:validate', step_order: 1, next_tool: 'specly_status' }
                ]
            };

            const getToolFlowSpy = vi.spyOn(generator as any, 'getToolFlow').mockResolvedValue(mockToolFlow);
            const determineNextStepSpy = vi.spyOn(generator as any, 'determineNextStep').mockReturnValue(null);

            const result = await generator.generateNextStepInstructions('specly_add', 'validate');
            expect(result).toBeNull();
            expect(getToolFlowSpy).toHaveBeenCalledWith('specly_add', undefined);
            expect(determineNextStepSpy).toHaveBeenCalledWith(mockToolFlow, 'validate');
        });

        it('should generate instruction successfully with all parameters', async () => {
            const mockToolFlow = {
                flow_steps: [
                    { system_tool_fn: 'specly_add:validate', step_order: 1 },
                    { system_tool_fn: 'specly_add:create', step_order: 2 }
                ]
            };

            const mockNextStep = { system_tool_fn: 'specly_add:create', step_order: 2 };
            const mockInstruction = {
                instructionText: 'Call `specly_add` with `stepId=\'create\'` to Create the item.',
                toolName: 'specly_add',
                stepId: 'create'
            };

            const getToolFlowSpy = vi.spyOn(generator as any, 'getToolFlow').mockResolvedValue(mockToolFlow);
            const determineNextStepSpy = vi.spyOn(generator as any, 'determineNextStep').mockReturnValue(mockNextStep);
            const buildInstructionSpy = vi.spyOn(generator as any, 'buildInstructionText').mockReturnValue(mockInstruction);

            const result = await generator.generateNextStepInstructions('specly_add', 'validate', 'workspace-123', 'test context');

            expect(result).toEqual(mockInstruction);
            expect(getToolFlowSpy).toHaveBeenCalledWith('specly_add', 'workspace-123');
            expect(determineNextStepSpy).toHaveBeenCalledWith(mockToolFlow, 'validate');
            expect(buildInstructionSpy).toHaveBeenCalledWith('specly_add', mockNextStep, 'test context');
            // Should cache the result
            expect((generator as any).instructionCache.has('specly_add:validate:workspace-123')).toBe(true);
        });

        it('should handle errors gracefully and return null', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const getToolFlowSpy = vi.spyOn(generator as any, 'getToolFlow').mockRejectedValue(new Error('DB error'));

            const result = await generator.generateNextStepInstructions('specly_add');
            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith('Error generating next step instructions for specly_add:', expect.any(Error));

            consoleSpy.mockRestore();
        });

        it('should handle initial call without currentStepId', async () => {
            const mockToolFlow = {
                flow_steps: [
                    { system_tool_fn: 'specly_add:validate', step_order: 1 }
                ]
            };

            const mockNextStep = { system_tool_fn: 'specly_add:validate', step_order: 1 };
            const mockInstruction = {
                instructionText: 'Call `specly_add` with `stepId=\'validate\'` to Validate the input.',
                toolName: 'specly_add',
                stepId: 'validate'
            };

            const getToolFlowSpy = vi.spyOn(generator as any, 'getToolFlow').mockResolvedValue(mockToolFlow);
            const determineNextStepSpy = vi.spyOn(generator as any, 'determineNextStep').mockReturnValue(mockNextStep);
            const buildInstructionSpy = vi.spyOn(generator as any, 'buildInstructionText').mockReturnValue(mockInstruction);

            const result = await generator.generateNextStepInstructions('specly_add');

            expect(result).toEqual(mockInstruction);
            expect(determineNextStepSpy).toHaveBeenCalledWith(mockToolFlow, undefined);
        });
    });

    describe('generateCompletionInstructions', () => {
        it('should return completion instruction for known tools', async () => {
            const result = await generator.generateCompletionInstructions('specly_add', 'workspace-123', 'test context');

            expect(result).toEqual({
                instructionText: 'Task has been successfully added to your workspace. Use `specly_status` to view all tasks or continue with other workflow tools. Context: test context',
                toolName: 'specly_add',
                context: 'test context'
            });
        });

        it('should return generic completion instruction for unknown tools', async () => {
            const result = await generator.generateCompletionInstructions('unknown_tool');

            expect(result).toEqual({
                instructionText: 'unknown_tool completed successfully. Refer to the output for next steps.',
                toolName: 'unknown_tool',
                context: undefined
            });
        });

        it('should handle completion without context', async () => {
            const result = await generator.generateCompletionInstructions('specly_init');

            expect(result).toEqual({
                instructionText: 'Project initialization completed. Your workspace is now set up with the task management system. Use `specly_add` to create your first task.',
                toolName: 'specly_init',
                context: undefined
            });
        });
    });

    describe('getAvailableNextSteps', () => {
        it('should return empty array when tool flow is not found', async () => {
            const getToolFlowSpy = vi.spyOn(generator as any, 'getToolFlow').mockResolvedValue(null);

            const result = await generator.getAvailableNextSteps('unknown_tool');
            expect(result).toEqual([]);
            expect(getToolFlowSpy).toHaveBeenCalledWith('unknown_tool', undefined);
        });

        it('should extract step IDs from tool flow steps', async () => {
            const mockToolFlow = {
                flow_steps: [
                    { system_tool_fn: 'specly_add:validate', step_order: 1 },
                    { system_tool_fn: 'specly_add:create', step_order: 2 },
                    { system_tool_fn: 'specly_add:confirm', step_order: 3 }
                ]
            };

            const getToolFlowSpy = vi.spyOn(generator as any, 'getToolFlow').mockResolvedValue(mockToolFlow);

            const result = await generator.getAvailableNextSteps('specly_add', 'workspace-123');
            expect(result).toEqual(['validate', 'create', 'confirm']);
            expect(getToolFlowSpy).toHaveBeenCalledWith('specly_add', 'workspace-123');
        });

        it('should filter out invalid step IDs', async () => {
            const mockToolFlow = {
                flow_steps: [
                    { system_tool_fn: 'specly_add:validate', step_order: 1 },
                    { system_tool_fn: 'invalid_format', step_order: 2 },
                    { system_tool_fn: 'specly_add:create', step_order: 3 }
                ]
            };

            const getToolFlowSpy = vi.spyOn(generator as any, 'getToolFlow').mockResolvedValue(mockToolFlow);

            const result = await generator.getAvailableNextSteps('specly_add');
            expect(result).toEqual(['validate', 'initial', 'create']);
        });

        it('should handle errors gracefully and return empty array', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const getToolFlowSpy = vi.spyOn(generator as any, 'getToolFlow').mockRejectedValue(new Error('DB error'));

            const result = await generator.getAvailableNextSteps('specly_add');
            expect(result).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith('Error getting available steps for specly_add:', expect.any(Error));

            consoleSpy.mockRestore();
        });
    });

    describe('clearCache', () => {
        it('should clear the instruction cache', () => {
            // Add some items to cache
            (generator as any).instructionCache.set('key1', 'value1');
            (generator as any).instructionCache.set('key2', 'value2');
            expect((generator as any).instructionCache.size).toBe(2);

            generator.clearCache();
            expect((generator as any).instructionCache.size).toBe(0);
        });
    });

    // Private method tests
    describe('private methods', () => {
        describe('getToolFlow', () => {
            it('should return null (placeholder implementation)', async () => {
                const result = await (generator as any).getToolFlow('specly_add');
                expect(result).toBeNull();
            });
        });

        describe('determineNextStep', () => {
            it('should return first step when no currentStepId provided', async () => {
                const toolFlow = {
                    flow_steps: [
                        { system_tool_fn: 'specly_add:validate', step_order: 1 },
                        { system_tool_fn: 'specly_add:create', step_order: 2 }
                    ]
                };

                const result = await (generator as any).determineNextStep(toolFlow);
                expect(result).toEqual({ system_tool_fn: 'specly_add:validate', step_order: 1 });
            });

            it('should return null when current step not found', async () => {
                const toolFlow = {
                    flow_steps: [
                        { system_tool_fn: 'specly_add:validate', step_order: 1 }
                    ]
                };

                const result = await (generator as any).determineNextStep(toolFlow, 'nonexistent');
                expect(result).toBeNull();
            });

            it('should return null when current step has next_tool (transition to different tool)', async () => {
                const toolFlow = {
                    flow_steps: [
                        { system_tool_fn: 'specly_add:validate', step_order: 1, next_tool: 'specly_status' }
                    ]
                };

                const result = await (generator as any).determineNextStep(toolFlow, 'validate');
                expect(result).toBeNull();
            });

            it('should return next step in sequence', async () => {
                const toolFlow = {
                    flow_steps: [
                        { system_tool_fn: 'specly_add:validate', step_order: 1 },
                        { system_tool_fn: 'specly_add:create', step_order: 2 },
                        { system_tool_fn: 'specly_add:confirm', step_order: 3 }
                    ]
                };

                const result = await (generator as any).determineNextStep(toolFlow, 'validate');
                expect(result).toEqual({ system_tool_fn: 'specly_add:create', step_order: 2 });
            });

            it('should return null when no next step exists', async () => {
                const toolFlow = {
                    flow_steps: [
                        { system_tool_fn: 'specly_add:validate', step_order: 1 }
                    ]
                };

                const result = await (generator as any).determineNextStep(toolFlow, 'validate');
                expect(result).toBeNull();
            });
        });

        describe('buildInstructionText', () => {
            it('should build instruction text for validate step', () => {
                const nextStep = { system_tool_fn: 'specly_add:validate', step_order: 1 };
                const result = (generator as any).buildInstructionText('specly_add', nextStep);

                expect(result).toEqual({
                    instructionText: 'Call `specly_add` with `stepId=\'validate\'` to Continue with validation step to ensure all requirements are met.',
                    toolName: 'specly_add',
                    stepId: 'validate',
                    context: undefined
                });
            });

            it('should build instruction text with context', () => {
                const nextStep = { system_tool_fn: 'specly_add:create', step_order: 2 };
                const result = (generator as any).buildInstructionText('specly_add', nextStep, 'additional context');

                expect(result.instructionText).toContain('additional context');
                expect(result.stepId).toBe('create');
            });

            it('should handle feedback step flag', () => {
                const nextStep = {
                    system_tool_fn: 'specly_add:validate',
                    step_order: 1,
                    feedback_step: true
                };
                const result = (generator as any).buildInstructionText('specly_add', nextStep);

                expect(result.instructionText).toContain('Note: This step includes user feedback collection.');
            });

            it('should use default description for unknown step types', () => {
                const nextStep = { system_tool_fn: 'specly_add:unknown_step', step_order: 1 };
                const result = (generator as any).buildInstructionText('specly_add', nextStep);

                expect(result.instructionText).toContain('Continue with the unknown_step step');
            });
        });

        describe('extractStepId', () => {
            it('should extract step ID from system_tool_fn', () => {
                expect((generator as any).extractStepId('specly_add:validate')).toBe('validate');
                expect((generator as any).extractStepId('specly_status:detailed')).toBe('detailed');
            });

            it('should return initial for malformed system_tool_fn', () => {
                expect((generator as any).extractStepId('malformed')).toBe('initial');
                expect((generator as any).extractStepId('')).toBe('initial');
            });
        });
    });
});