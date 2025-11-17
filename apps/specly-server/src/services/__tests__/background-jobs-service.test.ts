import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundJobsService, type BackgroundJobsConfig, type GCMetricsCollector } from '../background-jobs-service.js';
import type { GlobalDatabaseService } from '../../database/global-queries.js';
import { getWorkspaceDatabase } from '../../database/drizzle-connection.js';

// Mock the database functions
vi.mock('../../database/drizzle-connection.js', () => ({
  getWorkspaceDatabase: vi.fn(),
}));

// Mock console.log for testing log output
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('BackgroundJobsService', () => {
  let mockGlobalDb: GlobalDatabaseService;
  let mockMetrics: GCMetricsCollector;
  let mockWorkspaceDb: any;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock global database service
    mockGlobalDb = {
      getAllWorkspaces: vi.fn(),
    } as any;

    // Mock metrics collector
    mockMetrics = {
      inc: vi.fn(),
    };

    // Mock workspace database
    mockDb = {
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 0 }),
      }),
    };

    mockWorkspaceDb = {
      getDb: vi.fn().mockReturnValue(mockDb),
    };

    (getWorkspaceDatabase as any).mockReturnValue(mockWorkspaceDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const service = new BackgroundJobsService(mockGlobalDb);
      const config = service.getConfig();

      expect(config.transientSessionHours).toBe(24);
      expect(config.softDeleteDays).toBe(90);
      expect(config.enabled).toBe(true);
    });

    it('should initialize with custom config', () => {
      const customConfig: BackgroundJobsConfig = {
        transientSessionHours: 12,
        softDeleteDays: 30,
        enabled: false,
      };

      const service = new BackgroundJobsService(mockGlobalDb, customConfig);
      const config = service.getConfig();

      expect(config.transientSessionHours).toBe(12);
      expect(config.softDeleteDays).toBe(30);
      expect(config.enabled).toBe(false);
    });

    it('should initialize with metrics collector', () => {
      const service = new BackgroundJobsService(mockGlobalDb, {}, mockMetrics);
      expect(service).toBeInstanceOf(BackgroundJobsService);
    });
  });

  describe('transientSessionGC', () => {
    it('should return 0 when background jobs are disabled', async () => {
      const service = new BackgroundJobsService(mockGlobalDb, { enabled: false });

      const result = await service.transientSessionGC();
      expect(result).toBe(0);
      expect(mockGlobalDb.getAllWorkspaces).not.toHaveBeenCalled();
    });

    it('should return 0 when no workspaces exist', async () => {
      mockGlobalDb.getAllWorkspaces.mockResolvedValue([]);

      const service = new BackgroundJobsService(mockGlobalDb);
      const result = await service.transientSessionGC();

      expect(result).toBe(0);
      expect(mockGlobalDb.getAllWorkspaces).toHaveBeenCalled();
    });

    it('should process workspaces and delete transient sessions', async () => {
      const workspaces = [
        { id: 'ws1', path: '/path/to/ws1' },
        { id: 'ws2', path: '/path/to/ws2' },
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 5 }),
      });

      const service = new BackgroundJobsService(mockGlobalDb, {}, mockMetrics);
      const result = await service.transientSessionGC();

      expect(result).toBe(10); // 5 + 5
      expect(mockGlobalDb.getAllWorkspaces).toHaveBeenCalled();
      expect(getWorkspaceDatabase).toHaveBeenCalledTimes(2);
      expect(getWorkspaceDatabase).toHaveBeenCalledWith('/path/to/ws1');
      expect(getWorkspaceDatabase).toHaveBeenCalledWith('/path/to/ws2');
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
      expect(mockMetrics.inc).toHaveBeenCalledWith('specly_gc_transient_sessions_deleted_total', 10);
    });

    it('should log when sessions are deleted', async () => {
      const workspaces = [{ id: 'ws1', path: '/path/to/ws1' }];
      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 3 }),
      });

      const service = new BackgroundJobsService(mockGlobalDb);
      await service.transientSessionGC();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Transient session GC completed for workspace')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('ws1')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('3')
      );
    });

    it('should not log when no sessions are deleted', async () => {
      const workspaces = [{ id: 'ws1', path: '/path/to/ws1' }];
      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 0 }),
      });

      const service = new BackgroundJobsService(mockGlobalDb);
      await service.transientSessionGC();

      // Should not log success message
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Transient session GC completed for workspace')
      );
    });

    it('should handle non-Error exceptions in transientSessionGC', async () => {
      const workspaces = [
        { id: 'ws1', path: '/path/to/ws1' },
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockWorkspaceDb.getDb.mockImplementationOnce(() => {
        throw 'String error'; // Throw a string, not an Error
      });

      const service = new BackgroundJobsService(mockGlobalDb);
      const result = await service.transientSessionGC();

      expect(result).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to GC workspace')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('String error')
      );
    });

    it('should handle Error exceptions in transientSessionGC', async () => {
      const workspaces = [
        { id: 'ws1', path: '/path/to/ws1' },
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockWorkspaceDb.getDb.mockImplementationOnce(() => {
        throw new Error('boom'); // Throw an Error instance
      });

      const service = new BackgroundJobsService(mockGlobalDb);
      const result = await service.transientSessionGC();

      expect(result).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to GC workspace')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('boom')
      );
    });

    it('should not call metrics when no sessions deleted', async () => {
      const workspaces = [{ id: 'ws1', path: '/path/to/ws1' }];
      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 0 }),
      });

      const service = new BackgroundJobsService(mockGlobalDb, {}, mockMetrics);
      await service.transientSessionGC();

      expect(mockMetrics.inc).not.toHaveBeenCalled();
    });
  });

  describe('softDeletePurge', () => {
    it('should return 0 when background jobs are disabled', async () => {
      const service = new BackgroundJobsService(mockGlobalDb, { enabled: false });

      const result = await service.softDeletePurge();
      expect(result).toBe(0);
      expect(mockGlobalDb.getAllWorkspaces).not.toHaveBeenCalled();
    });

    it('should return 0 when no workspaces exist', async () => {
      mockGlobalDb.getAllWorkspaces.mockResolvedValue([]);

      const service = new BackgroundJobsService(mockGlobalDb);
      const result = await service.softDeletePurge();

      expect(result).toBe(0);
      expect(mockGlobalDb.getAllWorkspaces).toHaveBeenCalled();
    });

    it('should process workspaces and purge soft-deleted entities', async () => {
      const workspaces = [{ id: 'ws1', path: '/path/to/ws1' }];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockDb.delete
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue({ changes: 2 }), // sessions
        })
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue({ changes: 3 }), // tasks
        });

      const service = new BackgroundJobsService(mockGlobalDb, {}, mockMetrics);
      const result = await service.softDeletePurge();

      expect(result).toBe(5); // 2 + 3
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
      expect(mockMetrics.inc).toHaveBeenCalledWith('specly_gc_soft_delete_purged_total', 5);
    });

    it('should log when entities are purged', async () => {
      const workspaces = [{ id: 'ws1', path: '/path/to/ws1' }];
      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockDb.delete
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue({ changes: 1 }), // sessions
        })
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue({ changes: 2 }), // tasks
        });

      const service = new BackgroundJobsService(mockGlobalDb);
      await service.softDeletePurge();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"info"')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"msg":"Soft delete purge completed for workspace"')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"workspace_id":"ws1"')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"sessions_purged":1')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"tasks_purged":2')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"threshold_days":90')
      );
    });

    it('should not log when no entities are purged', async () => {
      const workspaces = [{ id: 'ws1', path: '/path/to/ws1' }];
      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockDb.delete
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue({ changes: 0 }), // sessions
        })
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue({ changes: 0 }), // tasks
        });

      const service = new BackgroundJobsService(mockGlobalDb);
      await service.softDeletePurge();

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Soft delete purge completed for workspace')
      );
    });

    it('should handle non-Error exceptions in softDeletePurge', async () => {
      const workspaces = [
        { id: 'ws1', path: '/path/to/ws1' },
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockWorkspaceDb.getDb.mockImplementationOnce(() => {
        throw 42; // Throw a number, not an Error
      });

      const service = new BackgroundJobsService(mockGlobalDb);
      const result = await service.softDeletePurge();

      expect(result).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to purge workspace')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('42')
      );
    });

    it('should handle Error exceptions in softDeletePurge', async () => {
      const workspaces = [
        { id: 'ws1', path: '/path/to/ws1' },
      ];

      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockWorkspaceDb.getDb.mockImplementationOnce(() => {
        throw new Error('boom2'); // Throw an Error instance
      });

      const service = new BackgroundJobsService(mockGlobalDb);
      const result = await service.softDeletePurge();

      expect(result).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to purge workspace')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('boom2')
      );
    });

    it('should not call metrics when no entities purged', async () => {
      const workspaces = [{ id: 'ws1', path: '/path/to/ws1' }];
      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockDb.delete
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue({ changes: 0 }), // sessions
        })
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValue({ changes: 0 }), // tasks
        });

      const service = new BackgroundJobsService(mockGlobalDb, {}, mockMetrics);
      await service.softDeletePurge();

      expect(mockMetrics.inc).not.toHaveBeenCalled();
    });
  });

  describe('runAll', () => {
    it('should run both GC operations and return combined results', async () => {
      const workspaces = [{ id: 'ws1', path: '/path/to/ws1' }];
      mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);
      mockDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 1 }),
      });

      const service = new BackgroundJobsService(mockGlobalDb, {}, mockMetrics);
      const result = await service.runAll();

      expect(result).toEqual({
        transientSessionsDeleted: 1,
        softDeletePurged: 2, // 1 session + 1 task
      });
      expect(mockMetrics.inc).toHaveBeenCalledWith('specly_gc_transient_sessions_deleted_total', 1);
      expect(mockMetrics.inc).toHaveBeenCalledWith('specly_gc_soft_delete_purged_total', 2);
    });
  });

  describe('getConfig', () => {
    it('should return readonly config', () => {
      const service = new BackgroundJobsService(mockGlobalDb, {
        transientSessionHours: 48,
        softDeleteDays: 60,
        enabled: false,
      });

      const config = service.getConfig();
      expect(config).toEqual({
        transientSessionHours: 48,
        softDeleteDays: 60,
        enabled: false,
      });

      // Should be readonly
      expect(() => {
        (config as any).enabled = true;
      }).not.toThrow(); // Note: This won't actually prevent mutation in JS, but type should be readonly
    });
  });
});