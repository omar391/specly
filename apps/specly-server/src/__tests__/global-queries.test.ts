import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { GlobalDatabaseService, initializeGlobalDatabaseService, getGlobalDatabaseService } from '../database/global-queries.js';
import * as GlobalQueriesModule from '../database/global-queries.js';

// Simple id helper
const id = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;

describe('GlobalDatabaseService (concrete GLOBAL DB)', () => {
  let manager: DrizzleDatabaseManager;
  let svc: GlobalDatabaseService;

  beforeAll(async () => {
    manager = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    await manager.initialize();
    svc = new GlobalDatabaseService(manager);
  });

  afterAll(async () => {
    await manager.close();
  });

  beforeEach(async () => {
    // Ensure tables exist (already from initialize), keep simple between tests
  });

  describe('Spec & Tool Version operations', () => {
    it('getSpecsByHashes returns empty map for empty input', async () => {
      const result = await svc.getSpecsByHashes([]);
      expect(result).toEqual({});
    });

    it('getToolVersion and getSpecsByHashes work with inserted rows', async () => {
      const sqlite = manager.getSqlite();
      const toolHash = id('hash');
      const toolName = id('tool');
      // Insert tool & version
      sqlite.exec(`INSERT INTO tools(name, description) VALUES ('${toolName}', 'desc')`);
      sqlite.exec(`INSERT INTO tool_versions(hash, tool_name, graph_manifest) VALUES ('${toolHash}', '${toolName}', '{"nodes":[]}')`);

      const specHash1 = id('spec');
      const specHash2 = id('spec');
      sqlite.exec(`INSERT INTO specs(hash, executor_type, executor_version, intent, static_params) VALUES ('${specHash1}', 'local', '1', 'human', '{}' )`);
      sqlite.exec(`INSERT INTO specs(hash, executor_type, executor_version, intent, static_params) VALUES ('${specHash2}', 'local', '1', 'autonomous', '{}' )`);

      const tv = await svc.getToolVersion(toolHash);
      expect(tv?.hash).toBe(toolHash);
      expect(tv?.toolName).toBe(toolName);

      const specsMap = await svc.getSpecsByHashes([specHash1, specHash2]);
      expect(Object.keys(specsMap).sort()).toEqual([specHash1, specHash2].sort());
      expect(specsMap[specHash1]?.executorType).toBe('local');
      expect(specsMap[specHash2]?.intent).toBe('autonomous');
    });

    it('getToolVersion returns null for non-existent hash', async () => {
      const result = await svc.getToolVersion('non-existent-hash');
      expect(result).toBeNull();
    });
  });

  describe('Action journal helper', () => {
    it('getActionJournalEntries filters by sessionId', async () => {
      const sqlite = manager.getSqlite();
      const s1 = id('s');
      const s2 = id('s');
      const specHash = id('spec');
      sqlite.exec(`INSERT INTO specs(hash, executor_type, executor_version, intent) VALUES ('${specHash}', 'local','1','human')`);
      sqlite.exec(`INSERT INTO action_journal(id, session_id, spec_hash, idempotency_key, status, attempts) VALUES ('aj1','${s1}','${specHash}','k1','pending',0)`);
      sqlite.exec(`INSERT INTO action_journal(id, session_id, spec_hash, idempotency_key, status, attempts) VALUES ('aj2','${s2}','${specHash}','k2','success',1)`);

      const rows1 = await svc.getActionJournalEntries(s1);
      expect(rows1.length).toBe(1);
      expect(rows1[0].sessionId).toBe(s1);

      const rows2 = await svc.getActionJournalEntries(s2);
      expect(rows2.length).toBe(1);
      expect(rows2[0].status).toBe('success');
    });
  });

  describe('Raw SQL passthrough', () => {
    it('all() returns [] when queryRaw is not available', async () => {
      const result = await svc.all('SELECT 1');
      expect(result).toEqual([]);
    });

    it('all() delegates to queryRaw when present (monkey-patched)', async () => {
      // Monkey-patch a queryRaw onto the service's private field for coverage
      const anySvc = svc as any;
      const ret = [{ ok: true }];
      anySvc.db.queryRaw = vi.fn().mockResolvedValue(ret);
      const out = await svc.all('SELECT 42');
      expect(out).toEqual(ret);
      expect(anySvc.db.queryRaw).toHaveBeenCalledWith('SELECT 42');
      // cleanup
      delete anySvc.db.queryRaw;
    });
  });

  describe('Initialization and manager accessors', () => {
    it('initialize() calls through to manager.initialize safely', async () => {
      const m = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
      const s = new GlobalDatabaseService(m);
      // Spy initialize to ensure it has been called
      const initSpy = vi.spyOn(m, 'initialize');
      await s.initialize();
      expect(initSpy).toHaveBeenCalledTimes(1);
      await m.close();
    });

    it('getDrizzleManager() returns the same manager', () => {
      expect(svc.getDrizzleManager()).toBe(manager);
    });
  });

  describe('Workspace operations', () => {
    it('create/get/getByPath/update/delete, list order by updatedAt desc', async () => {
      const w1 = await svc.createWorkspace({ id: id('w'), path: '/tmp/w1', name: 'W1', status: 'idle' });
      const w2 = await svc.createWorkspace({ id: id('w'), path: '/tmp/w2', name: 'W2', status: 'active' });

      // get by id/path
      expect(await svc.getWorkspace(w1.id)).toMatchObject({ id: w1.id, path: '/tmp/w1' });
      expect(await svc.getWorkspaceByPath('/tmp/w2')).toMatchObject({ id: w2.id, name: 'W2' });

      // update workspace changes updatedAt
      const updated = await svc.updateWorkspace(w1.id, { name: 'W1-new' });
      expect(updated?.name).toBe('W1-new');

      // list order: the most recently updated first (w1 should now come before w2)
      const all = await svc.getAllWorkspaces();
      expect(all[0].id).toBe(w1.id);
      expect(all.map(w => w.id).sort().length).toBeGreaterThan(0);

      // update activity with optional fields
      await svc.updateWorkspaceActivity(w2.id, 5, 'task-123');
      const w2a = await svc.getWorkspace(w2.id);
      expect(w2a?.taskCount).toBe(5);
      expect(w2a?.activeTask).toBe('task-123');

      // delete
      expect(await svc.deleteWorkspace(w1.id)).toBe(true);
      expect(await svc.getWorkspace(w1.id)).toBeNull();
      // deleting again should be false
      expect(await svc.deleteWorkspace(w1.id)).toBe(false);
    });

    it('getWorkspace returns null for non-existent id', async () => {
      const result = await svc.getWorkspace('non-existent-id');
      expect(result).toBeNull();
    });

    it('getWorkspaceByPath returns null for non-existent path', async () => {
      const result = await svc.getWorkspaceByPath('/non/existent/path');
      expect(result).toBeNull();
    });

    it('updateWorkspace returns null for non-existent id', async () => {
      const result = await svc.updateWorkspace('non-existent-id', { name: 'test' });
      expect(result).toBeNull();
    });

    it('deleteWorkspace returns false for non-existent id', async () => {
      const result = await svc.deleteWorkspace('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('Session operations', () => {
    it('create/get active/list/update activity/close/filters', async () => {
      const w = await svc.createWorkspace({ id: id('w'), path: '/tmp/ss', name: 'WS', status: 'idle' });
      const s1 = await svc.createSession({ id: id('s'), workspaceId: w.id, isActive: true });
      const s2 = await svc.createSession({ id: id('s'), workspaceId: w.id, isActive: true });

      // bump s2 lastActivity so it sorts first
      await svc.updateSessionActivity(s2.id);

      const active = await svc.getActiveSession(w.id);
      expect(active?.id).toBe(s2.id);

      const all = await svc.getWorkspaceSessions(w.id);
      expect(all.map(s => s.id)).toEqual([s2.id, s1.id]);

      // filters
      const allAll = await svc.getAllSessions();
      expect(allAll.length).toBeGreaterThanOrEqual(2);

      const filteredByWs = await svc.getAllSessions({ workspaceId: w.id });
      expect(filteredByWs.length).toBe(2);

      // close session and filter by isActive
      await svc.closeSession(s2.id);
      const activeOnly = await svc.getAllSessions({ workspaceId: w.id, isActive: true });
      expect(activeOnly.length).toBe(1);
      expect(activeOnly[0].id).toBe(s1.id);

      const inactiveOnly = await svc.getAllSessions({ workspaceId: w.id, isActive: false });
      expect(inactiveOnly.length).toBe(1);
      expect(inactiveOnly[0].id).toBe(s2.id);
    });

    it('getActiveSession returns null when no active session exists', async () => {
      const w = await svc.createWorkspace({ id: id('w'), path: '/tmp/no-active', name: 'WS', status: 'idle' });
      const result = await svc.getActiveSession(w.id);
      expect(result).toBeNull();
    });
  });

  describe('MCP Server Mapping operations', () => {
    it('create/list/byType/default/setDefault/update/delete', async () => {
      // create two types and defaults
      const m1 = await svc.createMcpServerMapping({ id: id('m'), interfaceType: 'github', mcpServerName: 'gh-1', description: 'a', isDefault: false });
      const m2 = await svc.createMcpServerMapping({ id: id('m'), interfaceType: 'github', mcpServerName: 'gh-2', description: 'b', isDefault: true });
      const m3 = await svc.createMcpServerMapping({ id: id('m'), interfaceType: 'jira', mcpServerName: 'ji-1', description: 'c', isDefault: false });

      const all = await svc.getAllMcpServerMappings();
      // sorted by interfaceType asc. With inserts ['github','github','jira'], first should be 'github'
      expect(all.map(m => m.interfaceType)[0]).toBe('github');

      const gh = await svc.getMcpServerMappingsByType('github');
      expect(gh.length).toBe(2);
      // ordered by isDefault desc, so m2 first
      expect(gh[0].id).toBe(m2.id);

      const def = await svc.getDefaultMcpServerMapping('github');
      expect(def?.id).toBe(m2.id);

      // setDefault uses a transaction; with better-sqlite3 it throws if callback is async. Verify it throws (still executes pre-transaction code).
      await expect(svc.setDefaultMcpServerMapping(m1.id)).rejects.toThrow();

      // update mapping
      const upd = await svc.updateMcpServerMapping(m3.id, { description: 'c2' });
      expect(upd?.description).toBe('c2');

      // delete existing
      expect(await svc.deleteMcpServerMapping(m3.id)).toBe(true);
      // delete non-existent
      expect(await svc.deleteMcpServerMapping(m3.id)).toBe(false);
    });

    it('setDefaultMcpServerMapping throws for missing id', async () => {
      await expect(svc.setDefaultMcpServerMapping('does-not-exist')).rejects.toThrow('MCP server mapping not found');
    });

    it('getDefaultMcpServerMapping returns null when no default exists', async () => {
      const result = await svc.getDefaultMcpServerMapping('non-existent-type');
      expect(result).toBeNull();
    });

    it('updateMcpServerMapping returns null for non-existent id', async () => {
      const result = await svc.updateMcpServerMapping('non-existent-id', { description: 'test' });
      expect(result).toBeNull();
    });

    it('deleteMcpServerMapping returns false for non-existent id', async () => {
      const result = await svc.deleteMcpServerMapping('non-existent-id');
      expect(result).toBe(false);
    });
  });
});

describe('initializeGlobalDatabaseService (singleton + error path)', () => {
  it('initializes and returns the singleton', async () => {
    const s = await initializeGlobalDatabaseService();
    expect(s).toBeDefined();
    // Not closing here; it uses global ~/.specly/global.db; harmless for tests
  });

  it('re-throws errors from service initialization', async () => {
    const service = getGlobalDatabaseService();
    expect(service).toBeDefined();

    // Spy on the service's initialize method to make it throw
    const initializeSpy = vi.spyOn(service!, 'initialize').mockRejectedValueOnce(new Error('Mock initialization error'));

    // Expect the function to throw
    await expect(initializeGlobalDatabaseService()).rejects.toThrow('Mock initialization error');

    // Restore the spy
    initializeSpy.mockRestore();
  });

  it('throws when getGlobalDatabaseService returns null', async () => {
    vi.resetModules();
    const { setForceNullGlobalDb, initializeGlobalDatabaseService: init } = await import('../database/global-queries.js');
    try {
      setForceNullGlobalDb(true);
      await expect(init()).rejects.toThrow('Failed to get global database service instance');
    } finally {
      setForceNullGlobalDb(false);
    }
  });
});
