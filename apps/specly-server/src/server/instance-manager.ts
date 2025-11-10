// Specly InstanceManager: App-specific wrapper around mcp-kit InstanceManager

import fs from "fs";
import path from "path";
import * as os from "os";
import * as http from "http";
import type { Server as HttpServer } from 'http';
import { BackgroundJobsService } from '../services/background-jobs-service.js';
import type { GlobalDatabaseService } from '../database/global-queries.js';
import { InstanceManager as McpInstanceManager, InstanceRole, type InstanceLock, ProxyManager } from '@omar391/mcp-kit/server/express';

export { InstanceRole, type InstanceLock };

export class SpeclyInstanceManager {
  static VERSION = SpeclyInstanceManager.getVersion();

  private coordinator: McpInstanceManager;
  private gcInterval: NodeJS.Timeout | null = null;
  private backgroundJobs?: BackgroundJobsService;

  static isPidAlive(pid: number): boolean {
    return McpInstanceManager.isPidAlive(pid);
  }

  constructor(lockPath?: string, port?: number) {
    this.coordinator = new McpInstanceManager({
      lockPath: lockPath ?? path.join(os.tmpdir(), "specly-8989.lock"),
      port: port ?? 8989,
      getVersion: SpeclyInstanceManager.getVersion
    });
  }

  // Delegate properties to coordinator
  get role(): InstanceRole {
    return this.coordinator.role;
  }

  set role(value: InstanceRole) {
    this.coordinator.role = value;
  }

  get port(): number {
    return this.coordinator.port;
  }

  set port(value: number) {
    this.coordinator.port = value;
  }

  get proxyPort(): number | null {
    return this.coordinator.proxyPort;
  }

  get version(): string {
    return this.coordinator.version;
  }

  get proxyManager(): ProxyManager | undefined {
    return this.coordinator.proxyManager;
  }

  get lock(): InstanceLock | null {
    return this.coordinator.lock;
  }

  // Delegate methods to coordinator
  async tryBecomeMain(): Promise<boolean> {
    return this.coordinator.tryBecomeMain();
  }

  async readLock(): Promise<InstanceLock | null> {
    return this.coordinator.readLock();
  }

  async removeLock(): Promise<void> {
    return this.coordinator.removeLock();
  }

  async writeLock(): Promise<void> {
    return this.coordinator.writeLock();
  }

  async fetchMainVersion(): Promise<string | null> {
    return this.coordinator.fetchMainVersion();
  }

  async requestMainShutdown(): Promise<boolean> {
    return this.coordinator.requestMainShutdown();
  }

  async requestMainTransition(): Promise<boolean> {
    return this.coordinator.requestMainTransition();
  }

  async waitForPort(timeoutMs?: number): Promise<boolean> {
    return this.coordinator.waitForPort(timeoutMs);
  }

  async startProxy(config?: { port?: number }): Promise<HttpServer> {
    return this.coordinator.startProxy(config);
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
    if (this.coordinator.role !== InstanceRole.MAIN) {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'debug',
        msg: 'Background jobs not started - not MAIN instance',
        role: this.coordinator.role
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
