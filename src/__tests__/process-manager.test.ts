/**
 * Tests for Process Management Utilities
 * 
 * Tests process detection, cleanup, signal handling, and shutdown procedures
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as processManager from '../utils/process-manager.js';
import { exec } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Helper to create mock exec response
function mockExecResponse(stdout: string, stderr: string = '', error: any = null) {
  return (cmd: string, callback: any) => {
    process.nextTick(() => callback(error, { stdout, stderr }));
  };
}

describe('Process Manager', () => {
  const testPort = 18765;
  let mockConsoleLog: any;
  let mockConsoleWarn: any;
  let mockConsoleError: any;
  let originalExit: any;
  let exitCode: number | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
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
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
    process.exit = originalExit;
    
    // Remove any listeners we added
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGUSR1');
    process.removeAllListeners('SIGUSR2');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  describe('ensurePortFree', () => {
    it('should return true when port is already free', async () => {
      (exec as any).mockImplementation(mockExecResponse('', '', new Error('lsof: no processes')));

      const result = await processManager.ensurePortFree(testPort);
      expect(result).toBe(true);
    });

    it('should return true for empty stdout', async () => {
      (exec as any).mockImplementation(mockExecResponse(''));

      const result = await processManager.ensurePortFree(testPort);
      expect(result).toBe(true);
    });

    it('should kill processes and free port', async () => {
      let callCount = 0;
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        callCount++;
        if (cmd.includes('lsof -i :') && callCount === 1) {
          // First check: port in use
          process.nextTick(() => callback(null, { stdout: 'COMMAND PID\nnode 12345', stderr: '' }));
        } else if (cmd.includes('lsof -ti :')) {
          // Get PIDs
          process.nextTick(() => callback(null, { stdout: '12345', stderr: '' }));
        } else if (cmd.includes('kill ')) {
          // Kill succeeds
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        } else if (cmd.includes('lsof -i :') && callCount > 3) {
          // Final check: port free
          process.nextTick(() => callback(new Error('no processes'), { stdout: '', stderr: '' }));
        }
      });

      const result = await processManager.ensurePortFree(testPort);
      expect(result).toBe(true);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Port 18765 is in use'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Port 18765 is now free'));
    });

    it('should try graceful kill first, then force kill', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :')) {
          process.nextTick(() => callback(null, { stdout: 'process', stderr: '' }));
        } else if (cmd.includes('lsof -ti :')) {
          process.nextTick(() => callback(null, { stdout: '12345', stderr: '' }));
        } else if (cmd === 'kill 12345') {
          // Graceful kill fails
          process.nextTick(() => callback(new Error('Process not responding'), { stdout: '', stderr: '' }));
        } else if (cmd === 'kill -9 12345') {
          // Force kill succeeds
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      await processManager.ensurePortFree(testPort);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Force killed process 12345'));
    });

    it('should handle multiple PIDs', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :')) {
          process.nextTick(() => callback(null, { stdout: 'processes', stderr: '' }));
        } else if (cmd.includes('lsof -ti :')) {
          process.nextTick(() => callback(null, { stdout: '12345\n67890\n99999', stderr: '' }));
        } else if (cmd.includes('kill ')) {
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      await processManager.ensurePortFree(testPort);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Gracefully terminated process 12345'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Gracefully terminated process 67890'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Gracefully terminated process 99999'));
    });

    it('should return false when port still in use after cleanup', async () => {
      let checkCount = 0;
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :')) {
          checkCount++;
          // Port always in use
          process.nextTick(() => callback(null, { stdout: 'stubborn process', stderr: '' }));
        } else if (cmd.includes('lsof -ti :')) {
          process.nextTick(() => callback(null, { stdout: '12345', stderr: '' }));
        } else if (cmd.includes('kill')) {
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      const result = await processManager.ensurePortFree(testPort);
      expect(result).toBe(false);
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Port 18765 still in use after cleanup'));
    });

    it('should handle kill failures', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :')) {
          process.nextTick(() => callback(null, { stdout: 'process', stderr: '' }));
        } else if (cmd.includes('lsof -ti :')) {
          process.nextTick(() => callback(null, { stdout: '12345', stderr: '' }));
        } else if (cmd.includes('kill')) {
          // Both graceful and force kill fail
          process.nextTick(() => callback(new Error('Kill failed'), { stdout: '', stderr: '' }));
        }
      });

      await processManager.ensurePortFree(testPort);
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to kill process 12345'), expect.any(Error));
    });

    it('should filter empty PIDs', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :')) {
          process.nextTick(() => callback(null, { stdout: 'process', stderr: '' }));
        } else if (cmd.includes('lsof -ti :')) {
          // PIDs with empty lines
          process.nextTick(() => callback(null, { stdout: '12345\n\n\n67890\n', stderr: '' }));
        } else if (cmd.includes('kill')) {
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      await processManager.ensurePortFree(testPort);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('process 12345'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('process 67890'));
    });

    it('should return true when no PIDs found after initial check', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :') && !cmd.includes('-ti')) {
          process.nextTick(() => callback(null, { stdout: 'header line', stderr: '' }));
        } else if (cmd.includes('lsof -ti :')) {
          // No PIDs
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      const result = await processManager.ensurePortFree(testPort);
      expect(result).toBe(true);
    });

    it('should handle lsof error with message containing "lsof"', async () => {
      const error = new Error('lsof command not found');
      (exec as any).mockImplementation(mockExecResponse('', '', error));

      const result = await processManager.ensurePortFree(testPort);
      expect(result).toBe(true); // Treats lsof error as port free
    });

    it('should return false for non-lsof errors', async () => {
      const error = new Error('Unknown system error');
      (exec as any).mockImplementation(mockExecResponse('', '', error));

      const result = await processManager.ensurePortFree(testPort);
      expect(result).toBe(false);
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Error checking port'), expect.any(Error));
    });
  });

  describe('createShutdownHandler', () => {
    it('should create handler with default server name', () => {
      const handler = processManager.createShutdownHandler();
      expect(handler).toBeInstanceOf(Function);
    });

    it('should create handler with custom server name', () => {
      const handler = processManager.createShutdownHandler('Custom Server');
      expect(handler).toBeInstanceOf(Function);
    });

    it('should log signal and server name on shutdown', () => {
      vi.useFakeTimers();
      const handler = processManager.createShutdownHandler('Test Server');
      
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
      const handler = processManager.createShutdownHandler();
      
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
      const handler = processManager.createShutdownHandler();
      
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
      processManager.registerSignalHandlers();
      const listenersAfter = process.listenerCount('SIGINT');
      
      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register SIGTERM handler', () => {
      const listenersBefore = process.listenerCount('SIGTERM');
      processManager.registerSignalHandlers();
      const listenersAfter = process.listenerCount('SIGTERM');
      
      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register SIGUSR1 handler', () => {
      const listenersBefore = process.listenerCount('SIGUSR1');
      processManager.registerSignalHandlers();
      const listenersAfter = process.listenerCount('SIGUSR1');
      
      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register SIGUSR2 handler', () => {
      const listenersBefore = process.listenerCount('SIGUSR2');
      processManager.registerSignalHandlers();
      const listenersAfter = process.listenerCount('SIGUSR2');
      
      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register uncaughtException handler', () => {
      const listenersBefore = process.listenerCount('uncaughtException');
      processManager.registerSignalHandlers();
      const listenersAfter = process.listenerCount('uncaughtException');
      
      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register unhandledRejection handler', () => {
      const listenersBefore = process.listenerCount('unhandledRejection');
      processManager.registerSignalHandlers();
      const listenersAfter = process.listenerCount('unhandledRejection');
      
      expect(listenersAfter).toBeGreaterThan(listenersBefore);
    });

    it('should register all handlers at once', () => {
      processManager.registerSignalHandlers();
      
      // Verify all handlers are registered by checking listener counts
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(0);
      expect(process.listenerCount('SIGUSR1')).toBeGreaterThan(0);
      expect(process.listenerCount('SIGUSR2')).toBeGreaterThan(0);
      expect(process.listenerCount('uncaughtException')).toBeGreaterThan(0);
      expect(process.listenerCount('unhandledRejection')).toBeGreaterThan(0);
    });

    it('should use default server name when not provided', () => {
      processManager.registerSignalHandlers();
      
      // Verify handlers are registered
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
    });

    it('should accept custom server name', () => {
      processManager.registerSignalHandlers('Custom App');
      
      // Verify handlers are registered with custom name
      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle whitespace in lsof output', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :')) {
          process.nextTick(() => callback(null, { stdout: '   \n  \t  ', stderr: '' }));
        }
      });

      const result = await processManager.ensurePortFree(testPort);
      expect(result).toBe(true);
    });

    it('should handle rapid sequential port checks', async () => {
      (exec as any).mockImplementation(mockExecResponse('', '', new Error('lsof: no processes found')));

      const results = await Promise.all([
        processManager.ensurePortFree(testPort),
        processManager.ensurePortFree(testPort + 1),
        processManager.ensurePortFree(testPort + 2)
      ]);

      expect(results).toEqual([true, true, true]);
    });

    it('should handle PIDs with whitespace', async () => {
      let checkCount = 0;
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :') && !cmd.includes('-ti')) {
          checkCount++;
          if (checkCount === 1) {
            // First check: port in use
            process.nextTick(() => callback(null, { stdout: 'process', stderr: '' }));
          } else {
            // Verification check: port free
            process.nextTick(() => callback(new Error('no processes'), { stdout: '', stderr: '' }));
          }
        } else if (cmd.includes('lsof -ti :')) {
          process.nextTick(() => callback(null, { stdout: '  12345  \n  67890  ', stderr: '' }));
        } else if (cmd.includes('kill')) {
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      await processManager.ensurePortFree(testPort);
      // Should trim and process PIDs correctly
      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });
});
