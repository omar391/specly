/**
 * Port Management Utilities
 * 
 * Framework-agnostic port detection, cleanup, and conflict resolution
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if a port is currently in use
 */
export async function isPortInUse(port: number): Promise<boolean> {
    try {
        const { stdout } = await execAsync(`lsof -i :${port}`);
        return stdout.trim().length > 0;
    } catch (error) {
        // lsof returns non-zero exit code when no processes found
        return false;
    }
}

/**
 * Kill any processes using the specified port
 */
export async function killPortProcesses(port: number): Promise<boolean> {
    try {
        const { stdout } = await execAsync(`lsof -ti :${port}`);
        const pids = stdout.trim().split('\n').filter(pid => pid);

        if (pids.length === 0) {
            return false;
        }

        // Kill processes gracefully first (SIGTERM)
        for (const pid of pids) {
            try {
                await execAsync(`kill ${pid}`);
                console.log(`Gracefully terminated process ${pid} on port ${port}`);
            } catch (error) {
                // If graceful kill fails, force kill
                try {
                    await execAsync(`kill -9 ${pid}`);
                    console.log(`Force killed process ${pid} on port ${port}`);
                } catch (forceError) {
                    console.warn(`Failed to kill process ${pid}:`, forceError);
                }
            }
        }

        // Wait a moment for processes to terminate
        await new Promise(resolve => setTimeout(resolve, 1000));

        return true;
    } catch (error) {
        console.warn(`Error killing processes on port ${port}:`, error);
        return false;
    }
}

/**
 * Find an available port starting from the specified port
 */
export async function findAvailablePort(startPort: number, maxRetries: number = 10): Promise<number> {
    for (let i = 0; i < maxRetries; i++) {
        const port = startPort + i;
        if (!(await isPortInUse(port))) {
            return port;
        }
    }
    throw new Error(`No available port found starting from ${startPort} (tried ${maxRetries} ports)`);
}

/**
 * Ensure a port is available, killing existing processes if necessary
 */
export async function ensurePortAvailable(port: number, killExisting: boolean = true): Promise<boolean> {
    const inUse = await isPortInUse(port);

    if (!inUse) {
        return true;
    }

    if (!killExisting) {
        return false;
    }

    console.log(`Port ${port} is in use. Attempting to free it...`);
    const killed = await killPortProcesses(port);

    if (killed) {
        // Verify port is now free
        const stillInUse = await isPortInUse(port);
        if (!stillInUse) {
            console.log(`Port ${port} is now available`);
            return true;
        }
    }

    console.warn(`Failed to free port ${port}`);
    return false;
}

/**
 * Get process information for a specific port
 */
export async function getPortProcessInfo(port: number): Promise<Array<{ pid: string, command: string }>> {
    try {
        const { stdout } = await execAsync(`lsof -i :${port} -Fp -Fc`);
        const lines = stdout.trim().split('\n');
        const processes: Array<{ pid: string, command: string }> = [];

        let currentPid = '';

        for (const line of lines) {
            if (line.startsWith('p')) {
                currentPid = line.substring(1);
            } else if (line.startsWith('c') && currentPid) {
                const command = line.substring(1);
                processes.push({ pid: currentPid, command });
            }
        }

        return processes;
    } catch (error) {
        return [];
    }
}
