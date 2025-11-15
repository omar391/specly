import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SSEEventManager } from '../api/router.js'

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

    const stream = {
      controller: { enqueue, close },
      writeln: vi.fn(() => Promise.resolve()),
      onAbort: (cb: any) => { /* noop for test */ }
    }

    const c = {
      streamSSE: async (fn: any) => {
        await fn(stream)
      }
    }

    manager.addClient('client1', c as any)
    expect(manager.getClientCount()).toBe(1)

    manager.sendToClient('client1', { hello: 'world' })
    expect(enqueue).toHaveBeenCalled()

    manager.closeAll()
    expect(close).toHaveBeenCalled()
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
