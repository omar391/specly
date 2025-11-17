import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../tools/init.js', () => ({}));

import { runCli, throwUnhandledTool, main } from '../../cli.js';

describe('cli run helpers', () => {
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throwUnhandledTool throws with correct message', () => {
    expect(() => throwUnhandledTool('specly_update_resources')).toThrow(/Unhandled tool: specly_update_resources/);
  });

  it('runCli succeeds when execute override returns non-error result', async () => {
    const fakeResult = { isError: false, content: { ok: true } };
    await expect(runCli('specly_init', {}, { executeOverride: async () => fakeResult })).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
  });

  it('runCli prints array content items', async () => {
    const fakeResult = { isError: false, content: [{ type: 'text', text: 'line1' }, { type: 'json', data: 2 }] };
    await expect(runCli('specly_init', {}, { executeOverride: async () => fakeResult })).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
  });

  it('runCli fails when execute override throws', async () => {
    const exec = async () => { throw new Error('boom'); };
    await expect(runCli('specly_init', {}, { executeOverride: exec as any })).rejects.toThrow('process.exit called with code 1');
  });

  it('main throws when no args provided', async () => {
    const oldArgv = process.argv;
    process.argv = ['node', 'cli'];
    await expect(main()).rejects.toThrow('process.exit called with code 1');
    process.argv = oldArgv;
  });
});
