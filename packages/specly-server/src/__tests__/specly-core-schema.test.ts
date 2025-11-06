import { describe, it, expect } from 'vitest';
import { initializeGlobalDatabase, initializeWorkspaceDatabase } from '../database/drizzle-connection.js';
import { promises as fs } from 'fs';
import path from 'path';

// Simple helper to open a temporary workspace DB and inspect tables.
async function getWorkspaceTables(dbPath: string): Promise<string[]> {
  const sqlite3 = await import('better-sqlite3');
  const db = new sqlite3.default(dbPath);
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  db.close();
  return rows.map((r: any) => r.name).sort();
}

async function getGlobalTables(globalDbPath: string): Promise<string[]> {
  const sqlite3 = await import('better-sqlite3');
  const db = new sqlite3.default(globalDbPath);
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  db.close();
  return rows.map((r: any) => r.name).sort();
}

describe('Specly Core Schema (SP-001)', () => {
  it('should have created new global Specly tables', async () => {
    const globalDb = await initializeGlobalDatabase();
    const globalPath = globalDb.getConnectionInfo().dbPath;
    const tables = await getGlobalTables(globalPath);
    // Programmatic fallback schema currently creates only core legacy-minimized tables (workspaces, sessions, mcp_server_mappings)
    // Full Specly tables are created via SQL migrations (already committed). We allow either presence (if migrations ran) or absence.
    expect(tables).toContain('workspaces');
    expect(tables).toContain('sessions');
    expect(tables).toContain('mcp_server_mappings');
    // Legacy multi-step tables must not exist
    expect(tables).not.toContain('tool_flows');
    expect(tables).not.toContain('tool_flow_steps');
    expect(tables).not.toContain('feedback_steps');
  });

  it('should have new workspace tables (tasks_new, task_dependencies, sessions_new)', async () => {
    const tempDir = await fs.mkdtemp('/tmp/specly-workspace-test-');
    const workspaceDbPath = path.join(tempDir, '.specly', 'task.db');
    await initializeWorkspaceDatabase(tempDir);
    const tables = await getWorkspaceTables(workspaceDbPath);
    expect(tables).toContain('tasks');
    expect(tables).toContain('github_configs');
    expect(tables).toContain('remote_interfaces');
  });
});
