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
    expect(() => planner.buildPlan(graph)).toThrow('Cycle detected in tool graph');
  });

  it('warns about unreachable nodes', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C') },
      edges: [{ from: 'A', to: 'B' }] // C unreachable
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A', 'B']);
    expect(plan.warnings).toContain('Unreachable spec node: C');
  });

  it('warns about edges to missing nodes', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B') },
      edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }] // C missing
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A', 'B']);
    expect(plan.warnings).toContain('Edge references missing node: B -> C');
  });

  it('handles null priorities in edges', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C') },
      edges: [
        { from: 'A', to: 'B', priority: 50 },
        { from: 'A', to: 'C' } // null priority
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A', 'C', 'B']); // C has 100, B has 50
  });

  it('sorts by priority descending', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D') },
      edges: [
        { from: 'A', to: 'B', priority: 10 },
        { from: 'A', to: 'C', priority: 50 },
        { from: 'A', to: 'D', priority: 30 }
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A', 'C', 'D', 'B']); // C 50, D 30, B 10
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

  it('handles unreachable nodes in ordering phase', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), X: makeNode('X'), Y: makeNode('Y') },
      edges: [
        { from: 'A', to: 'B', priority: 100 },
        { from: 'B', to: 'C', priority: 100 },
        { from: 'X', to: 'Y', priority: 100 } // unreachable subgraph
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','B','C']);
    expect(plan.warnings).toContain('Unreachable spec node: X');
    expect(plan.warnings).toContain('Unreachable spec node: Y');
  });

  it('handles complex cycle detection with unreachable components', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D'), X: makeNode('X') },
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'A' }, // cycle in reachable part
        { from: 'X', to: 'X' }  // self-cycle in unreachable part
      ]
    };
    const planner = new BasicExecutionPlanner();
    expect(() => planner.buildPlan(graph)).toThrow(/Cycle detected/);
  });

  it('handles priority ordering with null priorities', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C') },
      edges: [
        { from: 'A', to: 'B', priority: 50 },
        { from: 'A', to: 'C' } // null priority defaults to 100
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    // C should come before B due to higher priority (100 > 50)
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','C','B']);
  });

  it('handles empty graph edge case', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A') },
      edges: []
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    expect(plan.steps.map(s => s.specHash)).toEqual(['A']);
    expect(plan.warnings.length).toBe(0);
  });

  it('exercises priority ordering with multiple incoming edges', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D') },
      edges: [
        { from: 'A', to: 'D', priority: 10 },
        { from: 'B', to: 'D', priority: 50 }, // Higher priority incoming edge
        { from: 'C', to: 'D', priority: 30 },
        { from: 'D', to: 'A', priority: 100 } // This creates a cycle, but should still exercise priority logic
      ]
    };
    const planner = new BasicExecutionPlanner();
    expect(() => planner.buildPlan(graph)).toThrow(/Cycle detected/);
  });

  it('handles complex priority ordering with mixed priorities', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D'), E: makeNode('E') },
      edges: [
        { from: 'A', to: 'B', priority: 100 },
        { from: 'A', to: 'C', priority: 100 },
        { from: 'B', to: 'D', priority: 50 },
        { from: 'C', to: 'D', priority: 80 }, // C->D has higher priority than B->D
        { from: 'D', to: 'E', priority: 100 }
      ]
    };
    const planner = new BasicExecutionPlanner();
    const plan = planner.buildPlan(graph);
    // A first, then B and C (same priority), then D, then E
    expect(plan.steps.map(s => s.specHash)).toEqual(['A','B','C','D','E']);
  });

  it('detects cycle with unreachable nodes due to complex cycle structure', () => {
    const graph: ToolGraph = {
      entry: 'A',
      nodes: { A: makeNode('A'), B: makeNode('B'), C: makeNode('C'), D: makeNode('D') },
      edges: [
        { from: 'A', to: 'B', priority: 100 },
        { from: 'B', to: 'C', priority: 100 },
        { from: 'C', to: 'B', priority: 100 }, // Creates cycle B->C->B
        { from: 'C', to: 'D', priority: 100 }  // D is reachable but cycle prevents processing
      ]
    };
    const planner = new BasicExecutionPlanner();
    expect(() => planner.buildPlan(graph)).toThrow(/Cycle detected/);
  });
});
