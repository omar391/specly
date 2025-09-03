/**
 * Unit Tests for CLI.ts
 * 
 * Tests CLI tool execution, argument parsing, result formatting,
 * and error handling for the unified single-step TaskPilotToolResult model.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { executeToolCall } from '../cli.js';

// Mock prompt orchestrator to control behavior but let database work normally
vi.mock('../services/prompt-orchestrator.js');

describe('CLI Tool Execution Tests', () => {
    let testWorkspacePath: string;
    let originalConsoleLog: typeof console.log;
    let originalConsoleError: typeof console.error;
    let consoleLogSpy: any;
    let consoleErrorSpy: any;

    beforeEach(() => {
        // Create test workspace
        testWorkspacePath = path.join(os.tmpdir(), `cli-test-${Date.now()}`);
        if (!fs.existsSync(testWorkspacePath)) {
            fs.mkdirSync(testWorkspacePath, { recursive: true });
        }

        // Mock console methods to capture output
        originalConsoleLog = console.log;
        originalConsoleError = console.error;
        consoleLogSpy = vi.fn();
        consoleErrorSpy = vi.fn();
        console.log = consoleLogSpy;
        console.error = consoleErrorSpy;
    });

    afterEach(() => {
        // Restore console methods
        console.log = originalConsoleLog;
        console.error = originalConsoleError;

        // Clean up test workspace
        if (fs.existsSync(testWorkspacePath)) {
            fs.rmSync(testWorkspacePath, { recursive: true, force: true });
        }

        vi.clearAllMocks();
    });

    describe('Tool Execution with Valid Arguments', () => {
        it('should execute taskpilot_start successfully', async () => {
            const args = {
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('taskpilot_start', args);

            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
            expect(Array.isArray(result.content)).toBe(true);
        }, 10000);
        
        it('should execute taskpilot_add (single-step)', async () => {
            const args = {
                task_description: 'Test task for CLI execution',
                workspace_path: testWorkspacePath
            };
            const result = await executeToolCall('taskpilot_add', args);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        }, 15000);

        it('should execute taskpilot_status with workspace', async () => {
            const args = {
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('taskpilot_status', args);
            expect(result).toBeDefined();
        }, 10000);
    });

    describe('Argument Validation and Parsing', () => {
        it('should validate required parameters', async () => {
            // Missing required workspace_path for taskpilot_start
            const invalidArgs = {};

            await expect(async () => {
                await executeToolCall('taskpilot_start', invalidArgs);
            }).rejects.toThrow();
        });

        it('should validate parameter types', async () => {
            // Invalid parameter type
            const invalidArgs = {
                workspace_path: 123 // Should be string
            };

            await expect(async () => {
                await executeToolCall('taskpilot_start', invalidArgs);
            }).rejects.toThrow();
        });

        it('should handle unknown tools', async () => {
            await expect(async () => {
                await executeToolCall('unknown_tool', {});
            }).rejects.toThrow('Unknown tool');
        });

        // stepId validation removed with single-step migration
    });

    describe('Error Handling', () => {
        it('should handle non-existent workspace paths', async () => {
            const args = {
                workspace_path: '/non/existent/path/to/workspace'
            };

            // Should not crash, should return error result
            const result = await executeToolCall('taskpilot_status', args);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        }, 10000);

        it('should handle database initialization errors gracefully', async () => {
            // This test verifies that CLI handles database errors without crashing
            const args = {
                workspace_path: testWorkspacePath
            };

            // The CLI should initialize tools and handle any database errors internally
            const result = await executeToolCall('taskpilot_start', args);
            expect(result).toBeDefined();
        }, 10000);
    });

    describe('Tool Schema Definitions', () => {
        it('should have valid schemas for all tools', async () => {
            // Import the tools to check their schemas
            const { AddToolNew } = await import('../tools/add.js');
            const { StartTool } = await import('../tools/start.js');
            const { StatusToolNew } = await import('../tools/status.js');
            
            expect(AddToolNew.getToolDefinition).toBeDefined();
            expect(StartTool.getToolDefinition).toBeDefined();
            expect(StatusToolNew.getToolDefinition).toBeDefined();
        });
    });

    describe('Performance and Timeout Handling', () => {
        it('should handle tool execution within reasonable time', async () => {
            const startTime = Date.now();

            const args = {
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('taskpilot_start', args);

            const duration = Date.now() - startTime;

            expect(result).toBeDefined();
            expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
        }, 20000);

        it('should handle multiple concurrent tool calls', async () => {
            const args = {
                workspace_path: testWorkspacePath
            };

            // Execute multiple tools concurrently
            const promises = [
                executeToolCall('taskpilot_start', args),
                executeToolCall('taskpilot_status', args),
                executeToolCall('taskpilot_start', { workspace_path: testWorkspacePath + '-2' })
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result).toBeDefined();
            });
        }, 30000);
    });

    describe('Result Format Consistency', () => {
        it('should return consistent result format (single model)', async () => {
            const args = {
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('taskpilot_start', args);
            expect(result).toHaveProperty('content');
            expect(Array.isArray(result.content)).toBe(true);
            expect(result.content[0]).toHaveProperty('type');
            expect(result.content[0]).toHaveProperty('text');
        }, 10000);
    });

    describe('CLI Integration with Database', () => {
        it('should properly initialize database services', async () => {
            // This test ensures that CLI can initialize all required services
            const args = {
                workspace_path: testWorkspacePath
            };

            // Should not throw during initialization
            const result = await executeToolCall('taskpilot_start', args);
            expect(result).toBeDefined();
        }, 10000);

        it('should handle workspace creation and updates', async () => {
            const uniqueWorkspace = path.join(os.tmpdir(), `cli-workspace-${Date.now()}`);
            fs.mkdirSync(uniqueWorkspace, { recursive: true });

            try {
                const args = {
                    workspace_path: uniqueWorkspace
                };

                // First call should create workspace
                const firstResult = await executeToolCall('taskpilot_start', args);
                expect(firstResult).toBeDefined();

                // Second call should use existing workspace
                const secondResult = await executeToolCall('taskpilot_start', args);
                expect(secondResult).toBeDefined();
            } finally {
                if (fs.existsSync(uniqueWorkspace)) {
                    fs.rmSync(uniqueWorkspace, { recursive: true, force: true });
                }
            }
        }, 15000);
    });

    describe('CLI Argument Edge Cases', () => {
        it('should handle empty string arguments', async () => {
            const args = {
                task_description: '',
                workspace_path: testWorkspacePath
            };

            // Should handle empty string gracefully
            const result = await executeToolCall('taskpilot_add', args);
            expect(result).toBeDefined();
        }, 10000);

        it('should handle very long arguments', async () => {
            const longDescription = 'A'.repeat(10000); // 10KB string
            const args = {
                task_description: longDescription,
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('taskpilot_add', args);
            expect(result).toBeDefined();
        }, 15000);

        it('should handle special characters in arguments', async () => {
            const specialChars = 'Test with special chars: !@#$%^&*()[]{}|;:,.<>?';
            const args = {
                task_description: specialChars,
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('taskpilot_add', args);
            expect(result).toBeDefined();
        }, 10000);
    });
});
