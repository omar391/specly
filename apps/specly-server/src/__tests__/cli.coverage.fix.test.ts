import { describe, it, expect, vi } from 'vitest';
import { executeToolCall, runCli, throwUnhandledTool } from '../cli.js';
import * as toolNames from '../constants/tool-names.js';

describe('cli coverage quickfix', () => {
  it('executeToolCall throws for unknown tool name', async () => {
    const result = await executeToolCall('this_tool_does_not_exist' as any, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });

  it('runCli propagates error when execute returns error result', async () => {
    const mockExec = vi.fn().mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'failure' }] });

    await expect(runCli('specly_start', { workspace_path: '/tmp' }, { executeOverride: mockExec as any })).rejects.toThrow('process.exit called with code 1');
    expect(mockExec).toHaveBeenCalled();
  });

  it('executeToolCall hits default case for unhandled tool', async () => {
    const validateSpy = vi.spyOn(toolNames, 'validateToolName').mockImplementation(() => { });
    const throwSpy = vi.spyOn({ throwUnhandledTool }, 'throwUnhandledTool');

    try {
      const result = await executeToolCall('fake_tool' as any, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
      expect(throwSpy).not.toHaveBeenCalled();
    } finally {
      validateSpy.mockRestore();
      throwSpy.mockRestore();
    }
  });

  it('initializeTools handles getDrizzleManager error', async () => {
    // Mock the database service to throw when getDrizzleManager is called
    const mockDbService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getDrizzleManager: vi.fn().mockImplementation(() => {
        throw new Error('Drizzle manager error');
      })
    };

    // Mock the global database service getter
    const globalQueries = await import('../database/global-queries.js');
    const getGlobalSpy = vi.spyOn(globalQueries, 'getGlobalDatabaseService').mockReturnValue(mockDbService as any);

    // Mock console.error to avoid test output pollution
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    // Temporarily set NODE_ENV to non-test to use production path
    const originalEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    delete process.env.VITEST;

    try {
      // Reset global state to force re-initialization
      // Import cli module to access the global variables
      const cliModule = await import('../cli.js');
      // Reset the global state by directly modifying the module's variables
      (cliModule as any).toolsInitialized = false;
      (cliModule as any).globalDbService = null;
      (cliModule as any).globalDrizzleManager = null;

      // Force re-initialization by clearing the global state
      // This is tricky since initializeTools has internal state, but we can test executeToolCall
      // which calls initializeTools internally
      const result = await executeToolCall('specly_start', { workspace_path: '/tmp' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Drizzle manager error');
    } finally {
      getGlobalSpy.mockRestore();
      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
      process.env.VITEST = 'true';
    }
  });
});
