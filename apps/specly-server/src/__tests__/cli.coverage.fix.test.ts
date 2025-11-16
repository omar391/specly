import { describe, it, expect, vi } from 'vitest';
import { executeToolCall, runCli, throwUnhandledTool } from '../cli.js';
import * as toolNames from '../constants/tool-names.js';

describe('cli coverage quickfix', () => {
  it('executeToolCall throws for unknown tool name', async () => {
    await expect(executeToolCall('this_tool_does_not_exist' as any, {})).rejects.toThrow('Unknown tool: this_tool_does_not_exist');
  });

  it('runCli propagates error when execute returns error result', async () => {
    const mockExec = vi.fn().mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'failure' }] });

    await expect(runCli('specly_start', { workspace_path: '/tmp' }, { executeOverride: mockExec as any })).rejects.toThrow('process.exit called with code 1');
    expect(mockExec).toHaveBeenCalled();
  });

  it('executeToolCall hits default case for unhandled tool', async () => {
    const validateSpy = vi.spyOn(toolNames, 'validateToolName').mockImplementation(() => {});
    const throwSpy = vi.spyOn({ throwUnhandledTool }, 'throwUnhandledTool');

    try {
      await expect(executeToolCall('fake_tool' as any, {})).rejects.toThrow('Unknown tool: fake_tool');
      expect(throwSpy).not.toHaveBeenCalled();
    } finally {
      validateSpy.mockRestore();
      throwSpy.mockRestore();
    }
  });
});
