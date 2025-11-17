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

// Mock other controllers to throw errors for try-catch coverage
vi.mock('../api/tasks.js', () => ({
  TasksController: class {
    async getTasks() { throw new Error('tasks error') }
    async getTask() { throw new Error('task error') }
    async createTask() { throw new Error('create task error') }
    async updateTask() { throw new Error('update task error') }
    async patchTaskStatus() { throw new Error('patch status error') }
    async addDependency() { throw new Error('add dependency error') }
    async removeDependency() { throw new Error('remove dependency error') }
    async listDependencies() { throw new Error('list dependencies error') }
  }
}))

vi.mock('../api/specs-tools.js', () => ({
  SpecsController: class {
    async createSpec() { throw new Error('create spec error') }
  },
  ToolsController: class {
    async createTool() { throw new Error('create tool error') }
    async createToolVersion() { throw new Error('create tool version error') }
  }
}))

vi.mock('../api/profiles.js', () => ({
  ProfilesController: class {
    async createProfile() { throw new Error('create profile error') }
    async createProfileVersion() { throw new Error('create profile version error') }
    async publishProfileVersion() { throw new Error('publish profile version error') }
    async attachTools() { throw new Error('attach tools error') }
    async getAttachments() { throw new Error('get attachments error') }
    async upgradeWorkspaceProfile() { throw new Error('upgrade profile error') }
    async getWorkspaceProfile() { throw new Error('get profile error') }
  }
}))

vi.mock('../api/tools-execute.js', () => ({
  ToolsExecuteController: class {
    async execute() { throw new Error('execute error') }
  }
}))

describe('createApiRouter error handling', () => {
  let mockDatabaseService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDatabaseService = { getGlobal: () => ({}) };
  });
  it('maps BadRequestError to 400', async () => {
    const app = await createApiRouter({ getGlobal: () => ({ createRule: () => { throw new mw.BadRequestError('bad request') } }) });

    const req = new Request('http://localhost/rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  it('maps ValidationError to 422', async () => {
    const app = await createApiRouter({ getGlobal: () => ({ getRules: () => { throw new mw.ValidationError('invalid') } }) });

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

  it('handles errors in specs controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/specs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in tools controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in tool versions controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/tools/test/versions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in profiles controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/profiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in profile versions controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/profiles/test/versions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in profile publish controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/profiles/test/versions/v1/publish', { method: 'POST' })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in profile attachments controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/profiles/test/versions/v1/attachments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in get attachments controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/profiles/test/versions/v1/attachments', { method: 'GET' })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in upgrade workspace profile controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/workspaces/ws1/profile/upgrade', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in get workspace profile controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/workspaces/ws1/profile', { method: 'GET' })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in tools execute controller', async () => {
    const app = await createApiRouter(mockDatabaseService);

    const req = new Request('http://localhost/tools/test/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
    const res = await app.fetch(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  it('handles errors in tasks controller routes', async () => {
    const app = await createApiRouter(mockDatabaseService);

    // Test getTasks
    let req = new Request('http://localhost/workspaces/ws1/tasks', { method: 'GET' })
    let res = await app.fetch(req)
    expect(res.status).toBe(500)
    let body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')

    // Test getTask
    req = new Request('http://localhost/workspaces/ws1/tasks/task1', { method: 'GET' })
    res = await app.fetch(req)
    expect(res.status).toBe(500)
    body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')

    // Test createTask
    req = new Request('http://localhost/workspaces/ws1/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'test', description: 'test' }) })
    res = await app.fetch(req)
    expect(res.status).toBe(500)
    body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')

    // Test updateTask
    req = new Request('http://localhost/workspaces/ws1/tasks/task1', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ field: 'title', value: 'new', reason: 'test' }) })
    res = await app.fetch(req)
    expect(res.status).toBe(500)
    body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')

    // Test patchTaskStatus
    req = new Request('http://localhost/workspaces/ws1/tasks/task1/status', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) })
    res = await app.fetch(req)
    expect(res.status).toBe(500)
    body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')

    // Test addDependency
    req = new Request('http://localhost/workspaces/ws1/tasks/task1/dependencies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ depends_on: 'task2' }) })
    res = await app.fetch(req)
    expect(res.status).toBe(500)
    body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')

    // Test removeDependency
    req = new Request('http://localhost/workspaces/ws1/tasks/task1/dependencies/task2', { method: 'DELETE' })
    res = await app.fetch(req)
    expect(res.status).toBe(500)
    body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')

    // Test listDependencies
    req = new Request('http://localhost/workspaces/ws1/tasks/task1/dependencies', { method: 'GET' })
    res = await app.fetch(req)
    expect(res.status).toBe(500)
    body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })
})
