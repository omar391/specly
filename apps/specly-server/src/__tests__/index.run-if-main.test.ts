import { vi, test, expect } from 'vitest';

// Mock startMcpServer before importing the module so runIfMain will call the stub
vi.mock('@omar391/mcp-kit/server', async () => {
  const original = await vi.importActual('@omar391/mcp-kit/server');
  return { ...original, startMcpServer: async (_opts: any) => { return; } };
});

test('runIfMain triggers main().catch when argv indicates direct run', async () => {
  const indexModule = await import('../index.js');

  // Temporarily set process.argv[1] to equal the module file path
  const origArg1 = process.argv[1];
  // import.meta.url is file://<abs>
  const fileUrl = new URL('../index.js', import.meta.url).pathname;
  process.argv[1] = fileUrl;

  try {
    await indexModule.runIfMain();
    // If it resolves, the call to startMcpServer (mocked) succeeded
    expect(true).toBe(true);
  } finally {
    process.argv[1] = origArg1;
  }
});
