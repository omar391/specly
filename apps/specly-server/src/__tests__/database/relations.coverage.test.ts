import { describe, it, expect } from 'vitest';

describe('schema relations', () => {
  it('exports workspace and session relations', async () => {
    const mod = await import('../../database/schema/relations.js');
    expect(mod.workspaceRelations).toBeDefined();
    expect(mod.sessionRelations).toBeDefined();
  });
});
