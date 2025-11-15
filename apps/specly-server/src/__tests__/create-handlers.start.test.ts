import { test, expect } from 'vitest';
import { SpeclyServer } from '../index.js';
import { ToolNames } from '../constants/tool-names.js';

test('createMCPToolHandlers START exec calls startTool.execute', async () => {
  const server = new SpeclyServer();
  // stub startTool with an execute that returns a known value
  (server as any).startTool = { execute: async (input: any) => ({ ok: true, input }) };

  const handlers = server.createMCPToolHandlers();

  const res = await (handlers as any).handleToolCall(ToolNames.START, { workspace_path: '/tmp/ws' });
  expect(res).toHaveProperty('ok', true);
  expect(res.input).toHaveProperty('workspace_path', '/tmp/ws');
});
