import { describe, it, expect, vi } from 'vitest'

// Import middleware error classes to create instances inside mocks
import * as mw from '../api/middleware.js'

// Mock controllers to throw specific errors so router.onError mapping is exercised
vi.mock('../api/rules.js', () => ({
  RulesController: class {
    async initialize() {}
    async createRule() { throw new mw.BadRequestError('bad request') }
    async getRules() { throw new mw.ValidationError('invalid') }
  }
}))

vi.mock('../api/workspaces.js', () => ({
  WorkspacesController: class {
    async getWorkspaces() { throw new mw.NotFoundError('no workspaces') }
  }
}))

describe('createApiRouter error handling', () => {
  it('maps BadRequestError to 400', async () => {
    const { createApiRouter } = await import('../api/router.js')
    const fakeDb = { getGlobal: () => ({}) }
    const app = await createApiRouter(fakeDb as any)

    const req = new Request('http://localhost/rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  it('maps ValidationError to 422', async () => {
    const { createApiRouter } = await import('../api/router.js')
    const fakeDb = { getGlobal: () => ({}) }
    const app = await createApiRouter(fakeDb as any)

    const req = new Request('http://localhost/rules', { method: 'GET' })
    const res = await app.fetch(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('maps NotFoundError to 404', async () => {
    const { createApiRouter } = await import('../api/router.js')
    const fakeDb = { getGlobal: () => ({}) }
    const app = await createApiRouter(fakeDb as any)

    const req = new Request('http://localhost/workspaces', { method: 'GET' })
    const res = await app.fetch(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
