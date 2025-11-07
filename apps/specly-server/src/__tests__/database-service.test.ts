import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * DatabaseService tests focus on:
 * - Global service wiring and readiness checks
 * - Workspace service caching and readiness checks
 * - Cache invalidation
 * - Error-paths for readiness checks (no DB init, failing workspace init/getAllTasks)
 */

describe('DatabaseService', () => {
    let globalMgr: DrizzleDatabaseManager;
    let service: DatabaseService;
    let tmpWs: string;

    beforeEach(() => {
        globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        service = new DatabaseService(globalMgr);
        tmpWs = mkdtempSync(join(tmpdir(), 'db-service-test-'));
    });

    afterEach(async () => {
        try { rmSync(tmpWs, { recursive: true, force: true }); } catch { }
        // Close the manager if it was initialized
        if (globalMgr.initialized) {
            await globalMgr.close();
        }
        vi.restoreAllMocks();
    });

    it('getGlobal returns a GlobalDatabaseService bound to provided manager', async () => {
        const global = service.getGlobal();
        expect(global).toBeInstanceOf(GlobalDatabaseService);

        // The manager returned by the service should be our original one
        const mgrFromService = global.getDrizzleManager();
        expect(mgrFromService).toBe(globalMgr);

        // When initialized, readiness should reflect true
        await globalMgr.initialize();
        await expect(service.isGlobalReady()).resolves.toBe(true);
    });

    it('isGlobalReady returns false when global DB is not initialized', async () => {
        // getDb() will throw inside GlobalDatabaseService, which is caught by DatabaseService
        await expect(service.isGlobalReady()).resolves.toBe(false);
    });

    it('getWorkspace caches WorkspaceDatabaseService instances per path', async () => {
        const ws1 = await service.getWorkspace(tmpWs);
        expect(ws1).toBeInstanceOf(WorkspaceDatabaseService);

        // Ensure DB functions without throwing (implicitly validates initialize())
        await expect(ws1.getAllTasks()).resolves.toEqual([]);

        // Second call for same path returns the exact same instance
        const ws1Again = await service.getWorkspace(tmpWs);
        expect(ws1Again).toBe(ws1);
    });

    it('clearWorkspaceCache invalidates cache so a new instance is created', async () => {
        const first = await service.getWorkspace(tmpWs);
        service.clearWorkspaceCache();
        const second = await service.getWorkspace(tmpWs);
        expect(second).toBeInstanceOf(WorkspaceDatabaseService);
        expect(second).not.toBe(first);
    });

    it('isWorkspaceReady returns true when workspace DB is initialized', async () => {
        // First ensure the workspace is created and initialized
        await service.getWorkspace(tmpWs);
        await expect(service.isWorkspaceReady(tmpWs)).resolves.toBe(true);
    });

    it('isWorkspaceReady returns false when workspace getAllTasks throws', async () => {
        const ws = await service.getWorkspace(tmpWs);
        // Force the next getAllTasks call to throw
        const spy = vi.spyOn(WorkspaceDatabaseService.prototype, 'getAllTasks').mockImplementationOnce(async () => {
            throw new Error('boom');
        });
        await expect(service.isWorkspaceReady(tmpWs)).resolves.toBe(false);
        expect(spy).toHaveBeenCalled();
    });

    it('isWorkspaceReady returns false when workspace initialization fails', async () => {
        // Use a workspacePath that will fail during initialization
        const badPath = '/dev/null'; // not a directory, creating nested path should fail
        await expect(service.isWorkspaceReady(badPath)).resolves.toBe(false);
    });
});
