import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Enable verbose mode for debugging
sqlite3.verbose();

export enum DatabaseType {
  GLOBAL = 'global',
  WORKSPACE = 'workspace'
}

export class DatabaseManager {
  private db: sqlite3.Database | null = null;
  private isInitialized = false;
  private readonly dbType: DatabaseType;

  constructor(
    private dbPath: string = ':memory:',
    dbType: DatabaseType = DatabaseType.WORKSPACE
  ) {
    this.dbType = dbType;
  }

  /**
   * Initialize database connection and create schema
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Ensure directory exists for file-based databases
      if (this.dbPath !== ':memory:') {
        const dbDir = dirname(this.dbPath);
        if (!existsSync(dbDir)) {
          mkdirSync(dbDir, { recursive: true });
        }
      }

      // Create database connection
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err.message);
          throw err;
        }
      });

      // Promisify database methods for easier async usage
      const runAsync = promisify(this.db.run.bind(this.db));
      const allAsync = promisify(this.db.all.bind(this.db));
      const getAsync = promisify(this.db.get.bind(this.db));
      const execAsync = promisify(this.db.exec.bind(this.db));

      // Store promisified methods
      (this.db as any).runAsync = runAsync;
      (this.db as any).allAsync = allAsync;
      (this.db as any).getAsync = getAsync;

      // Enable foreign keys
      await runAsync('PRAGMA foreign_keys = ON');

      // Read and execute schema
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf8');
      
      // Filter schema based on database type
      const filteredSchema = this.filterSchemaByType(schema);
      
      // Execute schema using exec which handles multi-statement scripts better
      await execAsync(filteredSchema);

      this.isInitialized = true;
      console.log(`${this.dbType} database initialized successfully at ${this.dbPath}`);
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  /**
   * Filter schema SQL based on database type
   */
  private filterSchemaByType(schema: string): string {
    const lines = schema.split('\n');
    const filteredLines: string[] = [];
    let skipBlock = false;
    let currentBlock = '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check for database type comments
      if (trimmedLine.startsWith('-- @global-only')) {
        skipBlock = this.dbType !== DatabaseType.GLOBAL;
        currentBlock = 'global';
        continue;
      } else if (trimmedLine.startsWith('-- @workspace-only')) {
        skipBlock = this.dbType !== DatabaseType.WORKSPACE;
        currentBlock = 'workspace';
        continue;
      } else if (trimmedLine.startsWith('-- @end')) {
        skipBlock = false;
        currentBlock = '';
        continue;
      }

      // Include line if not skipping
      if (!skipBlock) {
        filteredLines.push(line);
      }
    }

    return filteredLines.join('\n');
  }

  /**
   * Get database instance
   */
  getDb(): sqlite3.Database {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a query and return all results
   */
  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = this.getDb();
    return (db as any).allAsync(sql, params);
  }

  /**
   * Execute a query and return first result
   */
  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const db = this.getDb();
    return (db as any).getAsync(sql, params);
  }

  /**
   * Execute a query (INSERT, UPDATE, DELETE)
   */
  async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    const db = this.getDb();
    return (db as any).runAsync(sql, params);
  }

  /**
   * Execute multiple statements in a transaction
   */
  async transaction(statements: Array<{ sql: string; params?: any[] }>): Promise<void> {
    const db = this.getDb();
    const runAsync = (db as any).runAsync;

    await runAsync('BEGIN TRANSACTION');
    try {
      for (const { sql, params = [] } of statements) {
        await runAsync(sql, params);
      }
      await runAsync('COMMIT');
    } catch (error) {
      await runAsync('ROLLBACK');
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      const closeAsync = promisify(this.db.close.bind(this.db));
      await closeAsync();
      this.db = null;
      this.isInitialized = false;
    }
  }

  /**
   * Check if database is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }
}

// Database instances
let globalDbInstance: DatabaseManager | null = null;
let workspaceDbInstance: DatabaseManager | null = null;

/**
 * Get or create global database instance
 */
export function getGlobalDatabase(): DatabaseManager {
  if (!globalDbInstance) {
    const globalPath = join(process.env.HOME || '/tmp', '.specly', 'global.db');
    globalDbInstance = new DatabaseManager(globalPath, DatabaseType.GLOBAL);
  }
  return globalDbInstance;
}

/**
 * Get or create workspace database instance
 */
export function getWorkspaceDatabase(workspacePath: string): DatabaseManager {
  if (!workspaceDbInstance) {
    const workspaceDbPath = join(workspacePath, '.specly', 'task.db');
    workspaceDbInstance = new DatabaseManager(workspaceDbPath, DatabaseType.WORKSPACE);
  }
  return workspaceDbInstance;
}

/**
 * Initialize global database instance
 */
export async function initializeGlobalDatabase(): Promise<DatabaseManager> {
  const db = getGlobalDatabase();
  await db.initialize();
  return db;
}

/**
 * Initialize workspace database instance
 */
export async function initializeWorkspaceDatabase(workspacePath: string): Promise<DatabaseManager> {
  const db = getWorkspaceDatabase(workspacePath);
  await db.initialize();
  return db;
}

/**
 * Initialize both databases
 */
export async function initializeBothDatabases(workspacePath: string): Promise<{
  global: DatabaseManager;
  workspace: DatabaseManager;
}> {
  const [global, workspace] = await Promise.all([
    initializeGlobalDatabase(),
    initializeWorkspaceDatabase(workspacePath)
  ]);
  
  return { global, workspace };
}