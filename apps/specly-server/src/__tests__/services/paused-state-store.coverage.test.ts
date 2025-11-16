import { describe, it, expect } from 'vitest';

describe('InMemoryPausedStateStore', () => {
  it('save/get/delete lifecycle', async () => {
    const { InMemoryPausedStateStore } = await import('../../services/paused-state-store.js');
    const store = new InMemoryPausedStateStore();
    const token = 't1';
    const state = { plan: { steps: [] }, currentIndex: 0, executed: [], results: {}, warnings: [], awaitingSpec: '', sessionContext: {} } as any;
    await store.save(token, state);
    const got = await store.get(token);
    expect(got).toBeDefined();
    await store.delete(token);
    const after = await store.get(token);
    expect(after).toBeUndefined();
  });
});
