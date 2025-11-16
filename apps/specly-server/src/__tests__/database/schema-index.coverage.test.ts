import { describe, it, expect } from 'vitest';

describe('database schema index re-exports', () => {
  it('re-exports namespaces', async () => {
    const idx = await import('../../database/schema/index.js');
    expect(idx.GlobalSchema).toBeDefined();
    expect(idx.WorkspaceSchema).toBeDefined();
    expect(idx.Relations).toBeDefined();
  });
});
