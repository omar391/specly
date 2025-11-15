import { vi, test, expect } from 'vitest';

// Mock the cli-parser import so parseCliArgs throws when the module is evaluated
vi.mock('@omar391/mcp-kit/utils/cli-parser', () => ({ parseCliArgs: () => { throw new Error('parse'); } }));

test('handleMainError logs when parseCliArgs fails and not stdio', async () => {
  const indexModule = await import('../index.js');
  const err = new Error('boom');

  const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  try {
    await indexModule.handleMainError(err);
    expect(logSpy).toHaveBeenCalledWith(err);
  } finally {
    logSpy.mockRestore();
  }
});
