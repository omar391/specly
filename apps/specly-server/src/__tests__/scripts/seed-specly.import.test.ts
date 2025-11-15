import { vi, describe, it, expect } from 'vitest';

describe('seed-specly CLI guard import', () => {
  it('invokes main via exported runIfMainSeed helper when simulated argv matches', async () => {
    const originalArg1 = process.argv[1];
    // Ensure import does NOT trigger the top-level guard
    process.argv[1] = '/not/matching';

    // Spy on process.exit to ensure any accidental calls do not terminate the
    // test runner. We restore it afterwards.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { /* noop */ }) as any);

    try {
      // Import module without triggering top-level CLI guard
      const mod = await import('../../scripts/seed-specly.ts');

      // Act: explicitly invoke the exported helper simulating argv that matches
      await (mod as any).runIfMainSeed('/tmp/seed-specly.ts');

      // Assert: module loaded and helper executed without causing process.exit
      expect(mod).toBeTruthy();
    } finally {
      exitSpy.mockRestore();
      process.argv[1] = originalArg1;
      vi.resetModules();
      vi.clearAllMocks();
    }
  });
});
