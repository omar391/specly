import { describe, it, expect, vi } from 'vitest';

describe('exit-helper', () => {
  it('calls process.exit with provided code', async () => {
    const orig = process.exit;
    const calls: any[] = [];
    // Replace process.exit so we don't terminate the test process
    process.exit = ((code?: number) => { calls.push(code); }) as any;
    try {
      const { exitProcess } = await import('../../scripts/exit-helper.js');
      exitProcess(42);
      expect(calls).toContain(42);
    } finally {
      process.exit = orig;
    }
  });
});
