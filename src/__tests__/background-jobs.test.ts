import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackgroundJobsService } from '../services/background-jobs-service.js';
import { initializeGlobalDatabaseService, getGlobalDatabaseService } from '../database/global-queries.js';
import { getWorkspaceDatabase, initializeWorkspaceDatabase, clearWorkspaceDatabaseCache } from '../database/drizzle-connection.js';
import { sessions, tasks } from '../database/schema/workspace-schema.js';

type NewSession = typeof sessions.$inferInsert;
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * SP-011: Background Jobs (GC, Purge & Retry Scheduling)
 * Tests for transient session GC and soft delete purging
 */

describe('SP-011: Background Jobs', () => {
  let globalDbService: ReturnType<typeof getGlobalDatabaseService>;
  let backgroundJobs: BackgroundJobsService;
  let metricsCollector: { counters: Record<string, number> };
  let testWorkspacePath: string;
  let testWorkspaceId: string;

  beforeEach(async () => {
    // Generate unique workspace ID per test
    testWorkspaceId = `ws-gc-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create temporary workspace directory with unique name per test
    const tempDir = path.join(os.tmpdir(), `test-workspace-gc-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    testWorkspacePath = tempDir;

    // Initialize in-memory global DB (fresh for each test)
    const { DrizzleDatabaseManager, DatabaseType } = await import('../database/drizzle-connection.js');
    const globalDbManager = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    await globalDbManager.initialize();
    await initializeGlobalDatabaseService();
    globalDbService = getGlobalDatabaseService();

    // Register workspace in global DB with unique ID
    await globalDbService.createWorkspace({
      id: testWorkspaceId,
      path: testWorkspacePath,
      name: 'Test Workspace'
    });

    // Initialize workspace database
    await initializeWorkspaceDatabase(testWorkspacePath);

    // Mock metrics collector
    metricsCollector = { counters: {} };
    const metrics = {
      inc: (counter: string, count: number = 1) => {
        metricsCollector.counters[counter] = (metricsCollector.counters[counter] || 0) + count;
      }
    };

    backgroundJobs = new BackgroundJobsService(globalDbService, {}, metrics);
  });

  afterEach(() => {
    // Cleanup workspace database cache and temp directory
    clearWorkspaceDatabaseCache();
    if (testWorkspacePath && fs.existsSync(testWorkspacePath)) {
      fs.rmSync(testWorkspacePath, { recursive: true, force: true });
    }
  });

  describe('Transient Session GC', () => {
    it('should delete transient sessions (no task_id) older than threshold', async () => {
      const workspaceDb = getWorkspaceDatabase(testWorkspacePath);
      const db = workspaceDb.getDb();
      const now = Date.now();
      const olderThan24h = new Date(now - 25 * 60 * 60 * 1000).toISOString();
      const recentActivity = new Date(now - 12 * 60 * 60 * 1000).toISOString();

      // Create old transient session (should be deleted)
      const oldTransient: NewSession = {
        id: 'session-old-transient',
        workspaceId: testWorkspaceId,
        createdAt: olderThan24h,
        lastActiveAt: olderThan24h,
        taskId: null // Transient
      };

      // Create recent transient session (should NOT be deleted)
      const recentTransient: NewSession = {
        id: 'session-recent-transient',
        workspaceId: testWorkspaceId,
        createdAt: recentActivity,
        lastActiveAt: recentActivity,
        taskId: null // Transient
      };

      await db.insert(sessions).values([oldTransient, recentTransient]);

      // Run GC
      const deletedCount = await backgroundJobs.transientSessionGC();

      // Verify only old transient session was deleted
      expect(deletedCount).toBe(1);

      // Verify remaining session
      const remainingSessions = await db.select().from(sessions);
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].id).toBe('session-recent-transient');

      // Verify metrics
      expect(metricsCollector.counters['specly_gc_transient_sessions_deleted_total']).toBe(1);
    });

    it('should preserve sessions with task_id even if old', async () => {
      const workspaceDb = getWorkspaceDatabase(testWorkspacePath);
      const db = workspaceDb.getDb();
      const olderThan24h = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

      // Create old session with task (persistent - should NOT be deleted)
      const persistentOldSession: NewSession = {
        id: 'session-persistent-old',
        workspaceId: testWorkspaceId,
        createdAt: olderThan24h,
        lastActiveAt: olderThan24h,
        taskId: 'task-123' // Has task - not transient
      };

      await db.insert(sessions).values([persistentOldSession]);

      // Run GC
      const deletedCount = await backgroundJobs.transientSessionGC();

      // Verify no deletion
      expect(deletedCount).toBe(0);

      // Verify session still exists
      const remainingSessions = await db.select().from(sessions);
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].id).toBe('session-persistent-old');
    });

    it('should respect custom transientSessionHours configuration', async () => {
      const workspaceDb = getWorkspaceDatabase(testWorkspacePath);
      const db = workspaceDb.getDb();
      const now = Date.now();
      const olderThan6h = new Date(now - 7 * 60 * 60 * 1000).toISOString();

      // Create custom service with 6-hour threshold
      const customJobs = new BackgroundJobsService(globalDbService, { transientSessionHours: 6 });

      const oldTransient: NewSession = {
        id: 'session-7h-old',
        workspaceId: testWorkspaceId,
        createdAt: olderThan6h,
        lastActiveAt: olderThan6h,
        taskId: null
      };

      await db.insert(sessions).values([oldTransient]);

      // Run GC with 6-hour threshold
      const deletedCount = await customJobs.transientSessionGC();

      // Should delete session older than 6 hours
      expect(deletedCount).toBe(1);
    });

    it('should return 0 when no sessions meet criteria', async () => {
      const workspaceDb = getWorkspaceDatabase(testWorkspacePath);
      const db = workspaceDb.getDb();
      const recentActivity = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

      const recentSession: NewSession = {
        id: 'session-recent',
        workspaceId: testWorkspaceId,
        createdAt: recentActivity,
        lastActiveAt: recentActivity,
        taskId: null
      };

      await db.insert(sessions).values([recentSession]);

      // Run GC
      const deletedCount = await backgroundJobs.transientSessionGC();

      // No deletions
      expect(deletedCount).toBe(0);

      // Metrics should not be incremented when count is 0
      expect(metricsCollector.counters['specly_gc_transient_sessions_deleted_total']).toBeUndefined();
    });
  });

  describe('Soft Delete Purge', () => {
    it('should purge soft-deleted sessions older than threshold', async () => {
      const workspaceDb = getWorkspaceDatabase(testWorkspacePath);
      const db = workspaceDb.getDb();
      const now = Date.now();
      const olderThan90d = new Date(now - 91 * 24 * 60 * 60 * 1000).toISOString();
      const recentDelete = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Create old soft-deleted session (should be purged)
      const oldDeleted: NewSession = {
        id: 'session-old-deleted',
        workspaceId: testWorkspaceId,
        createdAt: olderThan90d,
        lastActiveAt: olderThan90d,
        taskId: 'task-old',
        deletedAt: olderThan90d // Soft deleted
      };

      // Create recently soft-deleted session (should NOT be purged)
      const recentDeleted: NewSession = {
        id: 'session-recent-deleted',
        workspaceId: testWorkspaceId,
        createdAt: recentDelete,
        lastActiveAt: recentDelete,
        taskId: 'task-recent',
        deletedAt: recentDelete // Recently soft deleted
      };

      await db.insert(sessions).values([oldDeleted, recentDeleted]);

      // Run purge
      const purgedCount = await backgroundJobs.softDeletePurge();

      // Verify only old soft-deleted session was purged
      expect(purgedCount).toBe(1);

      // Verify remaining session
      const remainingSessions = await db.select().from(sessions);
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].id).toBe('session-recent-deleted');

      // Verify metrics
      expect(metricsCollector.counters['specly_gc_soft_delete_purged_total']).toBe(1);
    });

    it('should NOT purge sessions without deletedAt', async () => {
      const workspaceDb = getWorkspaceDatabase(testWorkspacePath);
      const db = workspaceDb.getDb();
      const olderThan90d = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();

      // Create old session WITHOUT deletedAt (should NOT be purged)
      const activeOldSession: NewSession = {
        id: 'session-active-old',
        workspaceId: testWorkspaceId,
        createdAt: olderThan90d,
        lastActiveAt: olderThan90d,
        taskId: 'task-old',
        deletedAt: null // Not soft deleted
      };

      await db.insert(sessions).values([activeOldSession]);

      // Run purge
      const purgedCount = await backgroundJobs.softDeletePurge();

      // No purge
      expect(purgedCount).toBe(0);

      // Session still exists
      const remainingSessions = await db.select().from(sessions);
      expect(remainingSessions).toHaveLength(1);
    });

    it('should respect custom softDeleteDays configuration', async () => {
      const workspaceDb = getWorkspaceDatabase(testWorkspacePath);
      const db = workspaceDb.getDb();
      const olderThan30d = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

      // Create custom service with 30-day threshold
      const customJobs = new BackgroundJobsService(globalDbService, { softDeleteDays: 30 });

      const deletedSession: NewSession = {
        id: 'session-31d-deleted',
        workspaceId: testWorkspaceId,
        createdAt: olderThan30d,
        lastActiveAt: olderThan30d,
        taskId: 'task-123',
        deletedAt: olderThan30d
      };

      await db.insert(sessions).values([deletedSession]);

      // Run purge with 30-day threshold
      const purgedCount = await customJobs.softDeletePurge();

      // Should purge session older than 30 days
      expect(purgedCount).toBe(1);
    });
  });

  describe('Combined Operations', () => {
    it('should run all GC operations via runAll()', async () => {
      const workspaceDb = getWorkspaceDatabase(testWorkspacePath);
      const db = workspaceDb.getDb();
      const now = Date.now();
      const olderThan24h = new Date(now - 25 * 60 * 60 * 1000).toISOString();
      const olderThan90d = new Date(now - 91 * 24 * 60 * 60 * 1000).toISOString();

      // Old transient session
      const oldTransient: NewSession = {
        id: 'session-transient',
        workspaceId: testWorkspaceId,
        createdAt: olderThan24h,
        lastActiveAt: olderThan24h,
        taskId: null
      };

      // Old soft-deleted session
      const oldDeleted: NewSession = {
        id: 'session-deleted',
        workspaceId: testWorkspaceId,
        createdAt: olderThan90d,
        lastActiveAt: olderThan90d,
        taskId: 'task-123',
        deletedAt: olderThan90d
      };

      await db.insert(sessions).values([oldTransient, oldDeleted]);

      // Run all operations
      const results = await backgroundJobs.runAll();

      // Verify both operations executed
      expect(results.transientSessionsDeleted).toBe(1);
      expect(results.softDeletePurged).toBe(1);

      // Verify metrics
      expect(metricsCollector.counters['specly_gc_transient_sessions_deleted_total']).toBe(1);
      expect(metricsCollector.counters['specly_gc_soft_delete_purged_total']).toBe(1);
    });
  });

  describe('Configuration', () => {
    it('should return current configuration via getConfig()', () => {
      const config = backgroundJobs.getConfig();
      
      expect(config.transientSessionHours).toBe(24);
      expect(config.softDeleteDays).toBe(90);
      expect(config.enabled).toBe(true);
    });

    it('should respect enabled=false configuration', async () => {
      const disabledJobs = new BackgroundJobsService(globalDbService, { enabled: false });
      
      const workspaceDb = getWorkspaceDatabase(testWorkspacePath);
      const db = workspaceDb.getDb();
      const olderThan24h = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

      const oldTransient: NewSession = {
        id: 'session-test',
        workspaceId: testWorkspaceId,
        createdAt: olderThan24h,
        lastActiveAt: olderThan24h,
        taskId: null
      };

      await db.insert(sessions).values([oldTransient]);

      // Run GC with disabled config
      const deletedCount = await disabledJobs.transientSessionGC();
      
      // Should not delete anything when disabled
      expect(deletedCount).toBe(0);

      // Session should still exist
      const remainingSessions = await db.select().from(sessions);
      expect(remainingSessions).toHaveLength(1);
    });
  });
});
