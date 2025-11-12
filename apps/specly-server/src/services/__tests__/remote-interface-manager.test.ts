import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteInterfaceManager } from '../remote-interface-manager.js';

const makeDbService = (workspaceDb: any) => ({
    getWorkspace: vi.fn().mockResolvedValue(workspaceDb)
});

describe('RemoteInterfaceManager', () => {
    let workspaceDb: any;
    let dbService: any;
    let manager: RemoteInterfaceManager;

    beforeEach(() => {
        workspaceDb = {
            createRemoteInterface: vi.fn().mockResolvedValue(undefined),
            getAllRemoteInterfaces: vi.fn().mockResolvedValue([]),
            getRemoteInterface: vi.fn().mockResolvedValue(null),
            updateRemoteInterface: vi.fn().mockResolvedValue(undefined),
            deleteRemoteInterface: vi.fn().mockResolvedValue(undefined)
        };
        dbService = makeDbService(workspaceDb);
        manager = new RemoteInterfaceManager(dbService as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('registerInterface maps and stores remote interface', async () => {
        const res = await manager.registerInterface('ws1', 'jira', 'My Jira', 'https://jira.example', 'token-123', {
            projectId: 'PROJ',
            syncEnabled: false,
            syncDirection: 'import_only',
            fieldMappings: [{ specly_field: 'a', remote_field: 'b' }],
            mcpServerName: 'custom-mcp'
        });

        expect(res.workspace_id).toBe('ws1');
        expect(res.interface_type).toBe('jira');
        expect(res.mcp_server_name).toBe('custom-mcp');
        expect(typeof res.id).toBe('string');
        expect(workspaceDb.createRemoteInterface).toHaveBeenCalled();
    });

    it('getWorkspaceInterfaces converts db rows to RemoteInterface', async () => {
        const dbRows = [
            { id: 'r1', interfaceType: 'github', name: 'g', baseUrl: 'u', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: [{ specly_field: 'title', remote_field: 'title' }], lastSync: null, createdAt: 'c', updatedAt: 'u' }
        ];
        workspaceDb.getAllRemoteInterfaces.mockResolvedValue(dbRows);

        const out = await manager.getWorkspaceInterfaces('ws1');
        expect(Array.isArray(out)).toBe(true);
        expect(out[0].id).toBe('r1');
        expect(typeof out[0].field_mappings).toBe('string');
    });

    it('getInterface returns null when not found and maps when present', async () => {
        workspaceDb.getRemoteInterface.mockResolvedValue(null);
        const notFound = await manager.getInterface('ws1', 'nope');
        expect(notFound).toBeNull();

        const row = { id: 'r2', interfaceType: 'linear', name: 'l', baseUrl: 'u', apiToken: 't', projectId: null, syncEnabled: false, syncDirection: 'import_only', fieldMappings: '[]', lastSync: null, createdAt: 'c', updatedAt: 'u' };
        workspaceDb.getRemoteInterface.mockResolvedValue(row);
        const found = await manager.getInterface('ws1', 'r2');
        expect(found?.id).toBe('r2');
        expect(found?.sync_enabled).toBe(false);
    });

    it('updateInterface and deleteInterface call workspace DB methods', async () => {
        await manager.updateInterface('ws1', 'rid', { name: 'x' });
        expect(workspaceDb.updateRemoteInterface).toHaveBeenCalledWith('rid', { name: 'x' });

        await manager.deleteInterface('ws1', 'rid');
        expect(workspaceDb.deleteRemoteInterface).toHaveBeenCalledWith('rid');
    });

    it('testConnection handles missing interface', async () => {
        workspaceDb.getRemoteInterface.mockResolvedValue(null);
        const r = await manager.testConnection('ws1', 'missing');
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/Interface not found/);
    });

    it('testConnection github success and failure', async () => {
        const ri = { id: 'g1', interfaceType: 'github', name: 'g', baseUrl: 'https://api.github.com', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(ri);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ login: 'u', name: 'n', type: 'User' }) }));
        const ok = await manager.testConnection('ws1', 'g1');
        expect(ok.success).toBe(true);
        expect(ok.info).toBeTruthy();

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }));
        const bad = await manager.testConnection('ws1', 'g1');
        expect(bad.success).toBe(false);
        expect(bad.error).toMatch(/GitHub API error/);
    });

    it('testConnection jira and linear and generic', async () => {
        const jira = { id: 'j1', interfaceType: 'jira', name: 'j', baseUrl: 'https://jira', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(jira);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: 'k', displayName: 'n', emailAddress: 'e' }) }));
        const rj = await manager.testConnection('ws1', 'j1');
        expect(rj.success).toBe(true);

        const linear = { ...jira, id: 'l1', interfaceType: 'linear', baseUrl: 'https://linear' };
        workspaceDb.getRemoteInterface.mockResolvedValue(linear);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { viewer: { id: 'x', name: 'n', email: 'e' } } }) }));
        const rl = await manager.testConnection('ws1', 'l1');
        expect(rl.success).toBe(true);

        const custom = { ...jira, id: 'c1', interfaceType: 'custom', baseUrl: 'https://custom' };
        workspaceDb.getRemoteInterface.mockResolvedValue(custom);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
        const rc = await manager.testConnection('ws1', 'c1');
        expect(rc.success).toBe(true);
    });

    it('testConnection GitHub and Jira fetch throwing hits catch branches', async () => {
        const gh = { id: 'g-throw', interfaceType: 'github', name: 'g', baseUrl: 'https://api.github.com', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(gh);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('gh-net')));
        const rgh = await manager.testConnection('ws1', 'g-throw');
        expect(rgh.success).toBe(false);
        expect(rgh.error).toMatch(/Connection failed/);

        const jth = { id: 'j-throw', interfaceType: 'jira', name: 'j', baseUrl: 'https://jira', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(jth);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('jira-net')));
        const rj = await manager.testConnection('ws1', 'j-throw');
        expect(rj.success).toBe(false);
        expect(rj.error).toMatch(/Connection failed/);
    });

    it('testConnection linear non-ok response returns error', async () => {
        const linearNo = { id: 'l-no', interfaceType: 'linear', name: 'l', baseUrl: 'https://linear', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(linearNo);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway' }));
        const rl = await manager.testConnection('ws1', 'l-no');
        expect(rl.success).toBe(false);
        expect(rl.error).toMatch(/Linear API error/);
    });

    it('testConnection linear fetch throwing hits catch branch', async () => {
        const linearErr = { id: 'l-err', interfaceType: 'linear', name: 'l', baseUrl: 'https://linear', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(linearErr);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('linear-net')));
        const rl = await manager.testConnection('ws1', 'l-err');
        expect(rl.success).toBe(false);
        expect(rl.error).toMatch(/Connection failed/);
    });

    it('testConnection propagates thrown errors from internal testers', async () => {
        const ri = { id: 'x-err', interfaceType: 'github', name: 'g', baseUrl: 'https://api.github.com', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(ri);
        const anyM = manager as any;
        vi.spyOn(anyM, 'testGitHubConnection' as any).mockRejectedValue(new Error('internal-boom'));
        const r = await manager.testConnection('ws1', 'x-err');
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/internal-boom/);
    });

    it('syncJiraInterface and syncLinearInterface throw as placeholders', async () => {
        const anyM = manager as any;
        const jira = { id: 'j-p', interfaceType: 'jira' } as any;
        await expect(anyM.syncJiraInterface(jira, { interface_id: 'j-p', items_imported: 0, items_exported: 0, items_updated: 0, items_failed: 0, errors: [], last_sync: new Date().toISOString() })).rejects.toThrow(/Jira synchronization not yet implemented/);

        const linear = { id: 'l-p', interfaceType: 'linear' } as any;
        await expect(anyM.syncLinearInterface(linear, { interface_id: 'l-p', items_imported: 0, items_exported: 0, items_updated: 0, items_failed: 0, errors: [], last_sync: new Date().toISOString() })).rejects.toThrow(/Linear synchronization not yet implemented/);
    });

    it('syncInterface invokes jira handler when available', async () => {
        const jira = { id: 'j-ok', interfaceType: 'jira', name: 'j', baseUrl: 'https://jira', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(jira);
        const anyM = manager as any;
        vi.spyOn(anyM, 'syncJiraInterface' as any).mockResolvedValue(undefined);
        const res = await manager.syncInterface('ws1', 'j-ok');
        expect(res.errors.length).toBe(0);
    });

    it('syncInterface invokes linear handler when available', async () => {
        const linear = { id: 'l-ok', interfaceType: 'linear', name: 'l', baseUrl: 'https://linear', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(linear);
        const anyM = manager as any;
        vi.spyOn(anyM, 'syncLinearInterface' as any).mockResolvedValue(undefined);
        const res = await manager.syncInterface('ws1', 'l-ok');
        expect(res.errors.length).toBe(0);
    });

    it('syncInterface errors for not found, disabled and github special case', async () => {
        workspaceDb.getRemoteInterface.mockResolvedValue(null);
        await expect(manager.syncInterface('ws1', 'nope')).rejects.toThrow(/Interface not found/);

        const ri = { id: 's1', interfaceType: 'custom', name: 'c', baseUrl: 'u', apiToken: 't', projectId: null, syncEnabled: false, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(ri);
        await expect(manager.syncInterface('ws1', 's1')).rejects.toThrow(/Synchronization is disabled/);

        const gh = { ...ri, id: 'g2', interfaceType: 'github', syncEnabled: true };
        workspaceDb.getRemoteInterface.mockResolvedValue(gh);
        const res = await manager.syncInterface('ws1', 'g2');
        expect(res.errors.length).toBeGreaterThan(0);
        expect(res.errors[0]).toMatch(/GitHub synchronization should use/);
    });

    it('getDefaultFieldMappings returns sensible mappings', () => {
        // access via casting to any to test private method
        const anyM = manager as any;
        const gh = anyM.getDefaultFieldMappings('github');
        expect(Array.isArray(gh)).toBe(true);
        const jr = anyM.getDefaultFieldMappings('jira');
        expect(jr.some((m: any) => m.remote_field.includes('priority'))).toBe(true);
        const ln = anyM.getDefaultFieldMappings('linear');
        expect(ln.some((m: any) => m.remote_field.includes('priority'))).toBe(true);
    });

    it('getWorkspaceSyncStats aggregates stats', async () => {
        const now = new Date();
        const recent = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
        const old = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

        vi.spyOn(manager, 'getWorkspaceInterfaces').mockResolvedValue([
            { id: 'a', name: 'A', interface_type: 'custom', sync_enabled: true, last_sync: recent },
            { id: 'b', name: 'B', interface_type: 'custom', sync_enabled: false, last_sync: old }
        ] as any);

        const stats = await manager.getWorkspaceSyncStats('ws1');
        expect(stats.total_interfaces).toBe(2);
        expect(stats.sync_enabled).toBe(1);
        expect(stats.last_sync_24h).toBe(1);
    });

    it('syncInterface handles jira and linear placeholder errors', async () => {
        const jira = { id: 'j-sync', interfaceType: 'jira', name: 'j', baseUrl: 'https://jira', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(jira);
        const sj = await manager.syncInterface('ws1', 'j-sync');
        expect(sj.errors.length).toBeGreaterThan(0);
        expect(sj.errors[0]).toMatch(/Jira synchronization not yet implemented/);

        const linear = { ...jira, id: 'l-sync', interfaceType: 'linear' };
        workspaceDb.getRemoteInterface.mockResolvedValue(linear);
        const sl = await manager.syncInterface('ws1', 'l-sync');
        expect(sl.errors.length).toBeGreaterThan(0);
        expect(sl.errors[0]).toMatch(/Linear synchronization not yet implemented/);
    });

    it('testConnection handles fetch throwing', async () => {
        const ri = { id: 'e1', interfaceType: 'custom', name: 'c', baseUrl: 'https://bad', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(ri);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('netfail')));
        const r = await manager.testConnection('ws1', 'e1');
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/Connection failed/);
    });

    it('testLinear connection returns error when viewer missing and generic non-ok handling', async () => {
        // linear viewer missing
        const linearMissing = { id: 'l2', interfaceType: 'linear', name: 'l', baseUrl: 'https://linear', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(linearMissing);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }));
        const rl = await manager.testConnection('ws1', 'l2');
        expect(rl.success).toBe(false);
        expect(rl.error).toMatch(/Linear API error/);

        // generic API non-ok
        const custom = { ...linearMissing, id: 'c2', interfaceType: 'custom', baseUrl: 'https://custom' };
        workspaceDb.getRemoteInterface.mockResolvedValue(custom);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }));
        const rc = await manager.testConnection('ws1', 'c2');
        expect(rc.success).toBe(false);
        expect(rc.error).toMatch(/API error/);
    });

    it('testConnection jira non-ok returns error message', async () => {
        const jira = { id: 'j2', interfaceType: 'jira', name: 'j', baseUrl: 'https://jira', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(jira);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }));
        const rj = await manager.testConnection('ws1', 'j2');
        expect(rj.success).toBe(false);
        expect(rj.error).toMatch(/Jira API error/);
    });

    it('syncInterface handles unknown/custom enabled case as not implemented', async () => {
        const ri = { id: 'c-enabled', interfaceType: 'custom', name: 'c', baseUrl: 'u', apiToken: 't', projectId: null, syncEnabled: true, syncDirection: 'bidirectional', fieldMappings: '[]', lastSync: null, createdAt: '', updatedAt: '' };
        workspaceDb.getRemoteInterface.mockResolvedValue(ri);
        const res = await manager.syncInterface('ws1', 'c-enabled');
        expect(res.errors.length).toBeGreaterThan(0);
        expect(res.errors[0]).toMatch(/Synchronization not implemented for/);
    });

    it('getDefaultFieldMappings returns base mapping for unknown types', () => {
        const anyM = manager as any;
        const trello = anyM.getDefaultFieldMappings('trello');
        expect(Array.isArray(trello)).toBe(true);
        expect(trello.length).toBeGreaterThanOrEqual(3);
    });
});
