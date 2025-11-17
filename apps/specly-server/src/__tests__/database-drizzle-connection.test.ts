import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DrizzleDatabaseManager, DatabaseType, getGlobalDatabase, getWorkspaceDatabase, clearGlobalDatabaseInstance, initializeGlobalDatabase, initializeWorkspaceDatabase, initializeBothDatabases } from '../database/drizzle-connection';
import { clearWorkspaceDatabaseCache } from '../database/drizzle-connection.ts';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

// Mock better-sqlite3 and fs
vi.mock('better-sqlite3', async () => {
  const mockDb = {
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn(() => ({
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn()
    })),
    close: vi.fn()
  };

  return {
    default: vi.fn(() => mockDb)
  };
});

vi.mock('fs', async () => {
  return {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn()
  };
});

vi.mock('drizzle-orm/better-sqlite3', async () => {
  return {
    drizzle: vi.fn(() => ({
      transaction: vi.fn((callback) => callback())
    }))
  };
});

vi.mock('drizzle-orm/better-sqlite3/migrator', async () => {
  return {
    migrate: vi.fn()
  };
});

vi.mock('../utils/cli-parser.js', async () => {
  return {
    isStdioMode: vi.fn(() => false)
  };
});

describe('DrizzleDatabaseManager', () => {
  let manager: DrizzleDatabaseManager;
  let mockSqlite: any;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSqlite = {
      pragma: vi.fn(),
      exec: vi.fn(),
      prepare: vi.fn(() => ({
        get: vi.fn(),
        all: vi.fn(),
        run: vi.fn()
      })),
      close: vi.fn()
    };
    mockDb = {
      transaction: vi.fn((callback) => callback())
    };

    (Database as any).mockReturnValue(mockSqlite);
  });

  afterEach(() => {
    clearWorkspaceDatabaseCache();
  });

  describe('constructor', () => {
    it('creates instance with default parameters', () => {
      manager = new DrizzleDatabaseManager();
      expect(manager).toBeInstanceOf(DrizzleDatabaseManager);
    });

    it('creates instance with custom path and type', () => {
      manager = new DrizzleDatabaseManager('/custom/path.db', DatabaseType.GLOBAL);
      expect(manager).toBeInstanceOf(DrizzleDatabaseManager);
    });
  });

  describe('getConnectionInfo', () => {
    it('returns connection info when not initialized', () => {
      manager = new DrizzleDatabaseManager('/test.db');
      const info = manager.getConnectionInfo();
      expect(info).toEqual({
        hasDb: false,
        hasSqlite: false,
        dbPath: '/test.db'
      });
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      manager = new DrizzleDatabaseManager(':memory:', DatabaseType.WORKSPACE);
      (existsSync as any).mockReturnValue(true);
    });

    it('initializes successfully for workspace database', async () => {
      await manager.initialize();
      expect(manager.initialized).toBe(true);
      expect(Database).toHaveBeenCalledWith(':memory:');
      expect(mockSqlite.pragma).toHaveBeenCalledWith('foreign_keys = ON');
    });

    it('initializes successfully for global database', async () => {
      manager = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
      await manager.initialize();
      expect(manager.initialized).toBe(true);
    });

    it('creates directory for file-based databases', async () => {
      manager = new DrizzleDatabaseManager('/path/to/db.db');
      (existsSync as any).mockReturnValue(false);
      await manager.initialize();
      expect(mkdirSync).toHaveBeenCalledWith('/path/to', { recursive: true });
    });

    it('skips directory creation for memory databases', async () => {
      await manager.initialize();
      expect(mkdirSync).not.toHaveBeenCalled();
    });

    it('throws error when SQLite connection fails', async () => {
      (Database as any).mockImplementation(() => {
        throw new Error('Connection failed');
      });
      await expect(manager.initialize()).rejects.toThrow('Connection failed');
    });

    it('runs programmatic migrations', async () => {
      await manager.initialize();
      expect(mockSqlite.exec).toHaveBeenCalled();
    });

    it('handles migration errors gracefully', async () => {
      mockSqlite.exec.mockImplementation(() => {
        throw new Error('Migration failed');
      });
      await expect(manager.initialize()).rejects.toThrow('Migration failed');
    });
  });

  describe('runProgrammaticMigrations', () => {
    beforeEach(async () => {
      manager = new DrizzleDatabaseManager(':memory:', DatabaseType.WORKSPACE);
      await manager.initialize();
    });

    it('creates workspace tables', async () => {
      expect(mockSqlite.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS tasks'));
    });

    it('creates global tables for GLOBAL type', async () => {
      manager = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
      await manager.initialize();
      expect(mockSqlite.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS workspaces'));
    });

    it('throws error when SQLite connection not available', async () => {
      manager = new DrizzleDatabaseManager(':memory:', DatabaseType.WORKSPACE);
      // Call runProgrammaticMigrations without initializing (sqlite is null)
      await expect((manager as any).runProgrammaticMigrations()).rejects.toThrow('SQLite connection not available');
    });

    it('handles legacy table migration', async () => {
      manager = new DrizzleDatabaseManager(':memory:', DatabaseType.WORKSPACE);
      mockSqlite.prepare.mockReturnValue({
        get: vi.fn(() => ({ sql: "CREATE TABLE tasks (status TEXT CHECK(status IN ('backlog', 'in-progress')))" }))
      });
      await manager.initialize();
      // Should have run migration SQL with transaction
      expect(mockSqlite.exec).toHaveBeenCalledWith(expect.stringContaining('BEGIN TRANSACTION'));
      expect(mockSqlite.exec).toHaveBeenCalledWith(expect.stringContaining('COMMIT'));
    });

    it('handles alter table statements', async () => {
      mockSqlite.exec.mockImplementation((sql: string) => {
        if (sql.includes('ALTER TABLE')) {
          throw new Error('duplicate column name');
        }
      });
      await manager.initialize();
      // Should not throw due to duplicate column handling
    });

    it('logs warnings for unexpected alter errors', async () => {
      manager = new DrizzleDatabaseManager(':memory:', DatabaseType.WORKSPACE);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSqlite.exec.mockImplementation((sql: string) => {
        if (sql.includes('ALTER TABLE')) {
          throw new Error('unexpected error');
        }
      });
      await manager.initialize();
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getDb', () => {
    it('throws error when not initialized', () => {
      manager = new DrizzleDatabaseManager();
      expect(() => manager.getDb()).toThrow('Database not initialized');
    });

    it('returns db instance when initialized', async () => {
      manager = new DrizzleDatabaseManager();
      await manager.initialize();
      expect(manager.getDb()).toBeDefined();
    });
  });

  describe('getSqlite', () => {
    it('throws error when not initialized', () => {
      manager = new DrizzleDatabaseManager();
      expect(() => manager.getSqlite()).toThrow('Database not initialized');
    });

    it('returns sqlite instance when initialized', async () => {
      manager = new DrizzleDatabaseManager();
      await manager.initialize();
      expect(manager.getSqlite()).toBe(mockSqlite);
    });
  });

  describe('close', () => {
    it('closes connections and resets state', async () => {
      manager = new DrizzleDatabaseManager();
      await manager.initialize();
      await manager.close();
      expect(mockSqlite.close).toHaveBeenCalled();
      expect(manager.isReady()).toBe(false);
    });

    it('handles close when not initialized', async () => {
      manager = new DrizzleDatabaseManager();
      await manager.close();
      expect(mockSqlite.close).not.toHaveBeenCalled();
    });
  });

  describe('isReady', () => {
    it('returns false when not initialized', () => {
      manager = new DrizzleDatabaseManager();
      expect(manager.isReady()).toBe(false);
    });

    it('returns true when initialized', async () => {
      manager = new DrizzleDatabaseManager();
      await manager.initialize();
      expect(manager.isReady()).toBe(true);
    });
  });

  describe('transaction', () => {
    it('executes callback within transaction', async () => {
      manager = new DrizzleDatabaseManager();
      await manager.initialize();

      const callback = vi.fn().mockResolvedValue('result');
      const result = await manager.transaction(callback);

      expect(callback).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('throws error when not initialized', async () => {
      manager = new DrizzleDatabaseManager();
      await expect(manager.transaction(vi.fn())).rejects.toThrow('Database not initialized');
    });
  });
});

describe('Global Database Functions', () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = '/tmp/test-home';
    clearWorkspaceDatabaseCache();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  describe('getGlobalDatabase', () => {
    it('returns DrizzleDatabaseManager instance', () => {
      const db = getGlobalDatabase();
      expect(db).toBeInstanceOf(DrizzleDatabaseManager);
    });

    it('returns same instance on multiple calls', () => {
      const db1 = getGlobalDatabase();
      const db2 = getGlobalDatabase();
      expect(db1).toBe(db2);
    });

    it('uses fallback path when HOME is undefined', () => {
      // Clear the cached instance
      clearGlobalDatabaseInstance();
      const originalHome = process.env.HOME;
      process.env.HOME = undefined;
      
      const db = getGlobalDatabase();
      expect(db).toBeInstanceOf(DrizzleDatabaseManager);
      
      // Restore
      process.env.HOME = originalHome;
    });
  });

  describe('getWorkspaceDatabase', () => {
    it('returns DrizzleDatabaseManager instance', () => {
      const db = getWorkspaceDatabase('/tmp/workspace');
      expect(db).toBeInstanceOf(DrizzleDatabaseManager);
    });

    it('returns cached instance for same workspace', () => {
      const db1 = getWorkspaceDatabase('/tmp/workspace');
      const db2 = getWorkspaceDatabase('/tmp/workspace');
      expect(db1).toBe(db2);
    });

    it('returns different instances for different workspaces', () => {
      const db1 = getWorkspaceDatabase('/tmp/workspace1');
      const db2 = getWorkspaceDatabase('/tmp/workspace2');
      expect(db1).not.toBe(db2);
    });
  });

  describe('clearWorkspaceDatabaseCache', () => {
    it('clears cached instances', () => {
      const db1 = getWorkspaceDatabase('/tmp/workspace');
      clearWorkspaceDatabaseCache();
      const db2 = getWorkspaceDatabase('/tmp/workspace');
      expect(db1).not.toBe(db2);
    });
  });

  describe('initializeGlobalDatabase', () => {
    it('initializes and returns global database', async () => {
      const db = await initializeGlobalDatabase();
      expect(db).toBeInstanceOf(DrizzleDatabaseManager);
      expect(db.initialized).toBe(true);
    });
  });

  describe('initializeWorkspaceDatabase', () => {
    it('initializes and returns workspace database', async () => {
      const db = await initializeWorkspaceDatabase('/tmp/workspace');
      expect(db).toBeInstanceOf(DrizzleDatabaseManager);
      expect(db.initialized).toBe(true);
    });
  });

  describe('initializeBothDatabases', () => {
    it('initializes both databases', async () => {
      const { global, workspace } = await initializeBothDatabases('/tmp/workspace');
      expect(global).toBeInstanceOf(DrizzleDatabaseManager);
      expect(workspace).toBeInstanceOf(DrizzleDatabaseManager);
      expect(global.initialized).toBe(true);
      expect(workspace.initialized).toBe(true);
    });
  });
});