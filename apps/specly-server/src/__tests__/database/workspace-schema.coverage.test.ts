import { describe, it, expect } from 'vitest';

describe('workspace schema exports', () => {
  it('exports tables and types', async () => {
    const mod = await import('../../database/schema/workspace-schema.js');
    // Access a few runtime exports to ensure module statements execute
    expect(mod.tasks).toBeDefined();
    expect(mod.githubConfigs).toBeDefined();
    expect(mod.remoteInterfaces).toBeDefined();
    expect(mod.taskDependencies).toBeDefined();
    expect(mod.sessions).toBeDefined();
  });
});
