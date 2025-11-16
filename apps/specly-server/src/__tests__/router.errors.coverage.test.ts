import { describe, it, expect, vi } from 'vitest'

// Import middleware error classes to create instances inside mocks
import * as mw from '../api/middleware.js'
import { createApiRouter } from '../api/router.js'

// Mock controllers to throw specific errors so router.onError mapping is exercised
vi.mock('../api/rules.js', () => ({
  RulesController: class {
    async initialize() {}
    async createRule() { throw new mw.BadRequestError('bad request') }
    async getRules() { throw new mw.ValidationError('invalid') }
  }
}))

vi.mock('../api/sessions.js', () => ({
  SessionsController: class {
    async getSessions() { throw new Error('unexpected error') }
  }
}))

describe('createApiRouter error handling', () => {
  let mockDatabaseService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDatabaseService = { getGlobal: () => ({}) };
  });
  it('maps BadRequestError to 400', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  it('maps ValidationError to 422', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/rules', { method: 'GET' })
    const res = await app.fetch(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('maps NotFoundError to 404', async () => {
    const app = await createApiRouter({ getGlobal: () => ({ getAllWorkspaces: () => { throw new mw.NotFoundError('no workspaces') } }) });

    const req = new Request('http://localhost/workspaces', { method: 'GET' })
    const res = await app.fetch(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('maps unhandled errors to 500', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/sessions', { method: 'GET' })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })
})
