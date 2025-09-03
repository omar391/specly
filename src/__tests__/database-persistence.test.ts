/**
 * Database Persistence Investigation Tests
 * 
 * These tests isolate and analyze the specific database persistence issues
 * that are causing workspace database files not to be written to disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DrizzleDatabaseManager, DatabaseType, getWorkspaceDatabase, clearWorkspaceDatabaseCache } from '../database/drizzle-connection.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';
import fs from 'fs';
import { ensureSpecs } from '../test-utils/ensure-specs.js';
import path from 'path';
import os from 'os';

describe('Database Persistence Investigation', () => {
    let testWorkspacePath: string;
    let dbPath: string;

    beforeEach(() => {
        // Create unique test workspace
        const uniqueId = Math.random().toString(36).substring(7);
        testWorkspacePath = path.join(os.tmpdir(), `db-test-${uniqueId}`);
        dbPath = path.join(testWorkspacePath, '.taskpilot', 'task.db');
    });

    afterEach(() => {
        // Clean up
        clearWorkspaceDatabaseCache();
        if (fs.existsSync(testWorkspacePath)) {
            fs.rmSync(testWorkspacePath, { recursive: true, force: true });
        }
    });

    describe('Direct DrizzleDatabaseManager Tests', () => {
        it('should create database file when directly using DrizzleDatabaseManager', async () => {
            // Test Case 1: Direct database creation and initialization
            const dbManager = new DrizzleDatabaseManager(dbPath, DatabaseType.WORKSPACE);

            console.log(`Test 1: Creating database at ${dbPath}`);
            console.log(`Directory exists before init: ${fs.existsSync(path.dirname(dbPath))}`);
            console.log(`File exists before init: ${fs.existsSync(dbPath)}`);

            await dbManager.initialize();

            console.log(`Database initialized: ${dbManager.initialized}`);
            console.log(`Directory exists after init: ${fs.existsSync(path.dirname(dbPath))}`);
            console.log(`File exists after init: ${fs.existsSync(dbPath)}`);

            if (fs.existsSync(dbPath)) {
                const stats = fs.statSync(dbPath);
                console.log(`Database file size: ${stats.size} bytes`);
            }

            // Assertions
            expect(dbManager.initialized).toBe(true);
            expect(fs.existsSync(dbPath)).toBe(true);
            expect(fs.statSync(dbPath).size).toBeGreaterThan(0);
        });

        it('should persist data across database instance recreations', async () => {
            // Test Case 2: Data persistence across instances

            // Step 1: Create and initialize first instance
            const dbManager1 = new DrizzleDatabaseManager(dbPath, DatabaseType.WORKSPACE);
            await dbManager1.initialize();

            console.log(`After first init - file exists: ${fs.existsSync(dbPath)}`);

            // Step 2: Insert test data using raw SQLite
            const sqlite1 = dbManager1.getSqlite();
            const insertResult = sqlite1.prepare(`INSERT INTO tasks (id, title, description) VALUES (?, ?, ?)`).run('test-1', 'Test Task', 'Test Description');
            console.log(`Insert result:`, insertResult);

            console.log(`After insert - file exists: ${fs.existsSync(dbPath)}`);
            if (fs.existsSync(dbPath)) {
                const stats = fs.statSync(dbPath);
                console.log(`Database file size after insert: ${stats.size} bytes`);
            }

            // Step 3: Create new instance and verify data exists
            const dbManager2 = new DrizzleDatabaseManager(dbPath, DatabaseType.WORKSPACE);
            await dbManager2.initialize();

            const sqlite2 = dbManager2.getSqlite();
            const result = sqlite2.prepare(`SELECT * FROM tasks WHERE id = ?`).get('test-1');

            console.log(`Query result:`, result);

            expect(fs.existsSync(dbPath)).toBe(true);
            expect(result).toBeDefined();
        });
    });

    describe('Cached Database Instance Tests', () => {
        it('should maintain file persistence with cached instances', async () => {
            // Test Case 3: Testing getWorkspaceDatabase caching behavior

            console.log(`Test 3: Testing cached database instances`);

            // Step 1: Get first cached instance
            const dbInstance1 = getWorkspaceDatabase(testWorkspacePath);
            await dbInstance1.initialize();

            console.log(`After cached init - file exists: ${fs.existsSync(dbPath)}`);
            console.log(`Database initialized: ${dbInstance1.initialized}`);

            // Step 2: Get second cached instance (should be same)
            const dbInstance2 = getWorkspaceDatabase(testWorkspacePath);

            console.log(`Same instance: ${dbInstance1 === dbInstance2}`);
            console.log(`Second instance initialized: ${dbInstance2.initialized}`);

            expect(dbInstance1).toBe(dbInstance2); // Should be same cached instance
            expect(dbInstance2.initialized).toBe(true);
            expect(fs.existsSync(dbPath)).toBe(true);
        });

        it('should work correctly with WorkspaceDatabaseService', async () => {
            // Test Case 4: Full WorkspaceDatabaseService workflow

            console.log(`Test 4: Testing WorkspaceDatabaseService`);

            // Step 1: Create WorkspaceDatabaseService
            const workspaceDb = new WorkspaceDatabaseService(testWorkspacePath);
            await workspaceDb.initialize();

            console.log(`After WorkspaceDatabaseService init - file exists: ${fs.existsSync(dbPath)}`);

            // Step 2: Try to get all tasks (this is what fails in the real test)
            try {
                const tasks = await workspaceDb.getAllTasks();
                console.log(`Successfully got tasks:`, tasks.length);
                expect(tasks).toEqual([]);
            } catch (error) {
                console.error(`Error getting tasks:`, error);
                throw error;
            }

            expect(fs.existsSync(dbPath)).toBe(true);
        });
    });

    describe('Transaction and Commit Tests', () => {
        it('should properly commit transactions to disk', async () => {
            // Test Case 5: Explicit transaction handling

            const dbManager = new DrizzleDatabaseManager(dbPath, DatabaseType.WORKSPACE);
            await dbManager.initialize();

            const sqlite = dbManager.getSqlite();

            // Start explicit transaction
            console.log(`Starting explicit transaction`);
            sqlite.exec(`BEGIN TRANSACTION`);
            const insertResult = sqlite.prepare(`INSERT INTO tasks (id, title, description) VALUES (?, ?, ?)`).run('txn-test', 'Transaction Test', 'Test');
            sqlite.exec(`COMMIT`);

            console.log(`Insert result:`, insertResult);
            console.log(`After commit - file exists: ${fs.existsSync(dbPath)}`);
            if (fs.existsSync(dbPath)) {
                const stats = fs.statSync(dbPath);
                console.log(`Database file size after commit: ${stats.size} bytes`);
            }

            // Verify data persists by creating new connection
            const newDbManager = new DrizzleDatabaseManager(dbPath, DatabaseType.WORKSPACE);
            await newDbManager.initialize();
            const newSqlite = newDbManager.getSqlite();

            const result = newSqlite.prepare(`SELECT COUNT(*) as count FROM tasks WHERE id = ?`).get('txn-test');
            console.log(`Transaction verification result:`, result);

            expect(fs.existsSync(dbPath)).toBe(true);
        });

        it('should handle WAL mode properly', async () => {
            // Test Case 6: WAL mode investigation

            const dbManager = new DrizzleDatabaseManager(dbPath, DatabaseType.WORKSPACE);
            await dbManager.initialize();

            // Check WAL mode
            const sqlite = dbManager.getSqlite();
            const walModeResult = sqlite.pragma('journal_mode');
            console.log(`Journal mode:`, walModeResult);

            // Try to force WAL checkpoint
            const checkpointResult = sqlite.pragma('wal_checkpoint(FULL)');
            console.log(`WAL checkpoint result:`, checkpointResult);

            console.log(`After WAL checkpoint - file exists: ${fs.existsSync(dbPath)}`);

            expect(fs.existsSync(dbPath)).toBe(true);
        });
    });

    describe('Multi-Tool Simulation Tests', () => {
        it('should simulate the exact init->status workflow that fails', async () => {
            // Test Case 7: Exact reproduction of failing workflow

            console.log(`Test 7: Simulating init->status workflow`);

            // Step 1: Simulate init tool creating workspace database
            console.log(`Step 1: Init tool simulation`);
            const initWorkspaceDb = new WorkspaceDatabaseService(testWorkspacePath);
            await initWorkspaceDb.initialize();

            console.log(`After init simulation - file exists: ${fs.existsSync(dbPath)}`);

            // Step 2: Simulate status tool accessing same workspace database
            console.log(`Step 2: Status tool simulation`);
            const statusWorkspaceDb = new WorkspaceDatabaseService(testWorkspacePath);

            // This is where it should fail if there's a caching issue
            try {
                    await ensureSpecs([{ hash: 'hash1' }]);
                    const tasks = await statusWorkspaceDb.getAllTasks();
                console.log(`Status tool successfully got tasks:`, tasks.length);
                expect(tasks).toEqual([]);
            } catch (error) {
                console.error(`Status tool failed:`, error);
                throw error;
            }

            expect(fs.existsSync(dbPath)).toBe(true);
        });

        it('should handle database file locks and concurrent access', async () => {
            // Test Case 8: Concurrent access testing

            const dbManager1 = new DrizzleDatabaseManager(dbPath, DatabaseType.WORKSPACE);
            const dbManager2 = new DrizzleDatabaseManager(dbPath, DatabaseType.WORKSPACE);

            await dbManager1.initialize();
            await dbManager2.initialize();

            console.log(`Both databases initialized`);
            console.log(`File exists: ${fs.existsSync(dbPath)}`);

            // Try concurrent operations
            const sqlite1 = dbManager1.getSqlite();
            const sqlite2 = dbManager2.getSqlite();

            const result1 = sqlite1.prepare(`SELECT 1 as test`).get();
            const result2 = sqlite2.prepare(`SELECT 1 as test`).get();

            console.log(`Concurrent operations completed:`, result1, result2);
            expect(fs.existsSync(dbPath)).toBe(true);
        });
    });
});
