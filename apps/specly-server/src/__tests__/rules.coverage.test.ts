import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RulesController } from '../api/rules.js'

class FakeRulesRepo {
  addOrReinforce = vi.fn()
  list = vi.fn()
}

class FakeGlobalDb {
  initialize = vi.fn()
}

describe('RulesController', () => {
  let repo: FakeRulesRepo
  let gdb: FakeGlobalDb
  let controller: RulesController

  beforeEach(() => {
    vi.restoreAllMocks()
    repo = new FakeRulesRepo()
    gdb = new FakeGlobalDb()
    // construct controller with a fake global DB but hook in our repo instance by replacing the repository after construction
    controller = new RulesController(gdb as any)
    ;(controller as any).rulesRepo = repo
  })

  it('createRule returns 201 when created and uses repo', async () => {
    repo.addOrReinforce.mockResolvedValueOnce({ id: 'r1', created: true, confidence: 0.8 })

    const ctx = {
      req: { json: async () => ({ workspace_id: 'w1', relation: 'always-do', rule: 'do X' }) },
      json: (payload: any, status: number) => ({ payload, status })
    } as any

    const res = await controller.createRule(ctx as any)
    expect(res.status).toBe(201)
    expect(res.payload.id).toBe('r1')
  })

  it('createRule returns 400 for invalid input', async () => {
    const ctx = {
      req: { json: async () => ({ workspace_id: 'w1', relation: 'always-do' /* missing rule */ }) },
      json: (payload: any, status: number) => ({ payload, status })
    } as any

    const res = await controller.createRule(ctx as any)
    expect(res.status).toBe(400)
    expect(res.payload.error.code).toBe('VALIDATION_ERROR')
  })

  it('getRules returns 400 if workspace_id missing', async () => {
    const ctx = {
      req: { query: (k: string) => undefined },
      json: (payload: any, status: number) => ({ payload, status })
    } as any

    const res = await controller.getRules(ctx as any)
    expect(res.status).toBe(400)
    expect(res.payload.error.code).toBe('MISSING_WORKSPACE_ID')
  })

  it('getRules returns ordered rules', async () => {
    repo.list.mockResolvedValueOnce([
      { id: 'a', confidence: 0.5, lastReinforcedAt: '2022-01-02', createdAt: '2022-01-01' },
      { id: 'b', confidence: 0.9, lastReinforcedAt: '2022-01-01', createdAt: '2022-01-01' },
      { id: 'c', confidence: 0.5, lastReinforcedAt: '2022-01-03', createdAt: '2022-01-01' }
    ])

    const ctx = {
      req: { query: (k: string) => (k === 'workspace_id' ? 'w1' : 'true') },
      json: (payload: any, status: number) => ({ payload, status })
    } as any

    const res = await controller.getRules(ctx as any)
    expect(res.status).toBe(200)
    const ids = res.payload.rules.map((r: any) => r.id)
    // b has highest confidence, then among a/c same confidence c is more recent
    expect(ids).toEqual(['b', 'c', 'a'])
  })
})
