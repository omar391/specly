import { describe, it, expect } from 'vitest';
import { BasicExecutionPlanner, ToolGraph } from '../services/spec-engine.js';

function makeNode(hash: string, intent: 'human' | 'autonomous' = 'autonomous') {
  return { hash, intent, sideEffect: false };
}

describe('SpecEngine BasicExecutionPlanner (SP-005)', () => {
  it('produces linear ordering for simple chain', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: {
        A: makeNode('A'),
        B: makeNode('B'),
        C: makeNode('C', 'human')
      },
      edges: [
        { from: 'A', to: 'B', priority: 100 },
        { from: 'B', to: 'C', priority: 100 }
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','B','C']);
    expect(plan.steps[2].awaitingHuman).toBe(true);
    expect(plan.warnings.length).toBe(0);
  });

  it('orders branches by priority desc then hash', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D') },
      edges: [
        { from: 'A', to: 'B', priority: 50 },
        { from: 'A', to: 'C', priority: 80 },
        { from: 'A', to: 'D', priority: 80 }
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    // A first, then C and D (same priority sorted lexicographically), then B
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','C','D','B']);
  });

  it('throws on cycle', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B') },
      edges: [ { from: 'A', to: 'B' }, { from: 'B', to: 'A' } ]
    };
    const planner = new BasicExecutionPlanner();
    expect(() => planner.buildPlan(graph)).toThrow(/Cycle detected/);
  });

  it('warns on unreachable node', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), X: makeNode('X') },
      edges: [ { from: 'A', to: 'B' } ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','B']);
    expect(plan.warnings.some(w => w.includes('Unreachable'))).toBe(true);
  });
});
