import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkspaceRegistry } from '../services/workspace-registry.js'

class FakeGlobalDb {
  getWorkspaceByPath = vi.fn()
  createWorkspace = vi.fn()
  updateWorkspaceActivity = vi.fn()
  getAllWorkspaces = vi.fn()
  updateWorkspace = vi.fn()
  deleteWorkspace = vi.fn()
}

describe('WorkspaceRegistry (partial)', () => {
  let fakeGlobal: FakeGlobalDb
  let registry: WorkspaceRegistry

  beforeEach(() => {
    vi.restoreAllMocks()
    fakeGlobal = new FakeGlobalDb()
    // Construct registry then replace its globalDb with our fake
    registry = new WorkspaceRegistry(null as any, { scanPaths: [], autoRegister: false })
    ;(registry as any).globalDb = fakeGlobal
  })

  it('registerWorkspace returns existing id when workspace exists', async () => {
    fakeGlobal.getWorkspaceByPath.mockResolvedValueOnce({ id: 'existing', path: '/x' })
    const id = await registry.registerWorkspace('/x')
    expect(id).toBe('existing')
    expect(fakeGlobal.createWorkspace).not.toHaveBeenCalled()
  })

  it('getWorkspaceStats aggregates status counts', async () => {
    fakeGlobal.getAllWorkspaces.mockResolvedValueOnce([
      { id: 'a', status: 'active' },
      { id: 'b', status: 'disconnected' },
      { id: 'c', status: 'error' },
      { id: 'd', status: 'inactive' }
    ])
    const stats = await registry.getWorkspaceStats()
    expect(stats.total).toBe(4)
    expect(stats.active).toBe(1)
    expect(stats.error).toBe(1)
    expect(typeof stats.connected).toBe('number')
  })

  it('unregisterWorkspace calls delete on global db and clears timers', async () => {
    // Ensure deleteWorkspace is called
    fakeGlobal.deleteWorkspace.mockResolvedValueOnce(true)
    // Put a dummy timer in activityTimers and ensure it's cleared
    const t = setTimeout(() => {}, 100000)
    ;(registry as any).activityTimers.set('ws1', t)

    await registry.unregisterWorkspace('ws1')
    expect(fakeGlobal.deleteWorkspace).toHaveBeenCalledWith('ws1')
    expect((registry as any).activityTimers.has('ws1')).toBe(false)
  })
})
