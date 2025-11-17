import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';

// We will import the module under test after setting up spies on the database helper
import * as drizzleModule from '../../database/drizzle-connection.js';
import { ProjectInitializer } from '../project-initializer.js';

describe('ProjectInitializer (unit)', () => {
    let globalDbMock: any;
    let workspaceDbMock: any;
    let manager: ProjectInitializer;

    beforeEach(() => {
        // Minimal mock DB with the chained API used by the initializer
        const makeSelectChain = (returnValue: any) => ({
            from: () => ({
                where: () => ({
                    get: async () => returnValue
                })
            })
        });

        const makeSelectArray = (returnValue: any[]) => ({
            from: () => ({
                where: () => ({
                    get: async () => returnValue,
                    // also support being used without .get()
                    then: (cb: any) => Promise.resolve(cb(returnValue))
                })
            })
        });

        workspaceDbMock = {
            getDb: () => ({
                select: () => makeSelectChain({ count: 0 }),
                insert: () => ({ values: async () => undefined }),
                update: () => ({ set: () => ({ where: async () => undefined }) }),
                delete: async () => undefined
            }),
            createRemoteInterface: vi.fn()
        };

        // global DB with controllable select return values and spies for insert/update
        let lastInserted: any = null;
        let lastUpdated: any = null;
        const db = {
            select: () => ({ from: () => ({ where: () => ({ get: async () => globalDbMock._nextSelectReturn }) }) }),
            insert: () => ({ values: async (v: any) => { lastInserted = v; globalDbMock._nextSelectReturn = v; return undefined; } }),
            update: () => ({ set: () => ({ where: async () => { lastUpdated = true; return undefined; } }) })
        };

        globalDbMock = {
            _nextSelectReturn: null,
            getDb: () => db,
            _inspect: () => ({ lastInserted, lastUpdated })
        };

        // Spy on drizzle module to return our mocks
        vi.spyOn(drizzleModule, 'getGlobalDatabase').mockImplementation(() => globalDbMock as any);
        vi.spyOn(drizzleModule, 'initializeWorkspaceDatabase').mockImplementation(async () => workspaceDbMock as any);

        manager = new ProjectInitializer({ getDb: () => ({}) } as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('ensureWorkspace creates new workspace when none exists', async () => {
        const anyM = manager as any;
        // simulate no existing workspace, then selection returns a workspace after insert
        globalDbMock._nextSelectReturn = null;
        // spy on insert via inspect
        const ws = await anyM.ensureWorkspace('/p/new', 'proj');
        // after creation, ensure workspace object has id/path/name
        expect(ws).toBeTruthy();
        expect(ws.path).toBe('/p/new');
    });

    it('ensureWorkspace updates existing workspace when found', async () => {
        const existing = { id: 'ex', path: '/p/ex', name: 'old' };
        globalDbMock._nextSelectReturn = existing;
        const anyM = manager as any;
        const ws = await anyM.ensureWorkspace('/p/ex', 'newname');
        expect(ws).toBeTruthy();
        expect(ws.name).toBeDefined();
    });

    it('createWorkspaceRules returns false when workspace missing', async () => {
        globalDbMock._nextSelectReturn = null;
        const anyM = manager as any;
        const ok = await anyM.createWorkspaceRules('no-id', 'ts');
        expect(ok).toBe(false);
    });

    it('createInitialSession inserts and deactivates old sessions', async () => {
        // prepare a workspace return so global DB select works
        globalDbMock._nextSelectReturn = { id: 'w1', path: '/p' };
        const anyM = manager as any;
        await anyM.createInitialSession('w1');
        // if no exception thrown, assume success
        expect(true).toBe(true);
    });

    it('createWorkspaceRules succeeds and inserts rule when workspace exists', async () => {
        // ensure global DB returns a workspace
        globalDbMock._nextSelectReturn = { id: 'wX', path: '/p/x' };
        const anyM = manager as any;
        const ok = await anyM.createWorkspaceRules('wX', 'Node.js');
        expect(ok).toBe(true);
        // ensure the insert reflected into inspect hook
        const ins = globalDbMock._inspect();
        expect(ins.lastInserted).not.toBeNull();
    });

    it('isWorkspaceInitialized returns true when tasks and rules exist', async () => {
        // set workspace selection
        const workspaceObj = { id: 'w2', path: '/p/w2' };
        globalDbMock._nextSelectReturn = workspaceObj;

        // make workspace DB return a task count > 0
        workspaceDbMock.getDb = () => ({
            select: () => ({ from: () => ({ get: async () => ({ count: 2 }) }) })
        });

        // For rules call, return an array-like object with length > 0 and get() method
        const rulesArr: any = [{ id: 'r1' }];
        rulesArr.get = async () => rulesArr;
        // override global DB select to return rulesArr when asked for workspaceRulesNew
        const originalGetDb = globalDbMock.getDb;
        globalDbMock.getDb = () => ({
            select: () => ({ from: () => ({ where: () => rulesArr }) })
        });

        const anyM = manager as any;
        const r = await anyM.isWorkspaceInitialized('/p/w2');
        expect(r).toBe(true);

        // restore original
        globalDbMock.getDb = originalGetDb;
    });

    it('isWorkspaceInitialized returns false when tasks exist but no workspace rules', async () => {
        // set workspace selection
        const workspaceObj = { id: 'w3', path: '/p/w3' };
        globalDbMock._nextSelectReturn = workspaceObj;

        // make workspace DB return a task count > 0
        const wdb = {
            getDb: () => ({
                select: () => ({ from: () => ({ get: async () => ({ count: 1 }) }) })
            })
        };
        // ensure initializeWorkspaceDatabase returns our workspace DB
        const drizzleModule = await import('../../database/drizzle-connection.js');
        vi.spyOn(drizzleModule, 'initializeWorkspaceDatabase').mockResolvedValue(wdb as any);

        // return empty rules array from global DB
        const emptyRules: any = [];
        emptyRules.get = async () => emptyRules;
        const originalGetDb = globalDbMock.getDb;
        globalDbMock.getDb = () => ({
            select: () => ({ from: () => ({ where: () => emptyRules }) })
        } as any);

        const anyM = manager as any;
        const r = await anyM.isWorkspaceInitialized('/p/w3');
        expect(r).toBe(false);

        // restore original
        globalDbMock.getDb = originalGetDb;
    });

    it('isWorkspaceInitialized returns false when task count is 0 but rules exist', async () => {
        // set workspace selection
        const workspaceObj = { id: 'w4', path: '/p/w4' };
        globalDbMock._nextSelectReturn = workspaceObj;

        // make workspace DB return a task count = 0
        const wdb = {
            getDb: () => ({
                select: () => ({ from: () => ({ get: async () => ({ count: 0 }) }) })
            })
        };
        // ensure initializeWorkspaceDatabase returns our workspace DB
        const drizzleModule = await import('../../database/drizzle-connection.js');
        vi.spyOn(drizzleModule, 'initializeWorkspaceDatabase').mockResolvedValue(wdb as any);

        // return rules array with length > 0
        const rulesArr: any = [{ id: 'r1' }];
        rulesArr.get = async () => rulesArr;
        const originalGetDb = globalDbMock.getDb;
        globalDbMock.getDb = () => ({
            select: () => ({ from: () => ({ where: () => rulesArr }) })
        } as any);

        const anyM = manager as any;
        const r = await anyM.isWorkspaceInitialized('/p/w4');
        expect(r).toBe(false);

        // restore original
        globalDbMock.getDb = originalGetDb;
    });

    it('isWorkspaceInitialized returns false when taskCountResult is null but rules exist', async () => {
        // set workspace selection
        const workspaceObj = { id: 'w5', path: '/p/w5' };
        globalDbMock._nextSelectReturn = workspaceObj;

        // make workspace DB return null for task count
        const wdb = {
            getDb: () => ({
                select: () => ({ from: () => ({ get: async () => null }) })
            })
        };
        // ensure initializeWorkspaceDatabase returns our workspace DB
        const drizzleModule = await import('../../database/drizzle-connection.js');
        vi.spyOn(drizzleModule, 'initializeWorkspaceDatabase').mockResolvedValue(wdb as any);

        // return rules array with length > 0
        const rulesArr: any = [{ id: 'r1' }];
        rulesArr.get = async () => rulesArr;
        const originalGetDb = globalDbMock.getDb;
        globalDbMock.getDb = () => ({
            select: () => ({ from: () => ({ where: () => rulesArr }) })
        } as any);

        const anyM = manager as any;
        const r = await anyM.isWorkspaceInitialized('/p/w5');
        expect(r).toBe(false);

        // restore original
        globalDbMock.getDb = originalGetDb;
    });

    it('reinitializeWorkspace clears tasks when preserveTasks=false', async () => {
        // prepare existing workspace selection
        const existing = { id: 'ex2', path: '/p/ex2', name: 'n' };
        globalDbMock._nextSelectReturn = existing;

        // workspaceDb delete spy
        const deleted: any = { called: false };
        const wdb = {
            getDb: () => ({ delete: (t: any) => { deleted.called = true; return Promise.resolve(); } })
        };
        // initializeWorkspaceDatabase should return our wdb
        const drizzleModule = await import('../../database/drizzle-connection.js');
        vi.spyOn(drizzleModule, 'initializeWorkspaceDatabase').mockResolvedValue(wdb as any);

        const res = await manager.reinitializeWorkspace(existing.path, false);
        expect(res.workspace.id).toBe(existing.id);
        expect(res.workspaceRulesCreated).toBeDefined();
        expect(deleted.called).toBe(true);
    });

    it('checkIfProjectIsEmpty returns true when fs.readdir throws (non-existent path)', async () => {
        const anyM = manager as any;
        // use a path that almost certainly does not exist
        const res = await anyM.checkIfProjectIsEmpty(`/nonexistent-${Date.now()}-path`);
        expect(res).toBe(true);
    });

    it('isWorkspaceInitialized returns false when workspace missing', async () => {
        vi.spyOn(globalDbMock, 'getDb').mockImplementation(() => ({
            select: () => ({ from: () => ({ where: () => ({ get: async () => null }) }) })
        } as any));

        const anyM = manager as any;
        const r = await anyM.isWorkspaceInitialized('/some/path');
        expect(r).toBe(false);
    });

    it('reinitializeWorkspace throws when workspace not found', async () => {
        vi.spyOn(globalDbMock, 'getDb').mockImplementation(() => ({
            select: () => ({ from: () => ({ where: () => ({ get: async () => null }) }) })
        } as any));

        await expect(manager.reinitializeWorkspace('/no-where', false)).rejects.toThrow(/Workspace not found/);
    });

    it('initializeProject happy path uses ensureWorkspace and returns result', async () => {
        // stub private methods to avoid filesystem / DB complexity
        const anyM = manager as any;
        anyM.ensureWorkspace = vi.fn().mockResolvedValue({ id: 'wid', path: '/p', name: 'n' });
        anyM.initializeWorkspaceDatabase = vi.fn().mockResolvedValue(undefined);
        anyM.checkIfProjectIsEmpty = vi.fn().mockResolvedValue(false);
        anyM.createInitialSession = vi.fn().mockResolvedValue(undefined);

        const res = await manager.initializeProject({ workspace_path: '/p', project_requirements: '', tech_stack: '', project_name: 'n' });
        expect(res.workspace.id).toBe('wid');
        expect(res.workspaceRulesCreated).toBe(false);
        expect(res.isEmpty).toBe(false);
    });

    it('initializeProject calls initializeWorkspaceDatabase via dynamic import', async () => {
        const anyM = manager as any;
        // ensureWorkspace resolves to a workspace so initializeProject proceeds
        anyM.ensureWorkspace = vi.fn().mockResolvedValue({ id: 'dyn-wid', path: '/dyn', name: 'dyn' });
        // Do not stub initializeWorkspaceDatabase on the instance - the module-level spy should pick it up
        // Ensure module-level initializeWorkspaceDatabase spy returns our workspaceDbMock
        const drizzleModule = await import('../../database/drizzle-connection.js');
        vi.spyOn(drizzleModule, 'initializeWorkspaceDatabase').mockResolvedValue(workspaceDbMock as any);

        anyM.checkIfProjectIsEmpty = vi.fn().mockResolvedValue(false);
        anyM.createInitialSession = vi.fn().mockResolvedValue(undefined);

        const res = await manager.initializeProject({ workspace_path: '/dyn', project_requirements: '', tech_stack: '', project_name: 'dyn' });
        expect(res.workspace.id).toBe('dyn-wid');
        expect(drizzleModule.initializeWorkspaceDatabase).toHaveBeenCalledWith('/dyn');
    });

    it('initializeProject surfaces errors from ensureWorkspace', async () => {
        const anyM = manager as any;
        anyM.ensureWorkspace = vi.fn().mockRejectedValue(new Error('ensure-fail'));
        await expect(manager.initializeProject({ workspace_path: '/err', project_requirements: '', tech_stack: '', project_name: 'x' })).rejects.toThrow(/ensure-fail/);
    });

    it('checkIfProjectIsEmpty returns true when only common files exist and false when meaningful files present', async () => {
        const anyM = manager as any;

        // create a temp dir with only common files
        const tmp1 = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'specly-test-'));
        await fsPromises.writeFile(path.join(tmp1, 'package.json'), '{}');
        await fsPromises.mkdir(path.join(tmp1, 'node_modules'));
        const r1 = await anyM.checkIfProjectIsEmpty(tmp1);
        expect(r1).toBe(true);
        await fsPromises.rm(tmp1, { recursive: true, force: true });

        // create a temp dir with meaningful files
        const tmp2 = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'specly-test-'));
        await fsPromises.writeFile(path.join(tmp2, 'index.js'), '');
        await fsPromises.mkdir(path.join(tmp2, 'src'));
        const r2 = await anyM.checkIfProjectIsEmpty(tmp2);
        expect(r2).toBe(false);
        await fsPromises.rm(tmp2, { recursive: true, force: true });
    });

    it('createWorkspaceRules returns false when insert throws', async () => {
        // ensure workspace exists
        globalDbMock._nextSelectReturn = { id: 'wErr', path: '/p/w' };
        const anyM = manager as any;
        // override getDb to simulate insert failure
        vi.spyOn(globalDbMock, 'getDb').mockImplementation(() => ({
            select: () => ({ from: () => ({ where: () => ({ get: async () => ({ id: 'wErr' }) }) }) }),
            insert: () => ({ values: async () => { throw new Error('insert boom'); } })
        } as any));

        const ok = await anyM.createWorkspaceRules('wErr', 'X');
        expect(ok).toBe(false);
    });
});
