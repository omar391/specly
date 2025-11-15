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

  it('getWorkspaceInterfaces maps DB rows to API objects', async () => {
    fakeWs.getAllRemoteInterfaces.mockResolvedValueOnce([
      { id: 'r1', interfaceType: 'github', name: 'G', baseUrl: 'https://g', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: JSON.stringify([]), lastSync: null, createdAt: '2020-01-01', updatedAt: '2020-01-02' }
    ])

    const list = await mgr.getWorkspaceInterfaces('w1')
    expect(list).toHaveLength(1)
    expect(list[0].interface_type).toBe('github')
    expect(list[0].workspace_id).toBe('w1')
  })

  it('getInterface returns null when not found and testConnection reports not found', async () => {
    fakeWs.getRemoteInterface.mockResolvedValueOnce(null)
    const t = await mgr.testConnection('w1', 'missing')
    expect(t.success).toBe(false)
    expect(t.error).toMatch(/not found/i)
  })

  it('testConnection handles generic and github branches via fetch', async () => {
    // stub getInterface to return a generic interface
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({
      id: 'ri', workspace_id: 'w1', interface_type: 'custom', name: 'C', base_url: 'https://x', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'c-mcp', last_sync: null, created_at: '', updated_at: ''
    } as any)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any))
    const g = await mgr.testConnection('w1', 'ri')
    expect(g.success).toBe(true)

    // github branch: return ok false
    vi.spyOn(mgr, 'getInterface').mockResolvedValueOnce({
      id: 'r2', workspace_id: 'w1', interface_type: 'github', name: 'G', base_url: 'https://g', api_token: 't', project_id: undefined, sync_enabled: true, sync_direction: 'bidirectional', field_mappings: '[]', mcp_server_name: 'g-mcp', last_sync: null, created_at: '', updated_at: ''
    } as any)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) } as any))
    const gh = await mgr.testConnection('w1', 'r2')
    expect(gh.success).toBe(false)
    expect(gh.error).toMatch(/GitHub API error|Connection failed/i)
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
})
