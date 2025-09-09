import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';
import { getWorkspaceDatabase } from '../database/drizzle-connection.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';

describe('Workspace Schema Investigation', () => {
    let testWorkspaceDir: string;

    beforeEach(() => {
        // Create unique test workspace
        testWorkspaceDir = mkdtempSync(join(tmpdir(), 'taskpilot-schema-test-'));
    });

    afterEach(() => {
        try {
            rmSync(testWorkspaceDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    it('should create tables when workspace database is initialized', async () => {
        console.log('Test workspace path:', testWorkspaceDir);

        // Create workspace database service
        const workspaceDb = new WorkspaceDatabaseService(testWorkspaceDir);
        await workspaceDb.initialize();

        // Get direct access to the database connection for schema inspection
        const dbManager = getWorkspaceDatabase(testWorkspaceDir);
        const sqlite = dbManager.getSqlite();

        // Check if tables exist using SQLite PRAGMA
        const tablesResult = sqlite.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();

        console.log('Tables found in workspace database:', tablesResult);

        // Specifically check for the tasks table
        const tasksTableExists = tablesResult.some((table: any) => table.name === 'tasks');
        console.log('Tasks table exists:', tasksTableExists);

        if (tasksTableExists) {
            // Get table schema
            const tasksSchema = sqlite.prepare(`PRAGMA table_info(tasks)`).all();
            console.log('Tasks table schema:', tasksSchema);

            // Try to insert a test task
            try {
                const now = new Date().toISOString();
                const insertResult = await workspaceDb.createTask({
                    id: 'test-task-1',
                    title: 'Test Task',
                    description: 'Test description',
                    status: 'queued',
                    priority: 'medium',
                    progress: 0,
                    notes: '',
                    assets: [],
                    externalReferences: [],
                    metadata: {},
                    tags: [],
                    createdAt: now,
                    updatedAt: now
                } as any);
                console.log('Successfully inserted test task:', insertResult.id);

                // Try to query it back
                const tasks = await workspaceDb.getTasksPaginated(undefined, 10, 0);
                console.log('Successfully queried tasks:', tasks.length);
                expect(tasks.length).toBe(1);
                expect(tasks[0].id).toBe('test-task-1');
            } catch (error) {
                console.error('Error with task operations:', error);
                throw error;
            }
        }

        expect(tasksTableExists).toBe(true);
    });

    it('should work with the same initialization pattern as the failing test', async () => {
        console.log('Using same pattern as failing test...');

        // This follows the exact same pattern as the failing test init tool
        const workspaceDb = new WorkspaceDatabaseService(testWorkspaceDir);
        await workspaceDb.initialize();

        // Now try to query tasks directly - this should match what status tool does
        try {
            const tasks = await workspaceDb.getTasksPaginated(undefined, 10, 0);
            console.log('Tasks query successful:', tasks.length);
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
        } catch (error) {
            console.error('SAME ERROR as failing test:', error);
            throw error;
        }
    });

    it('should show difference between direct and CLI database initialization', async () => {
        console.log('Testing direct initialization vs CLI pattern...');

        // Direct initialization (like our successful tests)
        const directDb = new WorkspaceDatabaseService(testWorkspaceDir);
        await directDb.initialize();

        const directDbManager = getWorkspaceDatabase(testWorkspaceDir);
        const directSqlite = directDbManager.getSqlite();

        const directTables = directSqlite.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();

        console.log('Direct initialization tables:', directTables);

        // Try queries
        try {
            const directTasks = await directDb.getTasksPaginated(undefined, 10, 0);
            console.log('Direct query works:', directTasks.length);
        } catch (error) {
            console.error('Direct query failed:', error);
        }

        expect(directTables.length).toBeGreaterThan(0);
    });
});
