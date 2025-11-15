import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('SpecEngine basics', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('NoopAutonomousExecutor returns ok payload', async () => {
    const mod = await import('../services/spec-engine.js')
    const exec = new mod.NoopAutonomousExecutor()
    const out = await exec.execute('hash1')
    expect(out).toEqual({ ok: true, spec: 'hash1' })
  })

  it('BasicExecutionPlanner builds plan and warns about unreachable nodes', async () => {
    const mod = await import('../services/spec-engine.js')
    const planner = new mod.BasicExecutionPlanner()
    const graph = {
      entry: 'a',
      nodes: {
        a: { hash: 'a', intent: 'autonomous', sideEffect: false },
        b: { hash: 'b', intent: 'autonomous', sideEffect: false },
        c: { hash: 'c', intent: 'autonomous', sideEffect: false }
      },
      edges: [ { from: 'a', to: 'b' } ]
    }
    const plan = planner.buildPlan(graph as any)
    expect(plan.steps.map(s => s.specHash)).toContain('a')
    expect(plan.warnings.some(w => w.includes('Unreachable'))).toBe(true)
  })

  it('SpecEngine.run executes autonomous node to completion and returns executed list', async () => {
    // Mock validation to be noop so import works even if validator missing
    vi.mock('../utils/graph-validate.js', () => ({ validateToolGraph: () => {}, GraphValidationError: class extends Error {} }))
    const mod = await import('../services/spec-engine.js')
    const engine = new mod.SpecEngine({ executor: new mod.NoopAutonomousExecutor() })

    const graph = { entry: 's1', nodes: { s1: { hash: 's1', intent: 'autonomous', sideEffect: false } }, edges: [] }
    const res = await engine.run(graph as any)
    expect(res.status).toBe('completed')
    expect(res.executed).toEqual(['s1'])
  })

  it('SpecEngine.run pauses on human intent and returns awaiting_input', async () => {
    vi.mock('../utils/graph-validate.js', () => ({ validateToolGraph: () => {}, GraphValidationError: class extends Error {} }))
    const mod = await import('../services/spec-engine.js')
    const engine = new mod.SpecEngine({ executor: new mod.NoopAutonomousExecutor() })
    const graph = { entry: 'h1', nodes: { h1: { hash: 'h1', intent: 'human', sideEffect: false } }, edges: [] }
    const res = await engine.run(graph as any)
    expect(res.status).toBe('awaiting_input')
    expect(res.awaitingSpec).toBe('h1')
  })
})
