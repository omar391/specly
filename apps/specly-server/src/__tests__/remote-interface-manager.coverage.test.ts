import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RemoteInterfaceManager } from '../services/remote-interface-manager.js'

class FakeWorkspaceDb {
  createRemoteInterface = vi.fn()
  getAllRemoteInterfaces = vi.fn()
  getRemoteInterface = vi.fn()
  updateRemoteInterface = vi.fn()
  deleteRemoteInterface = vi.fn()
}

class FakeDbService {
  constructor(private ws: any) {}
  async getWorkspace(id: string) { return this.ws }
}

describe('RemoteInterfaceManager', () => {
  let fakeWs: FakeWorkspaceDb
  let dbService: FakeDbService
  let mgr: RemoteInterfaceManager

  beforeEach(() => {
    vi.restoreAllMocks()
    fakeWs = new FakeWorkspaceDb()
    dbService = new FakeDbService(fakeWs)
    mgr = new RemoteInterfaceManager(dbService as any)
  })

  it('registerInterface persists and returns mapping', async () => {
    fakeWs.createRemoteInterface.mockResolvedValueOnce(true)

    const res = await mgr.registerInterface('w1', 'jira', 'Name', 'https://api.example', 'token-123', {
      projectId: 'PRJ', syncEnabled: false, syncDirection: 'import_only'
    })

    expect(res.workspace_id).toBe('w1')
    expect(res.interface_type).toBe('jira')
    expect(res.name).toBe('Name')
    expect(typeof res.id).toBe('string')
    expect(fakeWs.createRemoteInterface).toHaveBeenCalled()
  })

  it('registerInterface uses defaults for missing options', async () => {
    fakeWs.createRemoteInterface.mockResolvedValueOnce(true)

    const res = await mgr.registerInterface('w1', 'github', 'Git', 'https://github.com', 'token')

    expect(res.sync_enabled).toBe(true)
    expect(res.sync_direction).toBe('bidirectional')
    expect(res.mcp_server_name).toBe('github-mcp')
    expect(fakeWs.createRemoteInterface).toHaveBeenCalled()
  })

  it('getWorkspaceInterfaces maps DB rows to API objects', async () => {
    fakeWs.getAllRemoteInterfaces.mockResolvedValueOnce([
      { id: 'r1', interfaceType: 'github', name: 'G', baseUrl: 'https://g', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: JSON.stringify([]), lastSync: null, createdAt: '2020-01-01', updatedAt: '2020-01-02' }
    ])

    const list = await mgr.getWorkspaceInterfaces('w1')
    expect(list).toHaveLength(1)
    expect(list[0].interface_type).toBe('github')
    expect(list[0].workspace_id).toBe('w1')
  })

  it('getWorkspaceInterfaces handles fieldMappings as object', async () => {
    fakeWs.getAllRemoteInterfaces.mockResolvedValueOnce([
      { id: 'r1', interfaceType: 'github', name: 'G', baseUrl: 'https://g', apiToken: 't', projectId: 'p', syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: { title: 'title' }, lastSync: null, createdAt: '2020-01-01', updatedAt: '2020-01-02' }
    ])

    const list = await mgr.getWorkspaceInterfaces('w1')
    expect(list[0].field_mappings).toBe('{"title":"title"}')
  })

  it('getInterface returns mapped object', async () => {
    fakeWs.getRemoteInterface.mockResolvedValueOnce({ id: 'r1', interfaceType: 'github', name: 'G', baseUrl: 'https://g', apiToken: 't', projectId: 'p', syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '2020-01-01', updatedAt: '2020-01-02' })

    const i = await mgr.getInterface('w1', 'r1')
    expect(i?.interface_type).toBe('github')
    expect(i?.project_id).toBe('p')
  })

  it('getInterface returns null when not found and testConnection reports not found', async () => {
    fakeWs.getRemoteInterface.mockResolvedValueOnce(null)
    const t = await mgr.testConnection('w1', 'missing')
    expect(t.success).toBe(false)
    expect(t.error).toMatch(/not found/i)
  })

  it('testConnection handles github success', async () => {
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({
      id: 'r2', workspace_id: 'w1', interface_type: 'github', name: 'G', base_url: 'https://g', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'g-mcp', last_sync: null, created_at: '', updated_at: ''
    } as any)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ login: 'user', name: 'User', type: 'User' }) } as any))
    const gh = await mgr.testConnection('w1', 'r2')
    expect(gh.success).toBe(true)
    expect(gh.info?.user).toBe('user')
  })

  it('testConnection handles jira success', async () => {
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({
      id: 'r3', workspace_id: 'w1', interface_type: 'jira', name: 'J', base_url: 'https://j', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'j-mcp', last_sync: null, created_at: '', updated_at: ''
    } as any)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: 'u', displayName: 'User', emailAddress: 'u@example.com' }) } as any))
    const j = await mgr.testConnection('w1', 'r3')
    expect(j.success).toBe(true)
    expect(j.info?.user).toBe('u')
  })

  it('testConnection handles linear success', async () => {
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({
      id: 'r4', workspace_id: 'w1', interface_type: 'linear', name: 'L', base_url: 'https://l', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'l-mcp', last_sync: null, created_at: '', updated_at: ''
    } as any)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { viewer: { id: 'u', name: 'User', email: 'u@example.com' } } }) } as any))
    const l = await mgr.testConnection('w1', 'r4')
    expect(l.success).toBe(true)
    expect(l.info?.user).toBe('u')
  })

  it('testConnection handles linear API error', async () => {
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({
      id: 'r4', workspace_id: 'w1', interface_type: 'linear', name: 'L', base_url: 'https://l', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'l-mcp', last_sync: null, created_at: '', updated_at: ''
    } as any)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ errors: [{ message: 'Invalid token' }] }) } as any))
    const l = await mgr.testConnection('w1', 'r4')
    expect(l.success).toBe(false)
    expect(l.error).toMatch(/Invalid token/)
  })

  it('testConnection handles generic failure', async () => {
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({
      id: 'ri', workspace_id: 'w1', interface_type: 'custom', name: 'C', base_url: 'https://x', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'c-mcp', last_sync: null, created_at: '', updated_at: ''
    } as any)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' } as any))
    const g = await mgr.testConnection('w1', 'ri')
    expect(g.success).toBe(false)
    expect(g.error).toMatch(/API error/)
  })

  it('testConnection handles fetch error', async () => {
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({
      id: 'r2', workspace_id: 'w1', interface_type: 'github', name: 'G', base_url: 'https://g', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'g-mcp', last_sync: null, created_at: '', updated_at: ''
    } as any)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const gh = await mgr.testConnection('w1', 'r2')
    expect(gh.success).toBe(false)
    expect(gh.error).toMatch(/Connection failed/)
  })

  it('syncInterface throws for not found or disabled and returns errors for github/tool path', async () => {
    // not found
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce(null)
    await expect(mgr.syncInterface('w1', 'no')).rejects.toThrow(/not found/i)

    // disabled
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({ id: 'x', workspace_id: 'w1', interface_type: 'jira', name: 'J', base_url: 'https://j', api_token: 't', project_id: undefined, sync_enabled: false, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'j-mcp', last_sync: null, created_at: '', updated_at: '' } as any)
    await expect(mgr.syncInterface('w1', 'x')).rejects.toThrow(/disabled/i)

    // github path -> errors contains message about tool
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({ id: 'g', workspace_id: 'w1', interface_type: 'github', name: 'G', base_url: 'https://g', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'g-mcp', last_sync: null, created_at: '', updated_at: '' } as any)
    const res = await mgr.syncInterface('w1', 'g')
    expect(res.errors.length).toBeGreaterThan(0)
  })

  it('syncInterface handles jira and linear paths', async () => {
    // jira
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({ id: 'j', workspace_id: 'w1', interface_type: 'jira', name: 'J', base_url: 'https://j', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'j-mcp', last_sync: null, created_at: '', updated_at: '' } as any)
    const resJ = await mgr.syncInterface('w1', 'j')
    expect(resJ.errors.length).toBeGreaterThan(0)
    expect(resJ.errors[0]).toMatch(/not yet implemented/)

    // linear
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({ id: 'l', workspace_id: 'w1', interface_type: 'linear', name: 'L', base_url: 'https://l', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'l-mcp', last_sync: null, created_at: '', updated_at: '' } as any)
    const resL = await mgr.syncInterface('w1', 'l')
    expect(resL.errors.length).toBeGreaterThan(0)
    expect(resL.errors[0]).toMatch(/not yet implemented/)

    // unsupported type
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({ id: 'a', workspace_id: 'w1', interface_type: 'asana', name: 'A', base_url: 'https://a', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'a-mcp', last_sync: null, created_at: '', updated_at: '' } as any)
    const resA = await mgr.syncInterface('w1', 'a')
    expect(resA.errors.length).toBeGreaterThan(0)
    expect(resA.errors[0]).toMatch(/not implemented for asana/)
  })

  it('getDefaultFieldMappings returns correct mappings for each type', () => {
    expect(mgr['getDefaultFieldMappings']('github')).toEqual([
      { specly_field: 'title', remote_field: 'title' },
      { specly_field: 'description', remote_field: 'description' },
      { specly_field: 'status', remote_field: 'status' },
      { specly_field: 'status', remote_field: 'state', transformation: 'custom' },
      { specly_field: 'priority', remote_field: 'labels', transformation: 'custom' }
    ])

    expect(mgr['getDefaultFieldMappings']('jira')).toEqual([
      { specly_field: 'title', remote_field: 'title' },
      { specly_field: 'description', remote_field: 'description' },
      { specly_field: 'status', remote_field: 'status' },
      { specly_field: 'priority', remote_field: 'priority.name' },
      { specly_field: 'status', remote_field: 'status.name' },
      { specly_field: 'assignee', remote_field: 'assignee.displayName' }
    ])

    expect(mgr['getDefaultFieldMappings']('linear')).toEqual([
      { specly_field: 'title', remote_field: 'title' },
      { specly_field: 'description', remote_field: 'description' },
      { specly_field: 'status', remote_field: 'status' },
      { specly_field: 'priority', remote_field: 'priority', transformation: 'custom' },
      { specly_field: 'status', remote_field: 'state.name' },
      { specly_field: 'assignee', remote_field: 'assignee.name' }
    ])

    expect(mgr['getDefaultFieldMappings']('custom')).toEqual([
      { specly_field: 'title', remote_field: 'title' },
      { specly_field: 'description', remote_field: 'description' },
      { specly_field: 'status', remote_field: 'status' }
    ])
  })

  it('getWorkspaceSyncStats calculates stats correctly', async () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 25 * 60 * 60 * 1000) // 25 hours ago

    vi.spyOn(mgr, 'getWorkspaceInterfaces').mockResolvedValueOnce([
      { id: '1', name: 'I1', interface_type: 'github', sync_enabled: true, last_sync: now.toISOString(), mcp_server_name: 'g-mcp' } as any,
      { id: '2', name: 'I2', interface_type: 'jira', sync_enabled: false, last_sync: null, mcp_server_name: 'j-mcp' } as any,
      { id: '3', name: 'I3', interface_type: 'linear', sync_enabled: true, last_sync: yesterday.toISOString(), mcp_server_name: 'l-mcp' } as any
    ])

    const stats = await mgr.getWorkspaceSyncStats('w1')
    expect(stats.total_interfaces).toBe(3)
    expect(stats.sync_enabled).toBe(2)
    expect(stats.last_sync_24h).toBe(1) // only the first one
    expect(stats.interfaces).toHaveLength(3)
  })
})
