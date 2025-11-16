import { vi, describe, it, expect } from 'vitest';

// This test ensures the module-level "runIfMain" guard is exercised during import.
describe('index.ts import run-if-main guard', () => {
  it('calls startMcpServer when argv[1] endsWith dist/index.js', async () => {
    // Arrange: make Node think the script was invoked as a bundled dist file
    const originalArg1 = process.argv[1];
    process.argv[1] = '/tmp/some/path/dist/index.js';

    // Mock startMcpServer before importing the module so main() uses the stub.
    const startMock = vi.fn(() => Promise.resolve());
    const createHandlersMock = () => ({ listTools: async () => ({ tools: [] }), handleToolCall: async () => ({}) });

    vi.doMock('@omar391/mcp-kit/server', () => ({
      startMcpServer: startMock,
      createToolHandlers: createHandlersMock,
      // Export anything else the module expects minimally
      startToolSchema: {},
    }));

    // Also mock the InstanceManager class used by buildStartOptions
    vi.doMock('@omar391/mcp-kit/server/local/node-instance', () => ({
      InstanceManager: class {
        constructor() {}
      }
    }));

    try {
      // Import runIfMain and call it directly
      const { runIfMain } = await import('../index.ts');

      // Act: call runIfMain directly; it will run the guard and call startMcpServer (mocked)
      await runIfMain();

      // Assert: our mocked startMcpServer was invoked
      expect(startMock).toHaveBeenCalled();
    } finally {
      // Cleanup: restore argv and clear module mocks
      process.argv[1] = originalArg1;
      vi.resetModules();
      vi.clearAllMocks();
    }
  });
});
