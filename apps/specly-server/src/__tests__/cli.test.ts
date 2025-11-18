import { describe, it, expect } from 'vitest';
import { runCli, main, executeToolCall } from '../cli.js';

describe('CLI tests', () => {
    it('executeToolCall throws for unknown tool', async () => {
        const result = await executeToolCall('non-existent-tool', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Unknown tool');
    });

  it('main throws when no args provided', async () => {
    // Temporarily set process.argv to simulate no arguments
    const oldArgv = process.argv;
    try {
      process.argv = [oldArgv[0], oldArgv[1]];
      await expect(main()).rejects.toThrow('process.exit called with code 1');
    } finally {
      process.argv = oldArgv;
    }
  });
});

/**
 * Unit Tests for CLI.ts
 * 
 * Tests CLI tool execution, argument parsing, result formatting,
 * and error handling for the unified single-step SpeclyToolResult model.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { executeToolCall, main, runCli } from '../cli.js';
import { setTestDatabaseInstances, resetDatabaseInstances } from '../test-utils/database-test-helpers.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { GlobalDatabaseService } from '../database/global-queries.js';

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

        // Reset any injected DB instances
        resetDatabaseInstances();

        vi.clearAllMocks();
    });

    describe('Tool Execution with Valid Arguments', () => {
        it('should execute specly_start successfully', async () => {
            const args = {
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('specly_start', args);

            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
            expect(Array.isArray(result.content)).toBe(true);
        }, 10000);
        
        it('should execute specly_add (single-step)', async () => {
            const args = {
                task_description: 'Test task for CLI execution',
                workspace_path: testWorkspacePath
            };
            const result = await executeToolCall('specly_add', args);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        }, 15000);

        it('should execute specly_status with workspace', async () => {
            const args = {
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('specly_status', args);
            expect(result).toBeDefined();
        }, 10000);
    });

    describe('Argument Validation and Parsing', () => {
        it('should validate required parameters', async () => {
            // Missing required workspace_path for specly_start
            const invalidArgs = {};

            const result = await executeToolCall('specly_start', invalidArgs);
            expect(result.isError).toBe(true);
        });

        it('should validate parameter types', async () => {
            // Invalid parameter type
            const invalidArgs = {
                workspace_path: 123 // Should be string
            };

            const result = await executeToolCall('specly_start', invalidArgs);
            expect(result.isError).toBe(true);
        });

        it('should handle unknown tools', async () => {
            const result = await executeToolCall('unknown_tool', {});
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unknown tool');
        });

        // stepId validation removed with single-step migration
    });

    describe('Error Handling', () => {
        it('should handle non-existent workspace paths', async () => {
            const args = {
                workspace_path: '/non/existent/path/to/workspace'
            };

            // Should not crash, should return error result
            const result = await executeToolCall('specly_status', args);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        }, 10000);

        it('should handle database initialization errors gracefully', async () => {
            // This test verifies that CLI handles database errors without crashing
            const args = {
                workspace_path: testWorkspacePath
            };

            // The CLI should initialize tools and handle any database errors internally
            const result = await executeToolCall('specly_start', args);
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

            const result = await executeToolCall('specly_start', args);

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
                executeToolCall('specly_start', args),
                executeToolCall('specly_status', args),
                executeToolCall('specly_start', { workspace_path: testWorkspacePath + '-2' })
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result).toBeDefined();
            });
        }, 30000);
    });

    describe('InitializeTools test-instance path', () => {
        it('should use injected test database instances when provided', async () => {
            const dm = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
            await dm.initialize();
            const gdb = new GlobalDatabaseService(dm as any);
            await gdb.initialize();

            // Inject test instances so CLI picks them up
            setTestDatabaseInstances(dm as any, gdb as any);

            const args = { workspace_path: testWorkspacePath };
            const result = await executeToolCall('specly_status', args);
            expect(result).toBeDefined();
        });

        it('should initialize in-memory database when NODE_ENV=test', async () => {
            // Clear any injected instances
            resetDatabaseInstances();

            // Mock environment
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'test';

            try {
                const args = { workspace_path: testWorkspacePath };
                const result = await executeToolCall('specly_status', args);
                expect(result).toBeDefined();
            } finally {
                process.env.NODE_ENV = originalEnv;
            }
        });

        it('should initialize in-memory database when VITEST=true', async () => {
            // Clear any injected instances
            resetDatabaseInstances();

            // Mock environment
            const originalEnv = process.env.VITEST;
            process.env.VITEST = 'true';

            try {
                const args = { workspace_path: testWorkspacePath };
                const result = await executeToolCall('specly_status', args);
                expect(result).toBeDefined();
            } finally {
                process.env.VITEST = originalEnv;
            }
        });

        it('should use production database initialization when not in test environment', async () => {
            // Clear any injected instances
            resetDatabaseInstances();

            // Mock environment
            const originalEnv = { ...process.env };
            delete process.env.NODE_ENV;
            delete process.env.VITEST;

            try {
                const args = { workspace_path: testWorkspacePath };
                // This might fail in test environment due to missing global DB, but should exercise the code path
                const result = await executeToolCall('specly_status', args);
                expect(result).toBeDefined();
                expect(result.isError).toBe(true);
            } finally {
                process.env = originalEnv;
            }
        });
    });

    describe('Global unhandledRejection handler', () => {
        it('should exit process on unhandled rejection', async () => {
            const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            // Emit a fake unhandled rejection
            process.emit('unhandledRejection', new Error('boom'), Promise.resolve());

            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(errSpy).toHaveBeenCalled();

            exitSpy.mockRestore();
            errSpy.mockRestore();
        });
    });

    describe('Result Format Consistency', () => {
        it('should return consistent result format (single model)', async () => {
            const args = {
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('specly_start', args);
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
            const result = await executeToolCall('specly_start', args);
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
                const firstResult = await executeToolCall('specly_start', args);
                expect(firstResult).toBeDefined();

                // Second call should use existing workspace
                const secondResult = await executeToolCall('specly_start', args);
                expect(secondResult).toBeDefined();
            } finally {
                if (fs.existsSync(uniqueWorkspace)) {
                    fs.rmSync(uniqueWorkspace, { recursive: true, force: true });
                }
            }
        }, 15000);
    });

    describe('Main function argument validation', () => {
        let exitSpy: any;
        let originalArgv: string[];

        beforeEach(() => {
            exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
            originalArgv = process.argv;
        });

        afterEach(() => {
            exitSpy.mockRestore();
            process.argv = originalArgv;
        });

        it('should show usage and exit when no arguments provided', async () => {
            // Mock process.argv to have no arguments
            process.argv = ['node', 'cli.js'];

            const { main } = await import('../cli.js');

            await expect(main()).rejects.toThrow('process.exit called with code 1');

            expect(consoleErrorSpy).toHaveBeenCalledWith('Usage: npm run test:tool -- <toolName> [arguments]');
            expect(consoleErrorSpy).toHaveBeenCalledWith('Example: npm run test:tool -- specly_start \'{"workspace_path": "/tmp/test-workspace"}\'');
            expect(consoleErrorSpy).toHaveBeenCalledWith('');
            expect(consoleErrorSpy).toHaveBeenCalledWith('Available tools:');
            expect(consoleErrorSpy).toHaveBeenCalledWith('  specly_init');
            expect(consoleErrorSpy).toHaveBeenCalledWith('  specly_start');
            expect(consoleErrorSpy).toHaveBeenCalledWith('  specly_add');
            expect(consoleErrorSpy).toHaveBeenCalledWith('  specly_status');
            expect(consoleErrorSpy).toHaveBeenCalledWith('  specly_update');
            expect(consoleErrorSpy).toHaveBeenCalledWith('  specly_audit');
            expect(consoleErrorSpy).toHaveBeenCalledWith('  specly_focus');
            expect(consoleErrorSpy).toHaveBeenCalledWith('  specly_github');
            expect(consoleErrorSpy).toHaveBeenCalledWith('  specly_rule_update');
            expect(consoleErrorSpy).toHaveBeenCalledWith('  specly_remote_interface');
        });
    });

    describe('CLI Argument Edge Cases', () => {
        it('should handle empty string arguments', async () => {
            const args = {
                task_description: '',
                workspace_path: testWorkspacePath
            };

            // Should handle empty string gracefully
            const result = await executeToolCall('specly_add', args);
            expect(result).toBeDefined();
        }, 10000);

        it('should handle very long arguments', async () => {
            const longDescription = 'A'.repeat(10000); // 10KB string
            const args = {
                task_description: longDescription,
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('specly_add', args);
            expect(result).toBeDefined();
        }, 15000);

        it('should handle special characters in arguments', async () => {
            const specialChars = 'Test with special chars: !@#$%^&*()[]{}|;:,.<>?';
            const args = {
                task_description: specialChars,
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('specly_add', args);
            expect(result).toBeDefined();
        }, 10000);
    });

    describe('Additional Tool Coverage', () => {
        it('should execute specly_update', async () => {
            const args = {
                workspace_path: testWorkspacePath,
                task_id: 'SP-001',
                field: 'status' as const,
                value: 'in_progress'
            };

            const result = await executeToolCall('specly_update', args);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        }, 10000);

        it('should execute specly_audit', async () => {
            const args = {
                workspace_path: testWorkspacePath
            };

            const result = await executeToolCall('specly_audit', args);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        }, 10000);

        it('should execute specly_github', async () => {
            const args = {
                workspace_path: testWorkspacePath,
                action: 'create_issue' as const,
                title: 'Test Issue',
                description: 'Test Description'
            };

            const result = await executeToolCall('specly_github', args);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        }, 10000);

        it('should execute specly_rule_update', async () => {
            const args = {
                workspace_path: testWorkspacePath,
                rule_type: 'coding' as const,
                action: 'add' as const,
                rule_content: 'Test rule content'
            };

            const result = await executeToolCall('specly_rule_update', args);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        }, 10000);

        it('should execute specly_remote_interface', async () => {
            const args = {
                workspace_path: testWorkspacePath,
                action: 'configure' as const,
                interface_type: 'custom' as const,
                endpoint_url: 'https://api.example.com'
            };

            const result = await executeToolCall('specly_remote_interface', args);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        }, 10000);

        it('should execute specly_focus', async () => {
            const args = {
                workspace_path: testWorkspacePath,
                task_id: 'SP-001'
            };

            const result = await executeToolCall('specly_focus', args);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        }, 10000);
    });
});

describe('CLI main function', () => {
    let originalArgv: string[];
    let originalExit: typeof process.exit;
    let originalConsoleLog: typeof console.log;
    let originalConsoleError: typeof console.error;
    let consoleLogSpy: any;
    let consoleErrorSpy: any;

    beforeEach(() => {
        originalArgv = process.argv;
        originalExit = process.exit;
        process.exit = vi.fn() as any;

        // Mock console methods
        originalConsoleLog = console.log;
        originalConsoleError = console.error;
        consoleLogSpy = vi.fn();
        consoleErrorSpy = vi.fn();
        console.log = consoleLogSpy;
        console.error = consoleErrorSpy;
    });

    afterEach(() => {
        process.argv = originalArgv;
        process.exit = originalExit;

        // Restore console methods
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    });

    it('should show usage when no args provided', async () => {
        process.argv = ['node', 'cli.js'];

        await expect(main()).rejects.toThrow('process.exit called with code 1');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Usage: npm run test:tool -- <toolName> [arguments]');
    });

    it('should execute tool successfully', async () => {
        process.argv = ['node', 'cli.js', 'specly_init', '{"project_requirements": "test"}'];

        await expect(main()).rejects.toThrow('process.exit called with code 1'); // because it calls process.exit
        expect(consoleLogSpy).toHaveBeenCalledWith('🧪 Testing tool: specly_init');
    });

    it('should handle invalid tool name', async () => {
        process.argv = ['node', 'cli.js', 'invalid_tool'];

        await expect(main()).rejects.toThrow('process.exit called with code 1');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', 'Unknown tool: invalid_tool. Available tools: specly_init, specly_start, specly_add, specly_status, specly_update, specly_audit, specly_focus, specly_github, specly_rule_update, specly_remote_interface, specly_update_resources, specly_update_steps');
    });

    it('should handle tool execution error', async () => {
        process.argv = ['node', 'cli.js', 'specly_init', '{"invalid": "args"}'];

        await expect(main()).rejects.toThrow('process.exit called with code 1');
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/^💥 Tool call failed \(\d+ms\)$/));
    });

    it('should handle tool that returns error result', async () => {
        const mockExec = vi.fn().mockResolvedValue({
            isError: true,
            content: [{ type: 'text', text: 'Tool error message' }]
        });

        process.argv = ['node', 'cli.js', 'specly_start', '{"workspace_path": "/tmp"}'];

        await expect(runCli('specly_start', { workspace_path: '/tmp' }, { executeOverride: mockExec })).rejects.toThrow('process.exit called with code 1');
        expect(consoleLogSpy).toHaveBeenCalledWith('⚠️  Tool returned error result:');
        expect(consoleLogSpy).toHaveBeenCalledWith('Tool error message');

        mockExec.mockRestore?.();
    });

    it('should handle CLI test failure with non-Error exception', async () => {
        const mockExec = vi.fn().mockRejectedValue('String error');

        process.argv = ['node', 'cli.js', 'specly_start', '{"workspace_path": "/tmp"}'];

        await expect(runCli('specly_start', { workspace_path: '/tmp' }, { executeOverride: mockExec })).rejects.toThrow('process.exit called with code 1');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', 'String error');

        mockExec.mockRestore?.();
    });
});
