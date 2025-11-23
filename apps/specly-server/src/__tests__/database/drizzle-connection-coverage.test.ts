import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DrizzleDatabaseManager, DatabaseType, getGlobalDatabase, getWorkspaceDatabase, clearGlobalDatabaseInstance, clearWorkspaceDatabaseCache } from '../../database/drizzle-connection.js';
import { existsSync, mkdirSync } from 'fs';
import Database from 'better-sqlite3';

// Mock dependencies
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn()
}));

vi.mock('better-sqlite3', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            pragma: vi.fn(),
            exec: vi.fn(),
            prepare: vi.fn().mockReturnValue({ get: vi.fn() }),
            close: vi.fn()
        }))
    };
});

vi.mock('drizzle-orm/better-sqlite3', () => ({
    drizzle: vi.fn().mockReturnValue({})
}));

vi.mock('@omar391/mcp-kit/utils/cli-parser', () => ({
    isStdioMode: vi.fn().mockReturnValue(false)
}));

describe('DrizzleDatabaseManager Coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGlobalDatabaseInstance();
        clearWorkspaceDatabaseCache();
    });

    it('should initialize memory database', async () => {
        const db = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        await db.initialize();
        expect(Database).toHaveBeenCalledWith(':memory:');
        expect(db.initialized).toBe(true);
        expect(db.getConnectionInfo().hasDb).toBe(true);
    });

    it('should initialize file database and create directory', async () => {
        vi.mocked(existsSync).mockReturnValue(false);
        const db = new DrizzleDatabaseManager('/path/to/db.sqlite', DatabaseType.WORKSPACE);
        await db.initialize();
        expect(mkdirSync).toHaveBeenCalledWith('/path/to', { recursive: true });
        expect(Database).toHaveBeenCalledWith('/path/to/db.sqlite');
    });

    it('should not re-initialize if already initialized', async () => {
        const db = new DrizzleDatabaseManager();
        await db.initialize();
        (Database as any).mockClear();
        await db.initialize();
        expect(Database).not.toHaveBeenCalled();
    });

    it('should handle initialization failure', async () => {
        (Database as any).mockImplementationOnce(() => { throw new Error('DB Init Fail'); });
        const db = new DrizzleDatabaseManager();
        await expect(db.initialize()).rejects.toThrow('DB Init Fail');
    });

    it('should throw if getting db/sqlite before initialization', () => {
        const db = new DrizzleDatabaseManager();
        expect(() => db.getDb()).toThrow('Database not initialized');
        expect(() => db.getSqlite()).toThrow('Database not initialized');
    });

    it('should close database', async () => {
        const db = new DrizzleDatabaseManager();
        await db.initialize();
        const sqlite = db.getSqlite();
        await db.close();
        expect(sqlite.close).toHaveBeenCalled();
        expect(db.initialized).toBe(false);
    });

    it('should handle legacy tasks migration', async () => {
        const db = new DrizzleDatabaseManager(':memory:', DatabaseType.WORKSPACE);

        // Mock sqlite for migration check
        const mockExec = vi.fn();
        const mockGet = vi.fn()
            .mockReturnValueOnce({ sql: "CREATE TABLE tasks (status CHECK (status IN ('backlog', 'in-progress')))" }); // Trigger migration

        (Database as any).mockImplementation(() => ({
            pragma: vi.fn(),
            exec: mockExec,
            prepare: vi.fn().mockReturnValue({ get: mockGet }),
            close: vi.fn()
        }));

        await db.initialize();

        // Verify migration SQL was executed
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE tasks_migrated'));
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tasks_migrated'));
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('DROP TABLE tasks'));
    });

    it('should handle legacy tasks migration check failure', async () => {
        const db = new DrizzleDatabaseManager(':memory:', DatabaseType.WORKSPACE);

        (Database as any).mockImplementation(() => ({
            pragma: vi.fn(),
            exec: vi.fn(),
            prepare: vi.fn().mockImplementation(() => { throw new Error('Prepare Fail'); }),
            close: vi.fn()
        }));

        // Should not throw, just log warning
        await db.initialize();
    });

    it('should handle backfill column errors', async () => {
        const db = new DrizzleDatabaseManager(':memory:', DatabaseType.WORKSPACE);

        const mockExec = vi.fn();
        // First call ok, second throws duplicate, third throws other error
        mockExec
            .mockImplementationOnce(() => { })
            .mockImplementationOnce(() => { throw new Error('duplicate column name'); })
            .mockImplementationOnce(() => { throw new Error('other error'); });

        (Database as any).mockImplementation(() => ({
            pragma: vi.fn(),
            exec: mockExec,
            prepare: vi.fn().mockReturnValue({ get: vi.fn() }),
            close: vi.fn()
        }));

        await db.initialize();
        // Should not throw
    });

    it('should manage global singleton', () => {
        const db1 = getGlobalDatabase();
        const db2 = getGlobalDatabase();
        expect(db1).toBe(db2);
        expect(db1.getConnectionInfo().dbPath).toContain('global.db');
    });

    it('should manage workspace cache', () => {
        const db1 = getWorkspaceDatabase('/path/1');
        const db2 = getWorkspaceDatabase('/path/1');
        const db3 = getWorkspaceDatabase('/path/2');
        expect(db1).toBe(db2);
        expect(db1).not.toBe(db3);
    });

    it('should throw if runProgrammaticMigrations called without sqlite', async () => {
        const db = new DrizzleDatabaseManager();
        // Access private method via cast
        await expect((db as any).runProgrammaticMigrations()).rejects.toThrow('SQLite connection not available');
    });
});
