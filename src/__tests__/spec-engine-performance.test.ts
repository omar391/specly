/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { SpecEngine, ToolGraph } from '../services/spec-engine.js';

/**
 * SP-005 Phase 8: Large plan performance smoke test.
 * Ensures linear (O(n)) behavior for 1k autonomous specs.
 * Not a micro-benchmark; just asserts runtime under a generous threshold
 * and that all specs executed exactly once in deterministic order.
 */

describe('SpecEngine performance (SP-005 Phase 8)', () => {
  const SPEC_COUNT = 1000; // target large plan size

  function buildLinearGraph(n: number): ToolGraph {
    const nodes: ToolGraph['nodes'] = {};
    const edges: ToolGraph['edges'] = [];
    for (let i = 0; i < n; i++) {
      const hash = `spec_${i}`;
      nodes[hash] = { hash, intent: 'autonomous', sideEffect: false };
      if (i > 0) {
        edges.push({ from: `spec_${i-1}`, to: hash, priority: 100 });
      }
    }
    return { entry: 'spec_0', nodes, edges };
  }

  it('executes 1000 spec linear plan within time & count constraints', async () => {
    const engine = new SpecEngine();
    const graph = buildLinearGraph(SPEC_COUNT);
    const start = Date.now();
    const result = await engine.run(graph);
    const duration = Date.now() - start;

    expect(result.status).toBe('completed');
    expect(result.executed.length).toBe(SPEC_COUNT);
    expect(result.executed[0]).toBe('spec_0');
    expect(result.executed[SPEC_COUNT-1]).toBe(`spec_${SPEC_COUNT-1}`);

    const unique = new Set(result.executed);
    expect(unique.size).toBe(SPEC_COUNT);

    expect(duration).toBeLessThan(2500);
  });
});
