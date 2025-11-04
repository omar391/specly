import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// For the initialization test we need to control schema loading. Mock fs.readFileSync
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: (path: string, enc?: string) => {
      // Return a minimal schema that will create a test table
      return 'CREATE TABLE IF NOT EXISTS __test_table (id TEXT PRIMARY KEY);';
    }
  };
});

// Provide a lightweight mock for sqlite3 so tests run without native bindings
vi.mock('sqlite3', async () => {
  const impl = {
    verbose: () => { },
    Database: class {
      private store: Record<string, any[]> = { __test_table: [] };
      private inTransaction = false;
      private pendingInserts: any[] = [];
      constructor(public path: string, cb?: (err: Error | null) => void) {
        // immediate success
        if (cb) cb(null);
      }
      run(sql: string, paramsOrCb?: any[] | ((err: Error | null) => void), cb?: (err: Error | null, res?: any) => void) {
        const sqlUpper = sql.toUpperCase().trim();

        if (sqlUpper === 'BEGIN' || sqlUpper === 'BEGIN TRANSACTION') {
          this.inTransaction = true;
          this.pendingInserts = [];
          if (typeof paramsOrCb === 'function') {
            (paramsOrCb as Function)(null);
          } else if (cb) {
            cb(null);
          }
          return;
        }

        if (sqlUpper === 'COMMIT') {
          this.inTransaction = false;
          // Apply pending inserts
          this.pendingInserts.forEach(insert => {
            if (!this.store.__test_table.some(row => row.id === insert.id)) {
              this.store.__test_table.push(insert);
            }
          });
          this.pendingInserts = [];
          if (typeof paramsOrCb === 'function') {
            (paramsOrCb as Function)(null);
          } else if (cb) {
            cb(null);
          }
          return;
        }

        if (sqlUpper === 'ROLLBACK') {
          this.inTransaction = false;
          this.pendingInserts = [];
          if (typeof paramsOrCb === 'function') {
            (paramsOrCb as Function)(null);
          } else if (cb) {
            cb(null);
          }
          return;
        }

        // Handle INSERT
        if (sqlUpper.includes('INSERT INTO __TEST_TABLE')) {
          let id: any;
          if (Array.isArray(paramsOrCb)) id = paramsOrCb[0];
          const row = { id };
          if (this.inTransaction) {
            // Check for duplicates in both committed and pending
            const exists = this.store.__test_table.some(r => r.id === id) ||
              this.pendingInserts.some(r => r.id === id);
            if (exists) {
              const err = new Error('UNIQUE constraint failed');
              if (typeof paramsOrCb === 'function') {
                (paramsOrCb as Function)(err);
              } else if (cb) {
                cb(err);
              }
              return;
            }
            this.pendingInserts.push(row);
          } else {
            if (this.store.__test_table.some(r => r.id === id)) {
              const err = new Error('UNIQUE constraint failed');
              if (typeof paramsOrCb === 'function') {
                (paramsOrCb as Function)(err);
              } else if (cb) {
                cb(err);
              }
              return;
            }
            this.store.__test_table.push(row);
          }
          if (typeof paramsOrCb === 'function') {
            (paramsOrCb as Function)(null);
          } else if (cb) {
            cb(null, { changes: 1 });
          }
          return;
        }

        if (typeof paramsOrCb === 'function') {
          (paramsOrCb as Function)(null);
        } else if (cb) {
          cb(null, { changes: 1 });
        }
      }
      all(sql: string, params: any[] | ((err: Error | null, rows?: any[]) => void), cb?: (err: Error | null, rows?: any[]) => void) {
        let rows = [...this.store.__test_table];
        if (sql.toUpperCase().includes('ORDER BY ID')) {
          rows.sort((a, b) => a.id.localeCompare(b.id));
        }
        if (typeof params === 'function') {
          (params as Function)(null, rows);
        } else if (cb) {
          cb(null, rows);
        }
      }
      get(sql: string, params: any[] | ((err: Error | null, row?: any) => void), cb?: (err: Error | null, row?: any) => void) {
        let id: any;
        if (Array.isArray(params)) id = params[0];
        const row = this.store.__test_table.find(r => r.id === id);
        if (typeof params === 'function') {
          (params as Function)(null, row);
        } else if (cb) {
          cb(null, row);
        }
      }
      exec(sql: string, cb?: (err: Error | null) => void) {
        if (cb) cb(null);
      }
      close(cb?: (err?: Error | null) => void) {
        if (cb) cb(null);
      }
    }
  };
  return { default: impl };
});

// Import after mocking
const { DatabaseManager, DatabaseType, getGlobalDatabase, getWorkspaceDatabase, initializeGlobalDatabase, initializeWorkspaceDatabase, initializeBothDatabases, getDatabase, initializeDatabase } = await import('../database/connection.js');

describe('DatabaseManager', () => {
  let mgr: InstanceType<typeof DatabaseManager> | null = null;

  afterEach(async () => {
    if (mgr) {
      try {
        await mgr.close();
      } catch {
        // ignore
      }
      mgr = null;
    }
    vi.restoreAllMocks();
  });

  it('filterSchemaByType includes only matching blocks for GLOBAL', () => {
    const schema = `-- @global-only
CREATE TABLE g1(id TEXT);
-- @end
-- @workspace-only
CREATE TABLE w1(id TEXT);
-- @end
CREATE TABLE common(id TEXT);
`;

    const m = new DatabaseManager(':memory:', DatabaseType.GLOBAL);
    const filtered = (m as any).filterSchemaByType(schema);
    expect(filtered).toContain('CREATE TABLE g1');
    expect(filtered).toContain('CREATE TABLE common');
    expect(filtered).not.toContain('CREATE TABLE w1');
  });

  it('filterSchemaByType includes only matching blocks for WORKSPACE', () => {
    const schema = `-- @global-only
CREATE TABLE g1(id TEXT);
-- @end
-- @workspace-only
CREATE TABLE w1(id TEXT);
-- @end
CREATE TABLE common(id TEXT);
`;

    const m = new DatabaseManager(':memory:', DatabaseType.WORKSPACE);
    const filtered = (m as any).filterSchemaByType(schema);
    expect(filtered).toContain('CREATE TABLE w1');
    expect(filtered).toContain('CREATE TABLE common');
    expect(filtered).not.toContain('CREATE TABLE g1');
  });

  it('getDb throws when not initialized', () => {
    const m = new DatabaseManager(':memory:', DatabaseType.WORKSPACE);
    expect(() => m.getDb()).toThrow('Database not initialized');
  });

  it('initialize reads schema and allows queries', async () => {
    mgr = new DatabaseManager(':memory:', DatabaseType.WORKSPACE);
    await mgr.initialize();
    expect(mgr.isReady()).toBe(true);

    // Insert and query using public APIs
    await mgr.run('INSERT INTO __test_table (id) VALUES (?)', ['row1']);
    const rows = await mgr.all('SELECT id FROM __test_table');
    expect(Array.isArray(rows)).toBe(true);
    const first = await mgr.get('SELECT id FROM __test_table WHERE id = ?', ['row1']);
    expect(first).toBeDefined();
    // Row shape may vary; ensure id matches
    expect((first as any).id === 'row1' || (first as any).id === 'row1').toBeTruthy();
  });

  it('transaction commits multiple statements', async () => {
    mgr = new DatabaseManager(':memory:', DatabaseType.WORKSPACE);
    await mgr.initialize();

    await mgr.transaction([
      { sql: 'INSERT INTO __test_table (id) VALUES (?)', params: ['tx1'] },
      { sql: 'INSERT INTO __test_table (id) VALUES (?)', params: ['tx2'] }
    ]);

    const rows = await mgr.all('SELECT id FROM __test_table ORDER BY id');
    expect(rows.length).toBe(2);
    expect(rows.map(r => r.id)).toEqual(['tx1', 'tx2']);
  });

  it('transaction rolls back on error', async () => {
    mgr = new DatabaseManager(':memory:', DatabaseType.WORKSPACE);
    await mgr.initialize();

    // Insert one row first
    await mgr.run('INSERT INTO __test_table (id) VALUES (?)', ['before']);

    // Try transaction with error (duplicate key)
    try {
      await mgr.transaction([
        { sql: 'INSERT INTO __test_table (id) VALUES (?)', params: ['tx1'] },
        { sql: 'INSERT INTO __test_table (id) VALUES (?)', params: ['before'] } // duplicate
      ]);
      expect.fail('Should have thrown');
    } catch {
      // expected
    }

    // Only original row should remain
    const rows = await mgr.all('SELECT id FROM __test_table');
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('before');
  });

  it('close resets state', async () => {
    mgr = new DatabaseManager(':memory:', DatabaseType.WORKSPACE);
    await mgr.initialize();
    expect(mgr.isReady()).toBe(true);

    await mgr.close();
    expect(mgr.isReady()).toBe(false);
    expect(() => mgr!.getDb()).toThrow('Database not initialized');
  });
});

describe('Global Database Functions', () => {
  // Mock process.env.HOME to avoid real paths
  const originalHome = process.env.HOME;
  beforeEach(() => {
    process.env.HOME = '/tmp/test-home';
  });
  afterEach(() => {
    process.env.HOME = originalHome;
    // Reset global instances between tests
    vi.doUnmock('../database/connection.js');
  });

  it('getGlobalDatabase returns a GLOBAL type manager', () => {
    const db = getGlobalDatabase();
    expect(db).toBeInstanceOf(DatabaseManager);
    expect((db as any).dbType).toBe(DatabaseType.GLOBAL);
  });

  it('getWorkspaceDatabase returns a WORKSPACE type manager', () => {
    const db = getWorkspaceDatabase('/tmp/test-workspace');
    expect(db).toBeInstanceOf(DatabaseManager);
    expect((db as any).dbType).toBe(DatabaseType.WORKSPACE);
  });

  it('initializeGlobalDatabase initializes and returns the global instance', async () => {
    const db = await initializeGlobalDatabase();
    expect(db).toBeInstanceOf(DatabaseManager);
    expect(db.isReady()).toBe(true);
  });

  it('initializeWorkspaceDatabase initializes and returns workspace instance', async () => {
    const db = await initializeWorkspaceDatabase('/tmp/test-workspace');
    expect(db).toBeInstanceOf(DatabaseManager);
    expect(db.isReady()).toBe(true);
  });

  it('initializeBothDatabases initializes both and returns them', async () => {
    const { global, workspace } = await initializeBothDatabases('/tmp/test-workspace');
    expect(global).toBeInstanceOf(DatabaseManager);
    expect(workspace).toBeInstanceOf(DatabaseManager);
    expect(global.isReady()).toBe(true);
    expect(workspace.isReady()).toBe(true);
  });
});

describe('Legacy Functions (deprecated)', () => {
  const originalHome = process.env.HOME;
  let consoleWarnSpy: any;

  beforeEach(() => {
    process.env.HOME = '/tmp/test-home';
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    consoleWarnSpy.mockRestore();
    vi.doUnmock('../database/connection.js');
  });

  it('getDatabase warns and returns global instance', () => {
    const db = getDatabase();
    expect(db).toBeInstanceOf(DatabaseManager);
    expect(consoleWarnSpy).toHaveBeenCalledWith('getDatabase() is deprecated. Use getGlobalDatabase() or getWorkspaceDatabase() instead.');
  });

  it('initializeDatabase warns and initializes', async () => {
    const db = await initializeDatabase();
    expect(db).toBeInstanceOf(DatabaseManager);
    expect(db.isReady()).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith('initializeDatabase() is deprecated. Use initializeGlobalDatabase() or initializeWorkspaceDatabase() instead.');
  });
});
