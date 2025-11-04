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
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let argvBackup: string[];

  beforeEach(() => {
    argvBackup = [...process.argv];
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    process.argv = argvBackup;
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('prints usage and exits when no args provided', async () => {
    await withEnv({ NODE_ENV: 'development', VITEST: undefined }, async () => {
      process.argv = ['node', 'cli'];
      vi.resetModules();
      await import('../cli.js');
      expect(exitSpy).toHaveBeenCalledWith(1);
      // usage lines should have been printed
      expect(logSpy).toHaveBeenCalled();
    });
  });

  it('exits with error on invalid JSON args', async () => {
    await withEnv({ NODE_ENV: 'development', VITEST: undefined }, async () => {
      process.argv = ['node', 'cli', 'specly_status', '{invalid-json'];
      vi.resetModules();
      await import('../cli.js');
      expect(exitSpy).toHaveBeenCalledWith(1);
      // error should be printed
      expect(errSpy).toHaveBeenCalled();
    });
  });

  it('executes a tool without exiting on success', async () => {
    await withEnv({ NODE_ENV: 'development', VITEST: undefined }, async () => {
      // Provide a workspace path; status tool will handle non-existent gracefully
      const fakeWs = '/tmp/specly-cli-main-test';
      process.argv = ['node', 'cli', 'specly_status', JSON.stringify({ workspace_path: fakeWs })];
      vi.resetModules();
      await import('../cli.js');
      // success path should not call process.exit
      expect(exitSpy).not.toHaveBeenCalled();
      // some output expected
      expect(logSpy).toHaveBeenCalled();
    });
  });
});
