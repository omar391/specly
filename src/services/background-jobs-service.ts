import type { GlobalDatabaseService } from '../database/global-queries.js';
import { getWorkspaceDatabase } from '../database/drizzle-connection.js';
import { sessions, tasks } from '../database/schema/workspace-schema.js';
import { lt, and, isNull, isNotNull } from 'drizzle-orm';

/**
 * Configuration for background jobs (GC & purge)
 */
export interface BackgroundJobsConfig {
    /** Hours of inactivity before transient session GC (default: 24) */
    transientSessionHours?: number;
    /** Days before soft-deleted entities are purged (default: 90) */
    softDeleteDays?: number;
    /** Enable background jobs (default: true) */
    enabled?: boolean;
}

/**
 * Metrics collector interface for GC operations
 */
export interface GCMetricsCollector {
    inc(counterName: string, count?: number): void;
}

/**
 * Results from GC operations
 */
export interface GCResults {
    transientSessionsDeleted: number;
    softDeletePurged: number;
}

/**
 * BackgroundJobsService
 * Handles garbage collection and soft delete purging to prevent database bloat.
 * 
 * Architecture refs:
 * - specly-architecture.md §16 GC & Retention
 * - migration_roadmap.md §6 Background Jobs
 */
export class BackgroundJobsService {
    private config: Required<BackgroundJobsConfig>;
    private metrics?: GCMetricsCollector;

    constructor(
        private globalDb: GlobalDatabaseService,
        config: BackgroundJobsConfig = {},
        metrics?: GCMetricsCollector
    ) {
        this.config = {
            transientSessionHours: config.transientSessionHours ?? 24,
            softDeleteDays: config.softDeleteDays ?? 90,
            enabled: config.enabled ?? true
        };
        this.metrics = metrics;
    }

    /**
     * Garbage collect transient sessions (no task_id) after inactivity threshold.
     * Architecture: §16 Transient session GC: `task_id IS NULL` & `last_active_at < now - 24h` → hard delete
     * 
     * Iterates all registered workspaces and cleans their sessions tables.
     */
    async transientSessionGC(): Promise<number> {
        if (!this.config.enabled) return 0;

        const threshold = new Date(Date.now() - this.config.transientSessionHours * 60 * 60 * 1000).toISOString();
        let totalDeleted = 0;

        // Get all active workspaces from global DB
        const workspaces = await this.globalDb.getAllWorkspaces();

        for (const workspace of workspaces) {
            try {
                const workspaceDb = getWorkspaceDatabase(workspace.path);
                const db = workspaceDb.getDb();

                // Delete transient sessions (task_id IS NULL) older than threshold
                const result = await db.delete(sessions)
                    .where(
                        and(
                            isNull(sessions.taskId),
                            lt(sessions.lastActiveAt, threshold)
                        )
                    );

                const deletedCount = result.changes ?? 0;
                totalDeleted += deletedCount;

                if (deletedCount > 0) {
                    console.log(JSON.stringify({
                        ts: new Date().toISOString(),
                        level: 'info',
                        msg: 'Transient session GC completed for workspace',
                        workspace_id: workspace.id,
                        deleted_count: deletedCount,
                        threshold_hours: this.config.transientSessionHours
                    }));
                }
            } catch (error) {
                console.log(JSON.stringify({
                    ts: new Date().toISOString(),
                    level: 'error',
                    msg: 'Failed to GC workspace',
                    workspace_id: workspace.id,
                    error: error instanceof Error ? error.message : String(error)
                }));
            }
        }

        if (totalDeleted > 0) {
            this.metrics?.inc('specly_gc_transient_sessions_deleted_total', totalDeleted);
        }

        return totalDeleted;
    }

    /**
     * Purge soft-deleted entities (tasks, sessions) beyond retention threshold.
     * Architecture: §16 Soft-deleted persistent tasks & sessions: purge if `deleted_at < now - 90d`
     * 
     * Iterates all registered workspaces and purges old soft-deleted records.
     */
    async softDeletePurge(): Promise<number> {
        if (!this.config.enabled) return 0;

        const threshold = new Date(Date.now() - this.config.softDeleteDays * 24 * 60 * 60 * 1000).toISOString();
        let totalPurged = 0;

        // Get all active workspaces from global DB
        const workspaces = await this.globalDb.getAllWorkspaces();

        for (const workspace of workspaces) {
            try {
                const workspaceDb = getWorkspaceDatabase(workspace.path);
                const db = workspaceDb.getDb();

                // Purge soft-deleted sessions
                const sessionsResult = await db.delete(sessions)
                    .where(
                        and(
                            isNotNull(sessions.deletedAt),
                            lt(sessions.deletedAt, threshold)
                        )
                    );

                // Purge soft-deleted tasks
                const tasksResult = await db.delete(tasks)
                    .where(
                        and(
                            isNotNull(tasks.deletedAt),
                            lt(tasks.deletedAt, threshold)
                        )
                    );

                const sessionsPurged = sessionsResult.changes ?? 0;
                const tasksPurged = tasksResult.changes ?? 0;
                const workspacePurged = sessionsPurged + tasksPurged;
                totalPurged += workspacePurged;

                if (workspacePurged > 0) {
                    console.log(JSON.stringify({
                        ts: new Date().toISOString(),
                        level: 'info',
                        msg: 'Soft delete purge completed for workspace',
                        workspace_id: workspace.id,
                        sessions_purged: sessionsPurged,
                        tasks_purged: tasksPurged,
                        threshold_days: this.config.softDeleteDays
                    }));
                }
            } catch (error) {
                console.log(JSON.stringify({
                    ts: new Date().toISOString(),
                    level: 'error',
                    msg: 'Failed to purge workspace',
                    workspace_id: workspace.id,
                    error: error instanceof Error ? error.message : String(error)
                }));
            }
        }

        if (totalPurged > 0) {
            this.metrics?.inc('specly_gc_soft_delete_purged_total', totalPurged);
        }

        return totalPurged;
    }

    /**
     * Run all GC operations and return combined results
     */
    async runAll(): Promise<GCResults> {
        const transientSessionsDeleted = await this.transientSessionGC();
        const softDeletePurged = await this.softDeletePurge();

        return {
            transientSessionsDeleted,
            softDeletePurged
        };
    }

    /**
     * Get current configuration
     */
    getConfig(): Readonly<Required<BackgroundJobsConfig>> {
        return { ...this.config };
    }
}
