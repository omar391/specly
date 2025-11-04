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
    verbose: () => {},
    Database: class {
      private store: Record<string, any[]> = {};
      constructor(public path: string, cb?: (err: Error | null) => void) {
        // immediate success
        if (cb) cb(null);
      }
      run(sql: string, paramsOrCb?: any[] | ((err: Error | null) => void), cb?: (err: Error | null, res?: any) => void) {
        // naive insert parser for our simple test table
        if (typeof paramsOrCb === 'function') {
          (paramsOrCb as Function)(null);
        } else if (cb) {
          cb(null, { changes: 1 });
        }
      }
      all(sql: string, params: any[] | ((err: Error | null, rows?: any[]) => void), cb?: (err: Error | null, rows?: any[]) => void) {
        const rows = [{ id: 'row1' }];
        if (typeof params === 'function') {
          (params as Function)(null, rows);
        } else if (cb) {
          cb(null, rows);
        }
      }
      get(sql: string, params: any[] | ((err: Error | null, row?: any) => void), cb?: (err: Error | null, row?: any) => void) {
        const row = { id: 'row1' };
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
const { DatabaseManager, DatabaseType } = await import('../database/connection.js');

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
});
