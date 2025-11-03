/**
 * Integration Tests for Root-to-Child Process System
 * 
 * Tests the InstanceManager's root process with preferred port logic where new processes
 * become child proxies to the main instance. Validates lock file system, PID validation,
 * proxy creation, and version matching.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import { InstanceManager, InstanceRole } from '../server/instance-manager.js';

describe('Instance Manager Root-to-Child Process System', () => {
    let testLockPath: string;
    let testPort: number;
    let instanceManager: InstanceManager;
    let spawnedProcesses: ChildProcess[] = [];

    beforeEach(() => {
        // Create unique test lock path and port for each test
        testLockPath = path.join(os.tmpdir(), `specly-test-${Date.now()}-${Math.random().toString(36).substring(2)}.lock`);
        testPort = 9000 + Math.floor(Math.random() * 1000); // Random port between 9000-9999
        instanceManager = new InstanceManager(testLockPath, testPort);
    });

    afterEach(async () => {
        // Clean up lock file
        if (fs.existsSync(testLockPath)) {
            try {
                fs.unlinkSync(testLockPath);
            } catch (error) {
                console.warn('Failed to clean up lock file:', error);
            }
        }

        // Kill any spawned processes
        for (const proc of spawnedProcesses) {
            if (proc.pid && !proc.killed) {
                try {
                    process.kill(proc.pid, 'SIGTERM');
                } catch (error) {
                    console.warn('Failed to kill spawned process:', error);
                }
            }
        }
        spawnedProcesses = [];

        // Wait a bit for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    describe('Lock File Management', () => {
        it('should create lock file when becoming main instance', async () => {
            expect(fs.existsSync(testLockPath)).toBe(false);

            const isMain = await instanceManager.tryBecomeMain();

            expect(isMain).toBe(true);
            expect(fs.existsSync(testLockPath)).toBe(true);
            expect(instanceManager.role).toBe(InstanceRole.MAIN);

            // Verify lock file content
            const lockContent = fs.readFileSync(testLockPath, 'utf-8');
            const lockData = JSON.parse(lockContent);

            expect(lockData).toHaveProperty('pid', process.pid);
            expect(lockData).toHaveProperty('version', InstanceManager.VERSION);
            expect(lockData).toHaveProperty('timestamp');
            expect(typeof lockData.timestamp).toBe('number');
        });

        it('should fail to become main when lock already exists', async () => {
            // First instance becomes main
            const firstManager = new InstanceManager(testLockPath, testPort);
            const firstIsMain = await firstManager.tryBecomeMain();
            expect(firstIsMain).toBe(true);

            // Second instance should fail to become main
            const secondManager = new InstanceManager(testLockPath, testPort);
            const secondIsMain = await secondManager.tryBecomeMain();
            expect(secondIsMain).toBe(false);
        });

        it('should handle stale lock files (dead process)', async () => {
            // Create a fake lock file with a non-existent PID
            const staleLock = {
                pid: 999999, // Very unlikely to exist
                version: InstanceManager.VERSION,
                timestamp: Date.now()
            };
            fs.writeFileSync(testLockPath, JSON.stringify(staleLock));

            const lock = await instanceManager.readLock();
            expect(lock).not.toBeNull();
            expect(InstanceManager.isPidAlive(lock!.pid)).toBe(false);

            // Should be able to remove stale lock and become main
            await instanceManager.removeLock();
            const isMain = await instanceManager.tryBecomeMain();
            expect(isMain).toBe(true);
        });

        it('should properly read and validate lock file format', async () => {
            const validLock = {
                pid: process.pid,
                version: InstanceManager.VERSION,
                timestamp: Date.now()
            };
            fs.writeFileSync(testLockPath, JSON.stringify(validLock));

            const readLock = await instanceManager.readLock();
            expect(readLock).toEqual(validLock);

            // Test invalid lock file
            fs.writeFileSync(testLockPath, 'invalid json');
            const invalidLock = await instanceManager.readLock();
            expect(invalidLock).toBeNull();

            // Test missing required fields
            const incompleteLock = { pid: process.pid }; // Missing version and timestamp
            fs.writeFileSync(testLockPath, JSON.stringify(incompleteLock));
            const incompleteRead = await instanceManager.readLock();
            expect(incompleteRead).toBeNull();
        });
    });

    describe('PID Liveness Detection', () => {
        it('should correctly identify alive processes', () => {
            expect(InstanceManager.isPidAlive(process.pid)).toBe(true);
        });

        it('should correctly identify dead processes', () => {
            expect(InstanceManager.isPidAlive(999999)).toBe(false); // Very unlikely PID
        });

        it('should handle edge cases in PID validation', () => {
            expect(InstanceManager.isPidAlive(0)).toBe(false); // Invalid PID
            expect(InstanceManager.isPidAlive(-1)).toBe(false); // Invalid PID
        });
    });

    describe('Port Management and Server Detection', () => {
        it('should detect when port is available', async () => {
            // Use a random high port that should be available
            const testManager = new InstanceManager(testLockPath, testPort + 100);
            const isAvailable = await testManager.waitForPort(2000);
            expect(isAvailable).toBe(true);
        });

        it('should detect when port is in use', async () => {
            // Create a test server on the port
            const testServer = http.createServer();
            await new Promise<void>((resolve) => {
                testServer.listen(testPort, () => resolve());
            });

            try {
                const isAvailable = await instanceManager.waitForPort(1000);
                expect(isAvailable).toBe(false);
            } finally {
                testServer.close();
            }
        });

        it('should timeout when waiting for port', async () => {
            // Create a server that will stay running
            const testServer = http.createServer();
            await new Promise<void>((resolve) => {
                testServer.listen(testPort, () => resolve());
            });

            try {
                const startTime = Date.now();
                const isAvailable = await instanceManager.waitForPort(500); // Short timeout
                const duration = Date.now() - startTime;

                expect(isAvailable).toBe(false);
                expect(duration).toBeGreaterThanOrEqual(500);
                expect(duration).toBeLessThan(1000); // Should not take too much longer
            } finally {
                testServer.close();
            }
        });
    });

    describe('Proxy Server Creation', () => {
        it('should create proxy server on available port', async () => {
            // Create a main server to proxy to
            const mainServer = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Main server response');
            });

            await new Promise<void>((resolve) => {
                mainServer.listen(testPort, () => resolve());
            });

            try {
                const proxyServer = await instanceManager.startProxy();
                expect(instanceManager.role).toBe(InstanceRole.PROXY);
                expect(instanceManager.proxyPort).toBeDefined();
                expect(typeof instanceManager.proxyPort).toBe('number');
                expect(instanceManager.proxyPort).toBeGreaterThan(0);

                // Test that proxy actually works
                const proxyResponse = await new Promise<string>((resolve, reject) => {
                    const req = http.get(`http://localhost:${instanceManager.proxyPort}`, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => resolve(data));
                    });
                    req.on('error', reject);
                    req.setTimeout(2000);
                });

                expect(proxyResponse).toBe('Main server response');
                proxyServer.close();
            } finally {
                mainServer.close();
            }
        }, 10000);
    });

    describe('Version Compatibility Checks', () => {
        it('should handle version mismatches', async () => {
            // Create a mock server that returns wrong version
            const mockServer = http.createServer((req, res) => {
                if (req.url === '/__version') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ version: '0.0.1' })); // Different version
                } else {
                    res.writeHead(404);
                    res.end();
                }
            });

            await new Promise<void>((resolve) => {
                mockServer.listen(testPort, () => resolve());
            });

            try {
                const fetchedVersion = await instanceManager.fetchMainVersion();
                expect(fetchedVersion).toBe('0.0.1');
                expect(fetchedVersion).not.toBe(InstanceManager.VERSION);
            } finally {
                mockServer.close();
            }
        });

        it('should handle version fetch timeout', async () => {
            // No server running on port
            const version = await instanceManager.fetchMainVersion();
            expect(version).toBeNull();
        });

        it('should handle malformed version response', async () => {
            const mockServer = http.createServer((req, res) => {
                if (req.url === '/__version') {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('invalid json');
                } else {
                    res.writeHead(404);
                    res.end();
                }
            });

            await new Promise<void>((resolve) => {
                mockServer.listen(testPort, () => resolve());
            });

            try {
                const version = await instanceManager.fetchMainVersion();
                expect(version).toBeNull();
            } finally {
                mockServer.close();
            }
        });
    });

    describe('Shutdown Request Handling', () => {
        it('should handle shutdown requests', async () => {
            const mockServer = http.createServer((req, res) => {
                if (req.url === '/__shutdown' && req.method === 'POST') {
                    res.writeHead(200);
                    res.end('OK');
                    // Close server after responding
                    setTimeout(() => mockServer.close(), 10);
                } else {
                    res.writeHead(404);
                    res.end();
                }
            });

            await new Promise<void>((resolve) => {
                mockServer.listen(testPort, () => resolve());
            });

            const shutdownSuccess = await instanceManager.requestMainShutdown();
            expect(shutdownSuccess).toBe(true);

            // Wait for server to close
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        it('should handle shutdown request failure', async () => {
            // No server running
            const shutdownSuccess = await instanceManager.requestMainShutdown();
            expect(shutdownSuccess).toBe(false);
        });
    });

    describe('Complete Multi-Instance Flow', () => {
        it('should handle complete instance takeover scenario', async () => {
            // Simulate a complete flow where:
            // 1. First instance becomes main
            // 2. Second instance detects main but version mismatch
            // 3. Second instance requests shutdown
            // 4. Second instance waits and becomes new main

            // Step 1: First instance becomes main
            const firstIsMain = await instanceManager.tryBecomeMain();
            expect(firstIsMain).toBe(true);

            // Create a mock server for the first instance with old version
            const firstInstanceServer = http.createServer((req, res) => {
                if (req.url === '/__version') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ version: '0.0.1' })); // Old version
                } else if (req.url === '/__shutdown' && req.method === 'POST') {
                    res.writeHead(200);
                    res.end('OK');
                    // Cleanup: remove lock and close server
                    setTimeout(async () => {
                        await instanceManager.removeLock();
                        firstInstanceServer.close();
                    }, 10);
                } else {
                    res.writeHead(404);
                    res.end();
                }
            });

            await new Promise<void>((resolve) => {
                firstInstanceServer.listen(testPort, () => resolve());
            });

            // Step 2: Second instance checks version and finds mismatch
            const secondManager = new InstanceManager(testLockPath, testPort);
            const secondIsMain = await secondManager.tryBecomeMain();
            expect(secondIsMain).toBe(false);

            const mainVersion = await secondManager.fetchMainVersion();
            expect(mainVersion).toBe('0.0.1');
            expect(mainVersion).not.toBe(InstanceManager.VERSION);

            // Step 3: Second instance requests shutdown
            const shutdownSuccess = await secondManager.requestMainShutdown();
            expect(shutdownSuccess).toBe(true);

            // Step 4: Wait for port to become available
            const portAvailable = await secondManager.waitForPort(3000);
            expect(portAvailable).toBe(true);

            // Step 5: Second instance becomes main
            const secondTakeover = await secondManager.tryBecomeMain();
            expect(secondTakeover).toBe(true);
            expect(secondManager.role).toBe(InstanceRole.MAIN);
        }, 15000);
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle permission errors on lock file', async () => {
            // Create a directory with the lock file name (should cause write error)
            fs.mkdirSync(testLockPath);

            try {
                const isMain = await instanceManager.tryBecomeMain();
                expect(isMain).toBe(false);
            } finally {
                fs.rmdirSync(testLockPath);
            }
        });

        it('should handle concurrent tryBecomeMain attempts', async () => {
            // Simulate multiple instances trying to become main simultaneously
            const managers = Array.from({ length: 3 }, () => new InstanceManager(testLockPath, testPort));

            const promises = managers.map(manager => manager.tryBecomeMain());
            const results = await Promise.all(promises);

            // Only one should succeed
            const successCount = results.filter(result => result === true).length;
            expect(successCount).toBe(1);

            // Others should fail
            const failureCount = results.filter(result => result === false).length;
            expect(failureCount).toBe(2);
        });

        it('should handle lock file corruption gracefully', async () => {
            // Create corrupted lock file
            fs.writeFileSync(testLockPath, 'corrupted data');

            const lock = await instanceManager.readLock();
            expect(lock).toBeNull();

            // Remove corrupted lock file first (this is what a real system would do)
            fs.unlinkSync(testLockPath);

            // Should be able to create new lock after removing corrupted one
            const isMain = await instanceManager.tryBecomeMain();
            expect(isMain).toBe(true);
        });
    });

    describe('Instance Manager Role Tracking', () => {
        it('should track instance role correctly', () => {
            expect(instanceManager.role).toBe(InstanceRole.UNKNOWN);
        });

        it('should update role when becoming main', async () => {
            await instanceManager.tryBecomeMain();
            expect(instanceManager.role).toBe(InstanceRole.MAIN);
        });

        it('should update role when starting proxy', async () => {
            // Create main server first
            const mainServer = http.createServer();
            await new Promise<void>((resolve) => {
                mainServer.listen(testPort, () => resolve());
            });

            try {
                const proxyServer = await instanceManager.startProxy();
                expect(instanceManager.role).toBe(InstanceRole.PROXY);
                proxyServer.close();
            } finally {
                mainServer.close();
            }
        });
    });
});
