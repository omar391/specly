/**
 * Unit Tests for NextStepTemplateGenerator
 * 
 * Tests dynamic generation of next step instructions from database tool flows
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextStepTemplateGenerator } from '../services/next-step-generator.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';

describe('NextStepTemplateGenerator', () => {
    let generator: NextStepTemplateGenerator;
    let mockDbManager: DrizzleDatabaseManager;

    beforeEach(() => {
        // Create mock database manager
        mockDbManager = {} as DrizzleDatabaseManager;

        generator = new NextStepTemplateGenerator(mockDbManager);
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
    });

    describe('cache management', () => {
        it('should clear instruction cache', () => {
            // This should not throw an error
            expect(() => generator.clearCache()).not.toThrow();
        });
    });

    describe('extractStepId helper', () => {
        it('should extract step ID from system tool function', () => {
            // Test the private method indirectly through public interface
            // Since extractStepId is private, we test its behavior through public methods
            expect(true).toBe(true); // Placeholder - actual testing would require exposing the method or testing through integration
        });
    });

    describe('instruction templates', () => {
        it('should have appropriate templates for different completion types', async () => {
            const toolTests = [
                { tool: 'specly_add', expectedKeyword: 'added' },
                { tool: 'specly_init', expectedKeyword: 'initialization' },
                { tool: 'specly_status', expectedKeyword: 'Status' },
                { tool: 'specly_update', expectedKeyword: 'update' },
                { tool: 'specly_audit', expectedKeyword: 'Audit' },
                { tool: 'specly_focus', expectedKeyword: 'Focus' }
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
    });
});
