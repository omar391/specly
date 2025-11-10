import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// NOTE: This suite intentionally does NOT import from '../cli.js' at top-level.
// Each test resets the module cache and dynamically imports to trigger the
// main() guard under controlled environment variables.

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete (process.env as any)[k]; else process.env[k] = v;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete (process.env as any)[k]; else process.env[k] = v;
    }
  });
}

describe('CLI main() entrypoint behavior', () => {
  let exitSpy: any;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let argvBackup: string[];

  beforeEach(() => {
    argvBackup = [...process.argv];
    // Mock process.exit to prevent actual process termination
    // process.exit returns never, so we throw to simulate the behavior without exiting
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit called with code ${code}`);
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    // Ensure no lingering unhandledRejection listeners from previous imports
    process.removeAllListeners('unhandledRejection');
  });

  afterEach(() => {
    process.argv = argvBackup;
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.removeAllListeners('unhandledRejection');
  });

  it('prints usage and exits when no args provided', async () => {
    await withEnv({ NODE_ENV: 'development', VITEST: undefined }, async () => {
      process.argv = ['node', 'cli'];
      vi.resetModules();
      const { main } = await import('../cli.js');
      await expect(main()).rejects.toThrow('process.exit called with code 1');
      expect(exitSpy).toHaveBeenCalledWith(1);
      // usage lines are printed to stderr
      expect(errSpy).toHaveBeenCalled();
    });
  });

  it('exits with error on invalid JSON args', async () => {
    await withEnv({ NODE_ENV: 'development', VITEST: undefined }, async () => {
      process.argv = ['node', 'cli', 'specly_status', '{invalid-json'];
      vi.resetModules();
      const { main } = await import('../cli.js');
      await expect(main()).rejects.toThrow('Expected property name or \'}\' in JSON');
      expect(exitSpy).toHaveBeenCalledWith(1);
      // error should be printed
      expect(errSpy).toHaveBeenCalled();
    });
  });

  it('executes a tool without exiting on success', async () => {
    await withEnv({ NODE_ENV: 'development', VITEST: undefined }, async () => {
      // Use init tool which succeeds without requiring pre-existing workspace
      const fakeWs = '/tmp/specly-cli-main-test';
      process.argv = ['node', 'cli', 'specly_init', JSON.stringify({ workspace_path: fakeWs, project_requirements: 'test' })];
      vi.resetModules();
      const { main } = await import('../cli.js');
      // Success should not throw (no process.exit call)
      await expect(main()).resolves.toBeUndefined();
      // success path should not call process.exit
      expect(exitSpy).not.toHaveBeenCalled();
      // some output expected
      expect(logSpy).toHaveBeenCalled();
    });
  });
});
