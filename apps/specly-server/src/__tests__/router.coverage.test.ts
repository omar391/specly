import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SSEEventManager, createApiRouter } from '../api/router.js'

// Mock all controllers for route coverage
vi.mock('../api/workspaces.js', () => ({
  WorkspacesController: class {
    async getWorkspaces() { return { workspaces: [] } }
  }
}))

vi.mock('../api/tasks.js', () => ({
  TasksController: class {
    async getTasks() { return { tasks: [] } }
    async getTask() { return { task: {} } }
    async createTask() { return { task: {} } }
    async updateTask() { return { task: {} } }
    async patchTaskStatus() { return { task: {} } }
    async addDependency() { return { dependency: {} } }
    async removeDependency() { return {} }
    async listDependencies() { return { dependencies: [] } }
  }
}))

vi.mock('../api/tools-execute.js', () => ({
  ToolsExecuteController: class {
    async execute() { return { result: {} } }
  }
}))

vi.mock('../api/specs-tools.js', () => ({
  SpecsController: class {
    async createSpec() { return { spec: {} } }
  },
  ToolsController: class {
    async createTool() { return { tool: {} } }
    async createToolVersion() { return { version: {} } }
  }
}))

vi.mock('../api/profiles.js', () => ({
  ProfilesController: class {
    async createProfile() { return { profile: {} } }
    async createProfileVersion() { return { version: {} } }
    async publishProfileVersion() { return { published: true } }
    async attachTools() { return { attached: true } }
    async getAttachments() { return { attachments: [] } }
    async upgradeWorkspaceProfile() { return { upgraded: true } }
    async getWorkspaceProfile() { return { profile: {} } }
  }
}))

vi.mock('../api/sessions.js', () => ({
  SessionsController: class {
    async getSessions() { return { sessions: [] } }
  }
}))

vi.mock('../api/rules.js', () => ({
  RulesController: class {
    async initialize() { }
    async createRule() { return { rule: {} } }
    async getRules() { return { rules: [] } }
  }
}))

describe('SSEEventManager', () => {
  let manager: SSEEventManager
  beforeEach(() => {
    manager = new SSEEventManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds client, sends event, and closes all', async () => {
    const enqueue = vi.fn()
    const close = vi.fn()
    let onAbortCallback: any

    const stream = {
      controller: { enqueue, close },
      writeln: vi.fn(() => Promise.resolve()),
      onAbort: (cb: any) => { onAbortCallback = cb }
    }

    const c = {
      streamSSE: async (fn: any) => {
        await fn(stream)
      }
    }

    manager.addClient('client1', c as any)
    expect(manager.getClientCount()).toBe(1)

    // Send event before disconnecting
    manager.sendToClient('client1', { hello: 'world' })
    expect(enqueue).toHaveBeenCalled()

    // Wait a bit for the async streamSSE callback to execute
    await new Promise(resolve => setTimeout(resolve, 0))

    manager.closeAll()
    expect(close).toHaveBeenCalled()
    expect(manager.getClientCount()).toBe(0)

    // Call onAbort to cover the disconnect cleanup (client already removed by closeAll)
    onAbortCallback()
    expect(manager.getClientCount()).toBe(0)
  })

  it('removes client on enqueue error', async () => {
    const enqueue = vi.fn(() => { throw new Error('boom') })
    const stream = {
      controller: { enqueue },
      writeln: vi.fn(() => Promise.resolve()),
      onAbort: (cb: any) => { /* noop */ }
    }
    const c = { streamSSE: async (fn: any) => { await fn(stream) } }

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    manager.addClient('bad', c as any)
    expect(manager.getClientCount()).toBe(1)

    manager.sendToClient('bad', { x: 1 })
    // enqueue throws, manager should remove client and log
    expect(errSpy).toHaveBeenCalled()
    expect(manager.getClientCount()).toBe(0)
  })

  it('broadcasts to multiple clients and cleans up failing ones', async () => {
    const enqueueA = vi.fn()
    const enqueueB = vi.fn(() => { throw new Error('failB') })

    const streamA = { controller: { enqueue: enqueueA }, writeln: vi.fn(() => Promise.resolve()), onAbort: (cb:any)=>{} }
    const streamB = { controller: { enqueue: enqueueB }, writeln: vi.fn(() => Promise.resolve()), onAbort: (cb:any)=>{} }

    const cA = { streamSSE: async (fn: any) => { await fn(streamA) } }
    const cB = { streamSSE: async (fn: any) => { await fn(streamB) } }

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    manager.addClient('A', cA as any)
    manager.addClient('B', cB as any)

    expect(manager.getClientCount()).toBe(2)

    manager.broadcast({ event: 'x' })

    expect(enqueueA).toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
    expect(manager.getClientCount()).toBe(1)
  })

  it('sends specialized events with correct shape', async () => {
    const enqueue = vi.fn()
    const stream = { controller: { enqueue }, writeln: vi.fn(() => Promise.resolve()), onAbort: (cb:any)=>{} }
    const c = { streamSSE: async (fn: any) => { await fn(stream) } }

    manager.addClient('x', c as any)

    manager.sendWorkspaceStatusChanged('w1', 'active', '2025-01-01')
    manager.sendTaskUpdated('w1', { id: 't1', status: 'done', progress: 100, updated_at: 'now' })
    manager.sendTaskCreated('w1', { id: 't2', title: 'T', status: 'new', created_at: 'now' })

    expect(enqueue).toHaveBeenCalled()
    const lastCallArg = enqueue.mock.calls[enqueue.mock.calls.length - 1][0]
    expect(typeof lastCallArg).toBe('string')
    expect(lastCallArg).toContain('task.created')
  })
})
