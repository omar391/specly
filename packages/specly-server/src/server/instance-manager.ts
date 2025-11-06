// Specly InstanceManager: App-specific wrapper around mcp-kit BaseInstanceManager

import fs from "fs";
import path from "path";
import os from "os";
import { BackgroundJobsService } from '../services/background-jobs-service.js';
import type { GlobalDatabaseService } from '../database/global-queries.js';
import { BaseInstanceManager, InstanceRole, type InstanceLock } from '@omar391/mcp-kit/node-instance';

export { InstanceRole, type InstanceLock };

export class InstanceManager {
  static VERSION = InstanceManager.getVersion();

  private base: BaseInstanceManager;
  private _port: number;
  private _lockPath: string;
  // Track lock state for compatibility with existing tests
  public lock: InstanceLock | null = null;
  // Allow tests to override role for gating logic checks
  private _roleOverride?: InstanceRole;
  private gcInterval: NodeJS.Timeout | null = null;
  private backgroundJobs?: BackgroundJobsService;

  constructor(lockPath?: string, port?: number) {
    this._lockPath = lockPath ?? path.join(os.tmpdir(), "specly-8989.lock");
    this._port = port ?? 8989;
    this.base = new BaseInstanceManager({ lockPath: this._lockPath, port: this._port, version: InstanceManager.VERSION });
  }

  // Read version from package.json for sustainable version detection
  private static getVersion(): string {
    try {
      const pkgPath = new URL('../../package.json', import.meta.url);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.1.0';
    } catch {
      return '0.1.0';
    }
  }

  // Composition accessors and forwarders
  get port(): number { return this._port; }
  set port(p: number) {
    if (p !== this._port) {
      this._port = p;
      this.base = new BaseInstanceManager({ lockPath: this._lockPath, port: this._port, version: InstanceManager.VERSION });
    }
  }
  get role(): InstanceRole { return this._roleOverride ?? this.base.role; }
  set role(r: InstanceRole) { this._roleOverride = r; }
  get proxyPort(): number | null { return this.base.proxyPort; }

  async tryBecomeMain(): Promise<boolean> { return this.base.tryBecomeMain(); }
  async readLock(): Promise<InstanceLock | null> {
    const res = await this.base.readLock();
    this.lock = res; // ensure explicit null when missing
    return res;
  }
  async writeLock(): Promise<void> {
    await this.base.writeLock();
    // refresh cached lock state for tests that inspect it
    this.lock = await this.base.readLock();
  }
  async removeLock(): Promise<void> {
    await this.base.removeLock();
    this.lock = null;
  }
  static isPidAlive(pid: number): boolean { return BaseInstanceManager.isPidAlive(pid); }
  async fetchMainVersion(): Promise<string | null> { return this.base.fetchMainVersion(); }
  async requestMainShutdown(): Promise<boolean> { return this.base.requestMainShutdown(); }
  async requestMainTransition(): Promise<boolean> { return this.base.requestMainTransition(); }
  async waitForPort(timeoutMs?: number): Promise<boolean> { return this.base.waitForPort(timeoutMs); }
  async startProxy() { return this.base.startProxy(); }

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
