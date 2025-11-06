import { describe, it, expect } from 'vitest';

describe('database schema index re-exports', () => {
  it('re-exports GlobalSchema, WorkspaceSchema and Relations', async () => {
    const mod = await import('../database/schema/index.js');
    expect(mod.GlobalSchema).toBeDefined();
    expect(mod.WorkspaceSchema).toBeDefined();
    expect(mod.Relations).toBeDefined();
  });
});
