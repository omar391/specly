// Specly InstanceManager: App-specific extension of mcp-kit InstanceManager

import fs from "fs";
import path from "path";
import * as os from "os";
import { BackgroundJobsService } from '../services/background-jobs-service.js';
import type { GlobalDatabaseService } from '../database/global-queries.js';
import { InstanceManager, InstanceRole, type InstanceLock, ProxyManager } from '@omar391/mcp-kit/server/local/node-instance';

export { InstanceRole, type InstanceLock };

export class SpeclyInstanceManager extends InstanceManager {
  static VERSION = SpeclyInstanceManager.getVersion();

  private gcInterval: NodeJS.Timeout | null = null;
  private backgroundJobs?: BackgroundJobsService;

  static isPidAlive(pid: number): boolean {
    return InstanceManager.isPidAlive(pid);
  }

  constructor(lockPath?: string, port?: number) {
    super({
      lockPath: lockPath ?? path.join(os.tmpdir(), "specly-8989.lock"),
      port: port ?? 8989,
      getVersion: SpeclyInstanceManager.getVersion
    });
  }

  // Read version from package.json for sustainable version detection
  public static getVersion(): string {
    try {
      const pkgPath = new URL('../../package.json', import.meta.url);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.1.0';
    } catch {
      return '0.1.0';
    }
  }

  /**
   * Start background jobs (GC sweeps) - only runs on MAIN instance
   * App-specific: Specly database cleanup
   */
  startBackgroundJobs(globalDb: GlobalDatabaseService, config?: { transientSessionHours?: number; softDeleteDays?: number }): void {
    if (this.role !== InstanceRole.MAIN) {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'debug',
        msg: 'Background jobs not started - not MAIN instance',
        role: this.role
      }));
      return;
    }

    const gcConfig = {
      transientSessionHours: config?.transientSessionHours ?? parseInt(process.env.SPECLY_GC_TRANSIENT_SESSION_HOURS || '24', 10),
      softDeleteDays: config?.softDeleteDays ?? parseInt(process.env.SPECLY_GC_SOFT_DELETE_DAYS || '90', 10),
      enabled: process.env.SPECLY_GC_ENABLED !== 'false'
    };

    if (!gcConfig.enabled) {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'Background jobs disabled via SPECLY_GC_ENABLED=false'
      }));
      return;
    }

    this.backgroundJobs = new BackgroundJobsService(globalDb, gcConfig);

    this.backgroundJobs.runAll().then(results => {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'Initial GC sweep completed',
        transient_sessions_deleted: results.transientSessionsDeleted,
        soft_delete_purged: results.softDeletePurged
      }));
    }).catch(err => {
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        msg: 'Initial GC sweep failed',
        error: err.message
      }));
    });

    const intervalMs = 60 * 60 * 1000; // 1 hour
    this.gcInterval = setInterval(() => {
      this.backgroundJobs!.runAll().catch(err => {
        console.error(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          msg: 'Scheduled GC sweep failed',
          error: err.message
        }));
      });
    }, intervalMs);

    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      msg: 'Background jobs started',
      transient_session_hours: gcConfig.transientSessionHours,
      soft_delete_days: gcConfig.softDeleteDays,
      sweep_interval_ms: intervalMs
    }));
  }

  /**
   * Stop background jobs (cleanup)
   */
  stopBackgroundJobs(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'Background jobs stopped'
      }));
    }
  }
}
