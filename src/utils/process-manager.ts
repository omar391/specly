/**
 * Process Management Utilities
 * 
 * Handles Specly process detection and cleanup
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Ensure the target port is free for Specly server
 * Kills any processes using the port, regardless of what they are
 */
export async function ensurePortFree(port: number): Promise<boolean> {
  try {
    // Check if port is in use
    const { stdout } = await execAsync(`lsof -i :${port}`);
    if (!stdout.trim()) {
      return true; // Port is free
    }

    console.log(`Port ${port} is in use. Freeing it for Specly server...`);
    
    // Get PIDs of processes using the port
    const { stdout: pidOutput } = await execAsync(`lsof -ti :${port}`);
    const pids = pidOutput.trim().split('\n').filter(pid => pid);
    
    if (pids.length === 0) {
      return true; // No processes found
    }

    // Kill processes using the port
    let killedCount = 0;
    for (const pid of pids) {
      try {
    // Try graceful termination first
        await execAsync(`kill ${pid}`);
        console.log(`Gracefully terminated process ${pid} on port ${port}`);
        killedCount++;
      } catch (error) {
        try {
      // Force kill if graceful fails
          await execAsync(`kill -9 ${pid}`);
          console.log(`Force killed process ${pid} on port ${port}`);
          killedCount++;
        } catch (forceError) {
          console.warn(`Failed to kill process ${pid}:`, forceError);
        }
      }
    }

    if (killedCount > 0) {
      // Wait for processes to terminate
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify port is now free
      try {
        const { stdout: checkOutput } = await execAsync(`lsof -i :${port}`);
        if (checkOutput.trim()) {
          console.warn(`Port ${port} still in use after cleanup`);
          return false;
        }
      } catch (error) {
        // lsof returns non-zero when no processes found, which is what we want
      }
    }

    console.log(`Port ${port} is now free`);
    return true;
  } catch (error) {
    // lsof returns non-zero exit code when no processes found
    if (error instanceof Error && error.message?.includes('lsof')) {
      return true; // Port is free
    }
    console.warn(`Error checking port ${port}:`, error);
    return false;
  }
}

/**
 * Create a graceful shutdown handler
 */
export function createShutdownHandler(serverName: string = 'Specly Server'): (signal: string) => void {
  return (signal: string) => {
    console.log(`\n${signal} received. Shutting down ${serverName} gracefully...`);
    
    // Give time for cleanup
    setTimeout(() => {
      console.log(`${serverName} shutdown complete.`);
      process.exit(0);
    }, 1000);
  };
}

/**
 * Register standard process signal handlers
 */
export function registerSignalHandlers(serverName: string = 'Specly Server'): void {
  const handler = createShutdownHandler(serverName);
  
  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGUSR1', () => handler('SIGUSR1'));
  process.on('SIGUSR2', () => handler('SIGUSR2'));
  
  // Handle uncaught exceptions gracefully
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.log('Shutting down due to uncaught exception...');
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.log('Shutting down due to unhandled rejection...');
    process.exit(1);
  });
}
