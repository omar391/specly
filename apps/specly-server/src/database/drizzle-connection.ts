import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

// Import schemas
import * as globalSchema from './schema/global-schema.js';
import * as workspaceSchema from './schema/workspace-schema.js';
import * as relations from './schema/relations.js';

export enum DatabaseType {
  GLOBAL = 'global',
  WORKSPACE = 'workspace'
}

export class DrizzleDatabaseManager {
  private db: ReturnType<typeof drizzle> | null = null;
  private sqlite: Database.Database | null = null;
  private isInitialized = false;
  private readonly dbType: DatabaseType;

  get initialized(): boolean {
    return this.isInitialized;
  }

  getConnectionInfo(): { hasDb: boolean; hasSqlite: boolean; dbPath: string } {
    return {
      hasDb: !!this.db,
      hasSqlite: !!this.sqlite,
      dbPath: this.dbPath
    };
  }

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

      // Create SQLite connection
      this.sqlite = new Database(this.dbPath);

      // Enable foreign keys
      this.sqlite.pragma('foreign_keys = ON');

      // Create Drizzle instance with appropriate schema
      if (this.dbType === DatabaseType.GLOBAL) {
        this.db = drizzle(this.sqlite, {
          schema: { ...globalSchema, ...relations }
        });
      } else {
        this.db = drizzle(this.sqlite, {
          schema: { ...workspaceSchema }
        });
      }

      // For pure TypeScript approach, use programmatic migrations instead of file-based migrations
      const { isStdioMode } = await import('@omar391/mcp-kit/utils/cli-parser');
      if (!isStdioMode()) {
        console.log('Running programmatic database migrations...');
      }
      await this.runProgrammaticMigrations();

      this.isInitialized = true;
      if (!isStdioMode()) {
        console.log(`${this.dbType} database initialized successfully at ${this.dbPath}`);
      }
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  /**
  * Run programmatic migrations (pure TypeScript approach)
  * NOTE: Legacy tool flow / feedback tables have been fully removed per drastic migration directive.
  * This creates only the minimal tables still required when file migrations are not used.
   */
  private async runProgrammaticMigrations(): Promise<void> {
    if (!this.sqlite) {
      throw new Error('SQLite connection not available');
    }

    // This is a fallback - in production, we'll embed the SQL schema
    if (this.dbType === DatabaseType.GLOBAL) {
      // Create global tables
      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          path TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          status TEXT DEFAULT 'disconnected' CHECK (status IN ('active', 'idle', 'inactive', 'disconnected', 'error')),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          last_activity TEXT,
          task_count INTEGER DEFAULT 0,
          active_task TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          last_activity TEXT DEFAULT CURRENT_TIMESTAMP,
          is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS mcp_server_mappings (
          id TEXT PRIMARY KEY,
          interface_type TEXT NOT NULL CHECK(interface_type IN ('github', 'jira', 'linear', 'asana', 'trello', 'custom')),
          mcp_server_name TEXT NOT NULL,
          description TEXT,
          is_default INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Specly tables (SP-001 core)
        CREATE TABLE IF NOT EXISTS specs (
          hash TEXT PRIMARY KEY,
          executor_type TEXT NOT NULL,
            executor_version TEXT NOT NULL,
            intent TEXT NOT NULL CHECK(intent IN ('human','autonomous')),
            side_effect INTEGER DEFAULT 0,
            content_template TEXT,
            static_params TEXT DEFAULT '{}' ,
            input_schema TEXT,
            output_schema TEXT,
            idempotency_key_template TEXT,
            retry_policy TEXT,
            show_output INTEGER DEFAULT 1,
            security TEXT,
            metadata TEXT DEFAULT '{}',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tools (
          name TEXT PRIMARY KEY,
          command_alias TEXT UNIQUE,
          description TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tool_versions (
          hash TEXT PRIMARY KEY,
          tool_name TEXT NOT NULL,
          graph_manifest TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(tool_name) REFERENCES tools(name) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          parent_profile_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS profile_versions (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL,
          parent_profile_version_id TEXT,
          version INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS profile_version_tools (
          id TEXT PRIMARY KEY,
          profile_version_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          tool_version_hash TEXT NOT NULL,
          command_alias TEXT,
          inherited_from_profile_version_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(tool_version_hash) REFERENCES tool_versions(hash) ON DELETE CASCADE,
          FOREIGN KEY(tool_name) REFERENCES tools(name) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workspace_profile_versions (
          workspace_id TEXT NOT NULL,
          profile_version_id TEXT NOT NULL,
          pinned_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(workspace_id),
          FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS action_journal (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          spec_hash TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending','success','failed')),
          attempts INTEGER DEFAULT 0,
          last_error_code TEXT,
          result_json TEXT,
          error_json TEXT,
          started_at TEXT DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT,
          FOREIGN KEY(spec_hash) REFERENCES specs(hash) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workspace_rules (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          relation TEXT NOT NULL CHECK(relation IN ('always-do','never-do','is-a','has-a')),
          rule TEXT NOT NULL,
          original_text TEXT,
          confidence INTEGER DEFAULT 1,
          source_session_id TEXT,
          active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          last_reinforced_at TEXT,
          FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id ON sessions(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
        CREATE INDEX IF NOT EXISTS idx_mcp_server_mappings_interface_type ON mcp_server_mappings(interface_type);
        CREATE INDEX IF NOT EXISTS idx_mcp_server_mappings_default ON mcp_server_mappings(is_default);
        CREATE INDEX IF NOT EXISTS idx_tool_versions_tool_name ON tool_versions(tool_name);
        CREATE INDEX IF NOT EXISTS idx_action_journal_spec_hash ON action_journal(spec_hash);
      `);
    } else {
      // Create workspace tables (final Specly schema)
      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'queued' CHECK(status IN ('queued','in_progress','awaiting_input','blocked','paused','completed','failed')),
          priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
          progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
          notes TEXT,
          assets TEXT DEFAULT '[]',
          external_references TEXT DEFAULT '[]',
          metadata TEXT DEFAULT '{}',
          tags TEXT DEFAULT '[]',
          profile_version_id TEXT,
          blocked_reason TEXT,
          deleted_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS github_configs (
          id TEXT PRIMARY KEY,
          repo_url TEXT NOT NULL,
          repo_owner TEXT NOT NULL,
          repo_name TEXT NOT NULL,
          github_token TEXT NOT NULL,
          auto_sync INTEGER DEFAULT 0,
          sync_direction TEXT CHECK(sync_direction IN ('bidirectional', 'github_to_specly', 'specly_to_github')) DEFAULT 'bidirectional',
          last_sync TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS remote_interfaces (
          id TEXT PRIMARY KEY,
          interface_type TEXT NOT NULL CHECK(interface_type IN ('github', 'jira', 'linear', 'asana', 'trello', 'custom')),
          name TEXT NOT NULL,
          base_url TEXT NOT NULL,
          api_token TEXT NOT NULL,
          project_id TEXT,
          sync_enabled INTEGER DEFAULT 1,
          sync_direction TEXT CHECK(sync_direction IN ('bidirectional', 'import_only', 'export_only')) DEFAULT 'bidirectional',
          field_mappings TEXT DEFAULT '[]',
          last_sync TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
        CREATE INDEX IF NOT EXISTS idx_remote_interfaces_type ON remote_interfaces(interface_type);

        CREATE TABLE IF NOT EXISTS task_dependencies (
          task_id TEXT NOT NULL,
          depends_on_task_id TEXT NOT NULL,
          PRIMARY KEY(task_id, depends_on_task_id)
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          task_id TEXT,
          profile_version_id TEXT,
          current_spec_hash TEXT,
          status TEXT DEFAULT 'active' CHECK(status IN ('active','idle')),
          client_state_id TEXT,
          last_active_at TEXT DEFAULT CURRENT_TIMESTAMP,
          context TEXT DEFAULT '{}',
          last_result_code TEXT,
          human_blocking INTEGER DEFAULT 0,
          deleted_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Indexes for tables
        CREATE INDEX IF NOT EXISTS idx_task_dependencies_task ON task_dependencies(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends ON task_dependencies(depends_on_task_id);
      `);

      // Detect and migrate legacy tasks table (with backlog/in-progress/etc) to Specly schema
      try {
        const row = this.sqlite.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'`).get() as { sql?: string } | undefined;
        const sqlDef = row?.sql || '';
        if (/CHECK\s*\(status\s+IN\s*\('backlog'\s*,\s*'in-progress'/i.test(sqlDef)) {
          // Perform table rebuild with data migration
          this.sqlite.exec(`
            BEGIN TRANSACTION;
            CREATE TABLE tasks_migrated (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              description TEXT,
              status TEXT DEFAULT 'queued' CHECK(status IN ('queued','in_progress','awaiting_input','blocked','paused','completed','failed')),
              priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
              progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
              notes TEXT,
              assets TEXT DEFAULT '[]',
              external_references TEXT DEFAULT '[]',
              metadata TEXT DEFAULT '{}',
              tags TEXT DEFAULT '[]',
              profile_version_id TEXT,
              blocked_reason TEXT,
              deleted_at TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              completed_at TEXT
            );
            INSERT INTO tasks_migrated (
              id, title, description, status, priority, progress, notes,
              assets, external_references, metadata, tags,
              profile_version_id, blocked_reason, deleted_at,
              created_at, updated_at, completed_at
            )
            SELECT
              id,
              title,
              description,
              CASE status
                WHEN 'backlog' THEN 'queued'
                WHEN 'in-progress' THEN 'in_progress'
                WHEN 'blocked' THEN 'blocked'
                WHEN 'review' THEN 'awaiting_input'
                WHEN 'done' THEN 'completed'
                WHEN 'dropped' THEN 'failed'
                ELSE 'queued'
              END AS status,
              CASE LOWER(priority)
                WHEN 'high' THEN 'high'
                WHEN 'low' THEN 'low'
                ELSE 'medium'
              END AS priority,
              COALESCE(progress, 0) AS progress,
              notes,
              '[]' AS assets,
              '[]' AS external_references,
              '{}' AS metadata,
              '[]' AS tags,
              NULL AS profile_version_id,
              NULL AS blocked_reason,
              NULL AS deleted_at,
              created_at,
              updated_at,
              completed_at
            FROM tasks;
            DROP TABLE tasks;
            ALTER TABLE tasks_migrated RENAME TO tasks;
            COMMIT;
          `);
          // Recreate indexes dropped with old table
          this.sqlite.exec(`
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
          `);
        }
      } catch (e) {
        console.warn('Legacy tasks table migration check failed:', e);
      }

      // Backfill: if an older 'tasks' table exists without new Specly columns, try to add them.
      // SQLite doesn't support IF NOT EXISTS for columns, so run each in try/catch and ignore duplicate errors.
      const alterStatements = [
        "ALTER TABLE tasks ADD COLUMN profile_version_id TEXT",
        "ALTER TABLE tasks ADD COLUMN blocked_reason TEXT",
        "ALTER TABLE tasks ADD COLUMN deleted_at TEXT",
        "ALTER TABLE tasks ADD COLUMN assets TEXT DEFAULT '[]'",
        "ALTER TABLE tasks ADD COLUMN external_references TEXT DEFAULT '[]'",
        "ALTER TABLE tasks ADD COLUMN metadata TEXT DEFAULT '{}'",
        "ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]'",
        "ALTER TABLE tasks ADD COLUMN completed_at TEXT",
        "ALTER TABLE tasks ADD COLUMN notes TEXT"
      ];
      for (const stmt of alterStatements) {
        try {
          this.sqlite.exec(stmt);
        } catch (e: any) {
          // Ignore if column already exists
          const msg = String(e?.message || e);
          if (!/duplicate column name/i.test(msg)) {
            // For other errors, log for visibility but do not fail initialization
            console.warn(`Migration warning executing [${stmt}]:`, msg);
          }
        }
      }

    }
  }

  /**
   * Get Drizzle database instance
   */
  getDb() {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Get raw SQLite instance for direct queries if needed
   */
  getSqlite(): Database.Database {
    if (!this.sqlite || !this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.sqlite;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.sqlite) {
      this.sqlite.close();
      this.sqlite = null;
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

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    const db = this.getDb();
    return db.transaction(callback);
  }
}

// Database instances
let globalDbInstance: DrizzleDatabaseManager | null = null;
let workspaceDbInstances: Map<string, DrizzleDatabaseManager> = new Map();

/**
 * Get or create global database instance
 */
export function getGlobalDatabase(): DrizzleDatabaseManager {
  if (!globalDbInstance) {
    const globalPath = join(process.env.HOME || '/tmp', '.specly', 'global.db');
    globalDbInstance = new DrizzleDatabaseManager(globalPath, DatabaseType.GLOBAL);
  }
  return globalDbInstance;
}

/**
 * Get or create workspace database instance
 */
export function getWorkspaceDatabase(workspacePath: string): DrizzleDatabaseManager {
  const workspaceDbPath = join(workspacePath, '.specly', 'task.db');

  // Check if we already have a cached instance for this workspace
  if (!workspaceDbInstances.has(workspaceDbPath)) {
    workspaceDbInstances.set(workspaceDbPath, new DrizzleDatabaseManager(workspaceDbPath, DatabaseType.WORKSPACE));
  }

  return workspaceDbInstances.get(workspaceDbPath)!;
}

/**
 * Clear global database instance (for testing)
 */
export function clearGlobalDatabaseInstance(): void {
  globalDbInstance = null;
}

/**
 * Clear workspace database instances (for testing)
 */
export function clearWorkspaceDatabaseCache(): void {
  workspaceDbInstances.clear();
}

/**
 * Initialize global database instance
 */
export async function initializeGlobalDatabase(): Promise<DrizzleDatabaseManager> {
  const db = getGlobalDatabase();
  await db.initialize();
  return db;
}

/**
 * Initialize workspace database instance
 */
export async function initializeWorkspaceDatabase(workspacePath: string): Promise<DrizzleDatabaseManager> {
  const db = getWorkspaceDatabase(workspacePath);
  await db.initialize();
  return db;
}

/**
 * Initialize both databases
 */
export async function initializeBothDatabases(workspacePath: string): Promise<{
  global: DrizzleDatabaseManager;
  workspace: DrizzleDatabaseManager;
}> {
  const [global, workspace] = await Promise.all([
    initializeGlobalDatabase(),
    initializeWorkspaceDatabase(workspacePath)
  ]);

  return { global, workspace };
}

// Export schema types for use in other files
export type {
  Workspace, NewWorkspace,
  Session, NewSession,
  McpServerMapping, NewMcpServerMapping
} from './schema/global-schema.js';

export type {
  Task, NewTask,
  GithubConfig, NewGithubConfig,
  RemoteInterface, NewRemoteInterface
} from './schema/workspace-schema.js';
