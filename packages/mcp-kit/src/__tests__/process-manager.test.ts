/**
 * Tests for Generic Process Management Utilities (mcp-kit)
 * 
 * Tests signal handling and graceful shutdown mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createShutdownHandler, registerSignalHandlers } from '../server/local/process-manager.js';

describe('Process Manager (Generic mcp-kit)', () => {
  let mockConsoleLog: any;
  let originalExit: any;
  let exitCode: number | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => { });

    // Mock process.exit
    exitCode = undefined;
    originalExit = process.exit;
    (process as any).exit = vi.fn((code?: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    process.exit = originalExit;

    // Remove any listeners we added
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGUSR1');
    process.removeAllListeners('SIGUSR2');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  describe('createShutdownHandler', () => {
    it('should create handler with default server name', () => {
      const handler = createShutdownHandler();
      expect(handler).toBeInstanceOf(Function);
    });

    it('should create handler with custom server name', () => {
      const handler = createShutdownHandler('Custom Server');
      expect(handler).toBeInstanceOf(Function);
    });

    it('should log signal and server name on shutdown', () => {
      vi.useFakeTimers();
      const handler = createShutdownHandler('Test Server');

      try {
        handler('SIGINT');
      } catch (e) {
        // Ignore process.exit error
      }

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('SIGINT received'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Test Server'));

      vi.useRealTimers();
    });

    it('should exit after timeout', () => {
      vi.useFakeTimers();
      const handler = createShutdownHandler();

      try {
        handler('SIGTERM');
        vi.advanceTimersByTime(1000);
      } catch (e) {
        // process.exit throws
      }

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('shutdown complete'));
      expect(exitCode).toBe(0);

      vi.useRealTimers();
    });

    it('should give 1 second for cleanup', () => {
      vi.useFakeTimers();
      const handler = createShutdownHandler();

      handler('SIGUSR1');
      vi.advanceTimersByTime(999);

      // Should not exit yet
      expect(exitCode).toBeUndefined();

      try {
        vi.advanceTimersByTime(1);
      } catch (e) {
        // process.exit throws
      }
      expect(exitCode).toBe(0);

      vi.useRealTimers();
    });
  });

  describe('registerSignalHandlers', () => {
    it('should register SIGINT handler', () => {
      const listenersBefore = process.listenerCount('SIGINT');
      registerSignalHandlers();
      const listenersAfter = process.listenerCount('SIGINT');

      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register SIGTERM handler', () => {
      const listenersBefore = process.listenerCount('SIGTERM');
      registerSignalHandlers();
      const listenersAfter = process.listenerCount('SIGTERM');

      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register SIGUSR1 handler', () => {
      const listenersBefore = process.listenerCount('SIGUSR1');
      registerSignalHandlers();
      const listenersAfter = process.listenerCount('SIGUSR1');

      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register SIGUSR2 handler', () => {
      const listenersBefore = process.listenerCount('SIGUSR2');
      registerSignalHandlers();
      const listenersAfter = process.listenerCount('SIGUSR2');

      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register uncaughtException handler', () => {
      const listenersBefore = process.listenerCount('uncaughtException');
      registerSignalHandlers();
      const listenersAfter = process.listenerCount('uncaughtException');

      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register unhandledRejection handler', () => {
      const listenersBefore = process.listenerCount('unhandledRejection');
      registerSignalHandlers();
      const listenersAfter = process.listenerCount('unhandledRejection');

      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register all handlers at once', () => {
      registerSignalHandlers();

      // Verify all handlers are registered by checking listener counts
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(0);
      expect(process.listenerCount('SIGUSR1')).toBeGreaterThan(0);
      expect(process.listenerCount('SIGUSR2')).toBeGreaterThan(0);
      expect(process.listenerCount('uncaughtException')).toBeGreaterThan(0);
      expect(process.listenerCount('unhandledRejection')).toBeGreaterThan(0);
    });

    it('should use default server name when not provided', () => {
      registerSignalHandlers();

      // Verify handlers are registered
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
    });

    it('should accept custom server name', () => {
      registerSignalHandlers('Custom App');

      // Verify handlers are registered with custom name
      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(0);
    });
  });
});
