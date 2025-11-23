import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseManager, DatabaseType, getGlobalDatabase, getWorkspaceDatabase, resetGlobalInstances } from '../../database/connection.js';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import sqlite3 from 'sqlite3';

// Mock dependencies
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('')
}));

vi.mock('sqlite3', () => {
    const mDatabase = vi.fn();
    (mDatabase as any).verbose = vi.fn();
    return {
        default: {
            Database: mDatabase,
            verbose: vi.fn()
        }
    };
});

describe('DatabaseManager Coverage', () => {
    let mockDb: any;

    beforeEach(() => {
        vi.clearAllMocks();
        resetGlobalInstances();

        mockDb = {
            run: vi.fn((sql, params, cb) => { if (typeof params === 'function') params(null); else if (cb) cb(null); }),
            all: vi.fn((sql, params, cb) => { if (typeof params === 'function') params(null, []); else if (cb) cb(null, []); }),
            get: vi.fn((sql, params, cb) => { if (typeof params === 'function') params(null, null); else if (cb) cb(null, null); }),
            exec: vi.fn((sql, cb) => { if (cb) cb(null); }),
            close: vi.fn((cb) => { if (cb) cb(null); })
        };

        (sqlite3.Database as any).mockImplementation((path: string, cb: any) => {
            if (cb) cb(null);
            return mockDb;
        });
    });

    it('should initialize memory database', async () => {
        const db = new DatabaseManager(':memory:', DatabaseType.GLOBAL);
        await db.initialize();
        expect(sqlite3.Database).toHaveBeenCalledWith(':memory:', expect.any(Function));
        expect(db.isReady()).toBe(true);
    });

    it('should initialize file database and create directory', async () => {
        vi.mocked(existsSync).mockReturnValue(false);
        const db = new DatabaseManager('/path/to/db.sqlite', DatabaseType.WORKSPACE);
        await db.initialize();
        expect(mkdirSync).toHaveBeenCalledWith('/path/to', { recursive: true });
        expect(sqlite3.Database).toHaveBeenCalledWith('/path/to/db.sqlite', expect.any(Function));
    });

    it('should not re-initialize if already initialized', async () => {
        const db = new DatabaseManager();
        await db.initialize();
        (sqlite3.Database as any).mockClear();
        await db.initialize();
        expect(sqlite3.Database).not.toHaveBeenCalled();
    });

    it('should handle initialization failure', async () => {
        (sqlite3.Database as any).mockImplementationOnce((path: string, cb: any) => {
            if (cb) cb(new Error('DB Init Fail'));
            return mockDb;
        });
        const db = new DatabaseManager();
        await expect(db.initialize()).rejects.toThrow('DB Init Fail');
    });

    it('should throw if getting db before initialization', () => {
        const db = new DatabaseManager();
        expect(() => db.getDb()).toThrow('Database not initialized');
    });

    it('should close database', async () => {
        const db = new DatabaseManager();
        await db.initialize();
        await db.close();
        expect(mockDb.close).toHaveBeenCalled();
        expect(db.isReady()).toBe(false);
    });

    it('should handle transaction rollback', async () => {
        const db = new DatabaseManager();
        await db.initialize();

        mockDb.run.mockImplementation((sql: string, params: any, cb: any) => {
            const callback = typeof params === 'function' ? params : cb;
            if (sql.includes('INSERT')) {
                callback(new Error('Insert Fail'));
            } else {
                callback(null);
            }
        });

        await expect(db.transaction([{ sql: 'INSERT INTO t VALUES(1)' }])).rejects.toThrow('Insert Fail');
        // Should have called ROLLBACK
        expect(mockDb.run).toHaveBeenCalledWith('ROLLBACK', expect.anything());
    });

    it('should filter schema correctly', async () => {
        const schema = `
-- @global-only
CREATE TABLE global (id INT);
-- @end
-- @workspace-only
CREATE TABLE workspace (id INT);
-- @end
CREATE TABLE shared (id INT);
    `;
        vi.mocked(readFileSync).mockReturnValue(schema);

        const dbGlobal = new DatabaseManager(':memory:', DatabaseType.GLOBAL);
        await dbGlobal.initialize();
        expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE global'), expect.anything());
        expect(mockDb.exec).not.toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE workspace'), expect.anything());
        expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE shared'), expect.anything());

        (mockDb.exec as any).mockClear();

        const dbWorkspace = new DatabaseManager(':memory:', DatabaseType.WORKSPACE);
        await dbWorkspace.initialize();
        expect(mockDb.exec).not.toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE global'), expect.anything());
        expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE workspace'), expect.anything());
        expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE shared'), expect.anything());
    });

    it('should manage global singleton', () => {
        const db1 = getGlobalDatabase();
        const db2 = getGlobalDatabase();
        expect(db1).toBe(db2);
    });

    it('should manage workspace singleton', () => {
        const db1 = getWorkspaceDatabase('/path/1');
        const db2 = getWorkspaceDatabase('/path/1'); // Returns same instance regardless of path if already set (implementation quirk?)
        // Wait, implementation:
        // if (!workspaceDbInstance) { workspaceDbInstance = ... }
        // return workspaceDbInstance;
        // So it is a SINGLETON, not a map like DrizzleDatabaseManager.
        // So getWorkspaceDatabase('/path/2') returns the SAME instance as '/path/1' if already initialized.

        expect(db1).toBe(db2);

        const db3 = getWorkspaceDatabase('/path/2');
        expect(db1).toBe(db3);
    });

    it('should execute run, all, get', async () => {
        const db = new DatabaseManager();
        await db.initialize();

        await db.run('SQL');
        expect(mockDb.run).toHaveBeenCalled();

        await db.all('SQL');
        expect(mockDb.all).toHaveBeenCalled();

        await db.get('SQL');
        expect(mockDb.get).toHaveBeenCalled();
    });
});
