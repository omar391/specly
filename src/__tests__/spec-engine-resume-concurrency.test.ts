import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph, SpecEngineErrorCode } from '../services/spec-engine.js';

/**
 * SP-005 Phase 8 (analysis): Concurrency / stale resume token behavior.
 * Current engine implementation generates resumeToken using timestamp and does NOT
 * persist paused state nor invalidate prior tokens once a resume occurs. This makes
 * it impossible to detect a second (late) resume attempt racing with a first successful resume.
 *
 * This test documents current behavior (second resume still succeeds if applied sequentially)
 * and marks expectations for future enhancement (when paused state persistence + token versioning arrive).
 */

describe('SpecEngine resume concurrency (token invalidation)', () => {
    it('rejects second resume with same token after first consumption', async () => {
    const graph: ToolGraph = {
      entry: 'h1',
      nodes: {
        h1: { hash: 'h1', intent: 'human', sideEffect: false },
        a2: { hash: 'a2', intent: 'autonomous', sideEffect: false },
        a3: { hash: 'a3', intent: 'autonomous', sideEffect: false }
      },
      edges: [
        { from: 'h1', to: 'a2', priority: 100 },
        { from: 'a2', to: 'a3', priority: 100 }
      ]
    };

    const engine = new SpecEngine();
    const firstRun = await engine.run(graph); // should pause at h1
    expect(firstRun.status).toBe('awaiting_input');
      const token = firstRun.resumeToken!;

  // First resume
      const resumed1 = await engine.resume(graph, { ...firstRun, plan: { steps: [{ specHash: 'h1', awaitingHuman: true }, { specHash: 'a2', awaitingHuman: false }, { specHash: 'a3', awaitingHuman: false }], warnings: firstRun.warnings }, currentIndex: 0, awaitingSpec: 'h1', sessionContext: {} }, { specHash: 'h1', humanOutput: { ok: true }, resumeToken: token });
    expect(resumed1.status).toBe('completed');

    // Second resume attempt with SAME token (simulated duplicate client submit)
    // Current engine has no stale detection: it will re-run autonomous specs again.
    // Accept this for now; future behavior should surface RESUME_TOKEN_INVALID.
    
      const resumed2 = await engine.resume(graph, { ...firstRun, plan: { steps: [{ specHash: 'h1', awaitingHuman: true }, { specHash: 'a2', awaitingHuman: false }, { specHash: 'a3', awaitingHuman: false }], warnings: firstRun.warnings }, currentIndex: 0, awaitingSpec: 'h1', sessionContext: {} }, { specHash: 'h1', humanOutput: { ok: true, dup: true }, resumeToken: token });
      expect(resumed2.status).toBe('error');
      expect(resumed2.errorCode).toBe(SpecEngineErrorCode.RESUME_TOKEN_INVALID);
  });
});
