/**
 * Tests for Port Management Utilities
 * 
 * Tests port detection, cleanup, conflict resolution, and process management
 * Now tests the generic mcp-kit port manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as portManager from '../server/local/port-manager.js';
import { exec } from 'child_process';
import http from 'http';

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

describe('Port Manager', () => {
  const testPort = 19876;
  let mockConsoleLog: any;
  let mockConsoleWarn: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => { });
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
  });

  describe('isPortInUse', () => {
    it('should return true when port is in use', async () => {
      (exec as any).mockImplementation(mockExecResponse('COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 12345 user 21u IPv4 0x1234 0t0 TCP *:19876 (LISTEN)'));

      const result = await portManager.isPortInUse(testPort);
      expect(result).toBe(true);
      expect(exec).toHaveBeenCalledWith(
        `lsof -i :${testPort}`,
        expect.any(Function)
      );
    });

    it('should return false when port is free', async () => {
      (exec as any).mockImplementation(mockExecResponse('', '', new Error('lsof: no processes found')));

      const result = await portManager.isPortInUse(testPort);
      expect(result).toBe(false);
    });

    it('should return false when lsof returns empty output', async () => {
      (exec as any).mockImplementation(mockExecResponse(''));

      const result = await portManager.isPortInUse(testPort);
      expect(result).toBe(false);
    });

    it('should handle whitespace-only output', async () => {
      (exec as any).mockImplementation(mockExecResponse('   \n  \t  '));

      const result = await portManager.isPortInUse(testPort);
      expect(result).toBe(false);
    });
  });

  describe('killPortProcesses', () => {
    it('should kill processes gracefully', async () => {
      let callCount = 0;
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        callCount++;
        if (cmd.includes('lsof -ti')) {
          // Return PIDs
          process.nextTick(() => callback(null, { stdout: '12345\n67890', stderr: '' }));
        } else if (cmd.includes('kill ')) {
          // Graceful kill succeeds
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      const result = await portManager.killPortProcesses(testPort);
      expect(result).toBe(true);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Gracefully terminated process 12345'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Gracefully terminated process 67890'));
    });

    it('should force kill when graceful kill fails', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -ti')) {
          process.nextTick(() => callback(null, { stdout: '12345', stderr: '' }));
        } else if (cmd === 'kill 12345') {
          // Graceful kill fails
          process.nextTick(() => callback(new Error('Kill failed'), { stdout: '', stderr: '' }));
        } else if (cmd === 'kill -9 12345') {
          // Force kill succeeds
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      const result = await portManager.killPortProcesses(testPort);
      expect(result).toBe(true);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Force killed process 12345'));
    });

    it('should return false when no processes found', async () => {
      (exec as any).mockImplementation(mockExecResponse(''));

      const result = await portManager.killPortProcesses(testPort);
      expect(result).toBe(false);
    });

    it('should handle empty PID list', async () => {
      (exec as any).mockImplementation(mockExecResponse('\n\n'));

      const result = await portManager.killPortProcesses(testPort);
      expect(result).toBe(false);
    });

    it('should continue when individual kill fails', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -ti')) {
          process.nextTick(() => callback(null, { stdout: '12345\n67890', stderr: '' }));
        } else if (cmd.includes('kill') && cmd.includes('12345')) {
          // Both graceful and force kill fail for 12345
          process.nextTick(() => callback(new Error('Process not found'), { stdout: '', stderr: '' }));
        } else if (cmd === 'kill 67890') {
          // Graceful kill succeeds for 67890
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      const result = await portManager.killPortProcesses(testPort);
      expect(result).toBe(true);
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to kill process 12345'), expect.any(Error));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Gracefully terminated process 67890'));
    });

    it('should handle lsof error', async () => {
      (exec as any).mockImplementation(mockExecResponse('', '', new Error('lsof command failed')));

      const result = await portManager.killPortProcesses(testPort);
      expect(result).toBe(false);
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Error killing processes'), expect.anything());
    });
  });

  describe('findAvailablePort', () => {
    it('should return first available port', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        // Port 19876 is in use, 19877 is free
        if (cmd.includes(':19876')) {
          process.nextTick(() => callback(null, { stdout: 'process using port', stderr: '' }));
        } else {
          process.nextTick(() => callback(new Error('no processes'), { stdout: '', stderr: '' }));
        }
      });

      const result = await portManager.findAvailablePort(testPort);
      expect(result).toBe(testPort + 1);
    });

    it('should search multiple ports', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        // First 3 ports in use, 4th port free
        if (cmd.includes(':19876') || cmd.includes(':19877') || cmd.includes(':19878')) {
          process.nextTick(() => callback(null, { stdout: 'in use', stderr: '' }));
        } else {
          process.nextTick(() => callback(new Error('not found'), { stdout: '', stderr: '' }));
        }
      });

      const result = await portManager.findAvailablePort(testPort);
      expect(result).toBe(testPort + 3);
    });

    it('should throw when no port available within retries', async () => {
      (exec as any).mockImplementation(mockExecResponse('all ports in use'));

      await expect(portManager.findAvailablePort(testPort, 3)).rejects.toThrow(
        'No available port found starting from 19876 (tried 3 ports)'
      );
    });

    it('should respect maxRetries parameter', async () => {
      (exec as any).mockImplementation(mockExecResponse('in use'));

      await expect(portManager.findAvailablePort(testPort, 5)).rejects.toThrow(
        'tried 5 ports'
      );
    });

    it('should return start port if immediately available', async () => {
      (exec as any).mockImplementation(mockExecResponse('', '', new Error('not found')));

      const result = await portManager.findAvailablePort(testPort);
      expect(result).toBe(testPort);
    });
  });

  describe('ensurePortAvailable', () => {
    it('should return true when port is free', async () => {
      (exec as any).mockImplementation(mockExecResponse('', '', new Error('not found')));

      const result = await portManager.ensurePortAvailable(testPort);
      expect(result).toBe(true);
    });

    it('should kill processes and verify port is free', async () => {
      let checkCount = 0;
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :')) {
          checkCount++;
          if (checkCount === 1) {
            // First check: port in use
            process.nextTick(() => callback(null, { stdout: 'process', stderr: '' }));
          } else {
            // Second check: port free
            process.nextTick(() => callback(new Error('not found'), { stdout: '', stderr: '' }));
          }
        } else if (cmd.includes('lsof -ti')) {
          process.nextTick(() => callback(null, { stdout: '12345', stderr: '' }));
        } else if (cmd.includes('kill')) {
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      const result = await portManager.ensurePortAvailable(testPort, true);
      expect(result).toBe(true);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Port 19876 is now available'));
    });

    it('should return false when killExisting is false and port in use', async () => {
      (exec as any).mockImplementation(mockExecResponse('process using port'));

      const result = await portManager.ensurePortAvailable(testPort, false);
      expect(result).toBe(false);
    });

    it('should return false when kill fails', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :')) {
          // Port always in use
          process.nextTick(() => callback(null, { stdout: 'process', stderr: '' }));
        } else if (cmd.includes('lsof -ti')) {
          // Return error when getting PIDs
          process.nextTick(() => callback(new Error('lsof failed'), { stdout: '', stderr: '' }));
        }
      });

      const result = await portManager.ensurePortAvailable(testPort, true);
      expect(result).toBe(false);
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to free port'));
    });

    it('should return false when port still in use after kill', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :')) {
          // Port always in use
          process.nextTick(() => callback(null, { stdout: 'stubborn process', stderr: '' }));
        } else if (cmd.includes('lsof -ti')) {
          process.nextTick(() => callback(null, { stdout: '12345', stderr: '' }));
        } else if (cmd.includes('kill')) {
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      const result = await portManager.ensurePortAvailable(testPort, true);
      expect(result).toBe(false);
    });

    it('should log when attempting to free port', async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes('lsof -i :')) {
          process.nextTick(() => callback(null, { stdout: 'process', stderr: '' }));
        } else if (cmd.includes('lsof -ti')) {
          process.nextTick(() => callback(null, { stdout: '12345', stderr: '' }));
        } else if (cmd.includes('kill')) {
          process.nextTick(() => callback(null, { stdout: '', stderr: '' }));
        }
      });

      await portManager.ensurePortAvailable(testPort, true);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Port 19876 is in use. Attempting to free it'));
    });
  });

  describe('getPortProcessInfo', () => {
    it('should parse process information correctly', async () => {
      const lsofOutput = `p12345
cnode
p67890
cpython`;
      (exec as any).mockImplementation(mockExecResponse(lsofOutput));

      const result = await portManager.getPortProcessInfo(testPort);
      expect(result).toEqual([
        { pid: '12345', command: 'node' },
        { pid: '67890', command: 'python' }
      ]);
    });

    it('should return empty array when no processes found', async () => {
      (exec as any).mockImplementation(mockExecResponse('', '', new Error('not found')));

      const result = await portManager.getPortProcessInfo(testPort);
      expect(result).toEqual([]);
    });

    it('should handle single process', async () => {
      (exec as any).mockImplementation(mockExecResponse('p99999\ncSpecly'));

      const result = await portManager.getPortProcessInfo(testPort);
      expect(result).toEqual([{ pid: '99999', command: 'Specly' }]);
    });

    it('should handle malformed output gracefully', async () => {
      (exec as any).mockImplementation(mockExecResponse('p12345\nx invalid\ncnode'));

      const result = await portManager.getPortProcessInfo(testPort);
      expect(result).toEqual([{ pid: '12345', command: 'node' }]);
    });

    it('should handle empty lines in output', async () => {
      (exec as any).mockImplementation(mockExecResponse('p12345\n\ncnode\n\n'));

      const result = await portManager.getPortProcessInfo(testPort);
      expect(result).toEqual([{ pid: '12345', command: 'node' }]);
    });

    it('should handle command without PID', async () => {
      (exec as any).mockImplementation(mockExecResponse('cnode\np12345'));

      const result = await portManager.getPortProcessInfo(testPort);
      expect(result).toEqual([]);
    });

    it('should handle multiple commands for same PID', async () => {
      (exec as any).mockImplementation(mockExecResponse('p12345\ncnode\ncSpecly'));

      const result = await portManager.getPortProcessInfo(testPort);
      // Multiple commands can be captured for same PID
      expect(result).toEqual([{ pid: '12345', command: 'node' }, { pid: '12345', command: 'Specly' }]);
    });

    it('should call lsof with correct flags', async () => {
      (exec as any).mockImplementation(mockExecResponse(''));

      await portManager.getPortProcessInfo(testPort);
      expect(exec).toHaveBeenCalledWith(
        `lsof -i :${testPort} -Fp -Fc`,
        expect.any(Function)
      );
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle very large port numbers', async () => {
      (exec as any).mockImplementation(mockExecResponse('', '', new Error('not found')));

      const result = await portManager.isPortInUse(65535);
      expect(result).toBe(false);
    });

    it('should handle port 0 (system assigns)', async () => {
      (exec as any).mockImplementation(mockExecResponse(''));

      const result = await portManager.isPortInUse(0);
      expect(result).toBe(false);
    });

    it('should handle concurrent operations on same port', async () => {
      (exec as any).mockImplementation(mockExecResponse('', '', new Error('not found')));

      const results = await Promise.all([
        portManager.isPortInUse(testPort),
        portManager.isPortInUse(testPort),
        portManager.isPortInUse(testPort)
      ]);

      expect(results).toEqual([false, false, false]);
    });

    it('should handle rapid sequential checks', async () => {
      (exec as any).mockImplementation(mockExecResponse('', '', new Error('not found')));

      for (let i = 0; i < 5; i++) {
        const result = await portManager.isPortInUse(testPort + i);
        expect(result).toBe(false);
      }
    });
  });
});
