/**
 * Unit Tests for NextStepTemplateGenerator
 * 
 * Tests dynamic generation of next step instructions from database tool flows
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextStepTemplateGenerator } from '../services/next-step-generator.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { ToolNames } from '../constants/tool-names.js';

describe('NextStepTemplateGenerator', () => {
    let generator: NextStepTemplateGenerator;
    let mockDbManager: DrizzleDatabaseManager;

    beforeEach(() => {
        // Create mock database manager
        mockDbManager = {} as DrizzleDatabaseManager;

        generator = new NextStepTemplateGenerator(mockDbManager);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        generator.clearCache();
    });

    describe('generateCompletionInstructions', () => {
        it('should generate completion instructions for known tools', async () => {
            const result = await generator.generateCompletionInstructions('specly_add');
            
            expect(result).toBeDefined();
            expect(result.instructionText).toContain('Task has been successfully added');
            expect(result.toolName).toBe('specly_add');
        });

        it('should generate completion instructions for unknown tools', async () => {
            const result = await generator.generateCompletionInstructions('unknown_tool');
            
            expect(result).toBeDefined();
            expect(result.instructionText).toContain('unknown_tool completed successfully');
            expect(result.toolName).toBe('unknown_tool');
        });

        it('should include context when provided', async () => {
            const context = 'Additional workflow context';
            const result = await generator.generateCompletionInstructions('specly_init', undefined, context);
            
            expect(result.instructionText).toContain(context);
            expect(result.context).toBe(context);
        });
    });

    describe('getAvailableNextSteps', () => {
        it('should return empty array when no tool flow found', async () => {
            const result = await generator.getAvailableNextSteps('nonexistent_tool');
            
            expect(result).toEqual([]);
        });

        it('should list stepIds from tool flow (including initial when no colon present)', async () => {
            const flow = {
                flow_steps: [
                    { system_tool_fn: `${ToolNames.ADD}:validate`, step_order: 1 },
                    { system_tool_fn: `${ToolNames.ADD}:create`, step_order: 2 },
                    { system_tool_fn: `${ToolNames.ADD}`, step_order: 3 }, // no colon -> 'initial'
                ]
            };

            const spy = vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow')
                .mockResolvedValue(flow);

            const steps = await generator.getAvailableNextSteps(ToolNames.ADD);
            expect(spy).toHaveBeenCalledTimes(1);
            expect(steps).toEqual(['validate', 'create', 'initial']);
        });
    });

    describe('cache management', () => {
        it('should clear instruction cache', () => {
            // This should not throw an error
            expect(() => generator.clearCache()).not.toThrow();
        });
    });

    describe('extractStepId helper', () => {
        it('should extract step ID behavior via getAvailableNextSteps', async () => {
            const flow = {
                flow_steps: [
                    { system_tool_fn: `${ToolNames.STATUS}:confirm`, step_order: 1 },
                    { system_tool_fn: `${ToolNames.STATUS}:recommendations`, step_order: 2 },
                ]
            };
            vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow')
                .mockResolvedValue(flow);

            const steps = await generator.getAvailableNextSteps(ToolNames.STATUS);
            expect(steps).toEqual(['confirm', 'recommendations']);
        });
    });

    describe('instruction templates', () => {
        it('should have appropriate templates for different completion types', async () => {
            const toolTests = [
                { tool: ToolNames.ADD, expectedKeyword: 'added' },
                { tool: ToolNames.INIT, expectedKeyword: 'initialization' },
                { tool: ToolNames.STATUS, expectedKeyword: 'Status' },
                { tool: ToolNames.UPDATE, expectedKeyword: 'update' },
                { tool: ToolNames.AUDIT, expectedKeyword: 'Audit' },
                { tool: ToolNames.FOCUS, expectedKeyword: 'Focus' }
            ];

            for (const { tool, expectedKeyword } of toolTests) {
                const result = await generator.generateCompletionInstructions(tool);
                expect(result.instructionText.toLowerCase()).toContain(expectedKeyword.toLowerCase());
            }
        });
    });

    describe('error handling', () => {
        it('should handle database errors gracefully', async () => {
            // Test with invalid tool name that would cause internal errors
            const result = await generator.generateNextStepInstructions('invalid_tool_name');
            
            // Should return null instead of throwing
            expect(result).toBeNull();
        });

        it('should return null if toolFlow is missing or current step unknown', async () => {
            // Missing toolFlow
            vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockResolvedValue(null);
            const noFlow = await generator.generateNextStepInstructions(ToolNames.ADD);
            expect(noFlow).toBeNull();

            // Unknown current step
            vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockResolvedValue({
                flow_steps: [ { system_tool_fn: `${ToolNames.ADD}:validate`, step_order: 1 } ]
            });
            const unknown = await generator.generateNextStepInstructions(ToolNames.ADD, 'nonexistent');
            expect(unknown).toBeNull();
        });
    });

    describe('generateNextStepInstructions (with injected toolFlow)', () => {
        it('should generate first step when currentStepId is undefined and cache the result', async () => {
            const flow = {
                flow_steps: [
                    { system_tool_fn: `${ToolNames.ADD}:validate`, step_order: 1 },
                    { system_tool_fn: `${ToolNames.ADD}:create`, step_order: 2 },
                ]
            };

            const spy = vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow')
                .mockResolvedValue(flow);

            const first = await generator.generateNextStepInstructions(ToolNames.ADD);
            expect(first).toBeTruthy();
            expect(first!.toolName).toBe(ToolNames.ADD);
            expect(first!.stepId).toBe('validate');
            expect(first!.instructionText).toContain("stepId='validate'");

            // Cached path
            const second = await generator.generateNextStepInstructions(ToolNames.ADD);
            expect(second).toBe(first); // same object from cache
            expect(spy).toHaveBeenCalledTimes(1);

            // Clear cache forces another fetch
            generator.clearCache();
            await generator.generateNextStepInstructions(ToolNames.ADD);
            expect(spy).toHaveBeenCalledTimes(2);
        });

        it('should generate next step when currentStepId is provided', async () => {
            const flow = {
                flow_steps: [
                    { system_tool_fn: `${ToolNames.ADD}:validate`, step_order: 1 },
                    { system_tool_fn: `${ToolNames.ADD}:create`, step_order: 2 },
                    { system_tool_fn: `${ToolNames.ADD}:confirm`, step_order: 3 },
                ]
            };
            vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockResolvedValue(flow);

            const next = await generator.generateNextStepInstructions(ToolNames.ADD, 'validate');
            expect(next).toBeTruthy();
            expect(next!.stepId).toBe('create');
            expect(next!.instructionText).toContain("stepId='create'");
        });

        it('should return null when current step points to next_tool (handoff to another tool)', async () => {
            const flow = {
                flow_steps: [
                    { system_tool_fn: `${ToolNames.STATUS}:detailed`, step_order: 1 },
                    { system_tool_fn: `${ToolNames.STATUS}:recommendations`, step_order: 2, next_tool: ToolNames.FOCUS },
                ]
            };
            vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockResolvedValue(flow);

            const res = await generator.generateNextStepInstructions(ToolNames.STATUS, 'recommendations');
            expect(res).toBeNull();
        });

        it('should include context and feedback note when provided by step', async () => {
            const flow = {
                flow_steps: [
                    { system_tool_fn: `${ToolNames.STATUS}:analyze`, step_order: 1 },
                    { system_tool_fn: `${ToolNames.STATUS}:plan`, step_order: 2, feedback_step: true },
                ]
            };
            vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockResolvedValue(flow);

            const ctx = 'user wants to review high-priority tasks first';
            const res = await generator.generateNextStepInstructions(ToolNames.STATUS, 'analyze', 'ws-1', ctx);
            expect(res).toBeTruthy();
            expect(res!.stepId).toBe('plan');
            expect(res!.instructionText).toContain('Context:');
            expect(res!.instructionText).toContain('feedback');
        });

        it('should create distinct cache entries per workspaceId and step', async () => {
            const flow = {
                flow_steps: [ { system_tool_fn: `${ToolNames.UPDATE}:validate`, step_order: 1 } ]
            };
            const spy = vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockResolvedValue(flow);

            const a = await generator.generateNextStepInstructions(ToolNames.UPDATE, undefined, 'wsA');
            const b = await generator.generateNextStepInstructions(ToolNames.UPDATE, undefined, 'wsB');
            expect(a).not.toBe(b);
            // first call for wsA and wsB -> two fetches
            expect(spy).toHaveBeenCalledTimes(2);
        });

        it('should handle unknown stepId in instruction templates (fallback to default)', async () => {
            const flow = {
                flow_steps: [
                    { system_tool_fn: `${ToolNames.ADD}:unknown_step`, step_order: 1 },
                    { system_tool_fn: `${ToolNames.ADD}:another_unknown`, step_order: 2 },
                ]
            };
            vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockResolvedValue(flow);

            const result = await generator.generateNextStepInstructions(ToolNames.ADD);
            expect(result).toBeTruthy();
            expect(result!.instructionText).toContain("Continue with the unknown_step step");
            expect(result!.stepId).toBe('unknown_step');
        });

        it('should cover various step template mappings', async () => {
            const testCases = [
                { stepId: 'confirm', expectedText: 'Confirm the changes' },
                { stepId: 'analyze', expectedText: 'Analyze the current state' },
                { stepId: 'plan', expectedText: 'Create a detailed plan' },
                { stepId: 'implement', expectedText: 'Execute the planned changes' },
                { stepId: 'detailed', expectedText: 'Generate detailed information' },
                { stepId: 'recommendations', expectedText: 'Get personalized recommendations' },
                { stepId: 'rules', expectedText: 'Review and apply workspace rules' },
            ];

            for (const { stepId, expectedText } of testCases) {
                const flow = {
                    flow_steps: [
                        { system_tool_fn: `${ToolNames.STATUS}:${stepId}`, step_order: 1 },
                    ]
                };
                vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockResolvedValue(flow);

                const result = await generator.generateNextStepInstructions(ToolNames.STATUS);
                expect(result).toBeTruthy();
                expect(result!.instructionText).toContain(expectedText);
                expect(result!.stepId).toBe(stepId);

                // Clear cache for next iteration
                generator.clearCache();
            }
        });

        it('should handle getToolFlow throwing an error', async () => {
            vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockRejectedValue(new Error('DB error'));

            const result = await generator.generateNextStepInstructions(ToolNames.ADD);
            expect(result).toBeNull();
        });

        it('should handle getAvailableNextSteps with error in getToolFlow', async () => {
            vi.spyOn(NextStepTemplateGenerator.prototype as any, 'getToolFlow').mockRejectedValue(new Error('DB error'));

            const result = await generator.getAvailableNextSteps(ToolNames.ADD);
            expect(result).toEqual([]);
        });
    });
});
