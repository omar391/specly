import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';

// Mock the file system and path modules
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn()
}));

vi.mock('path', () => ({
    join: vi.fn(),
    resolve: vi.fn()
}));

vi.mock('uuid', () => ({
    v4: vi.fn()
}));

// Mock the database service
vi.mock('../../database/global-queries.js', () => ({
    GlobalDatabaseService: vi.fn()
}));

import { WorkspaceRegistry } from '../workspace-registry.js';
import { GlobalDatabaseService } from '../../database/global-queries.js';

describe('WorkspaceRegistry', () => {
    let mockGlobalDb: any;
    let mockDrizzleDb: any;
    let registry: WorkspaceRegistry;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Mock path functions properly
        (resolve as MockedFunction<typeof resolve>).mockImplementation((...args) => args.join('/'));
        (join as MockedFunction<typeof join>).mockImplementation((...args) => {
            // Handle path joining properly for depth calculation
            return args.join('/').replace(/\/+/g, '/');
        });

        // Mock UUID
        (uuidv4 as MockedFunction<typeof uuidv4>).mockReturnValue('test-workspace-id');

        // Mock file system with path-aware behavior to prevent infinite recursion
        (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(true);
        (readdirSync as MockedFunction<typeof readdirSync>).mockImplementation((path: string) => {
            // Return .task only for the root test path to avoid infinite recursion
            if (path === '/test/path' || path === '/test') {
                return ['.task'];
            }
            // For any subdirectory, return empty to prevent recursion
            return [];
        });
        (statSync as MockedFunction<typeof statSync>).mockReturnValue({
            isDirectory: () => true,
            isFile: () => false
        } as any);

        // Mock database
        mockGlobalDb = {
            getWorkspaceByPath: vi.fn(),
            createWorkspace: vi.fn(),
            updateWorkspaceActivity: vi.fn(),
            getAllWorkspaces: vi.fn(),
            updateWorkspace: vi.fn(),
            deleteWorkspace: vi.fn()
        };

        (GlobalDatabaseService as any).mockImplementation(() => mockGlobalDb);

        mockDrizzleDb = {};
        registry = new WorkspaceRegistry(mockDrizzleDb);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with default options', () => {
            const registry = new WorkspaceRegistry(mockDrizzleDb);
            expect(registry).toBeDefined();
        });

        it('should initialize with custom options', () => {
            const options = {
                scanPaths: ['/path1', '/path2'],
                autoRegister: true,
                activityTimeoutMs: 10000,
                cleanupIntervalMs: 2000
            };
            const registry = new WorkspaceRegistry(mockDrizzleDb, options);
            expect(registry).toBeDefined();
        });
    });

    describe('start', () => {
        it('should start without auto-register when disabled', async () => {
            const registry = new WorkspaceRegistry(mockDrizzleDb, {
                autoRegister: false,
                scanPaths: []
            });

            await registry.start();

            expect(mockGlobalDb.getWorkspaceByPath).not.toHaveBeenCalled();
        });

        it('should start with auto-register when enabled and scan paths provided', async () => {
            const registry = new WorkspaceRegistry(mockDrizzleDb, {
                autoRegister: true,
                scanPaths: ['/test/path']
            });

            // Mock scanForWorkspaces to return some workspaces so registration happens
            (registry as any).scanForWorkspaces = vi.fn().mockResolvedValue(['/test/workspace']);

            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);
            mockGlobalDb.createWorkspace.mockResolvedValue({ id: 'test-id' });

            await registry.start();

            expect(mockGlobalDb.getWorkspaceByPath).toHaveBeenCalled();
        });

        it('should start cleanup interval', async () => {
            vi.useFakeTimers();

            const registry = new WorkspaceRegistry(mockDrizzleDb, {
                cleanupIntervalMs: 1000
            });

            await registry.start();

            // Fast-forward time
            vi.advanceTimersByTime(1000);

            expect(mockGlobalDb.getAllWorkspaces).toHaveBeenCalled();
        });
    });

    describe('stop', () => {
        it('should clear scan interval and activity timers', async () => {
            vi.useFakeTimers();

            const registry = new WorkspaceRegistry(mockDrizzleDb);
            await registry.start();

            // Add an activity timer
            (registry as any).activityTimers.set('test-id', setTimeout(() => { }, 1000));

            registry.stop();

            expect((registry as any).scanInterval).toBeUndefined();
            expect((registry as any).activityTimers.size).toBe(0);
        });
    });

    describe('registerWorkspace', () => {
        it('should return existing workspace ID if already registered', async () => {
            const existingWorkspace = { id: 'existing-id', path: '/test/path' };
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(existingWorkspace);

            const result = await registry.registerWorkspace('/test/path');

            expect(result).toBe('existing-id');
            expect(mockGlobalDb.createWorkspace).not.toHaveBeenCalled();
        });

        it('should create new workspace if not exists', async () => {
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);
            mockGlobalDb.createWorkspace.mockResolvedValue({ id: 'test-workspace-id' });

            const result = await registry.registerWorkspace('/test/path', 'Test Workspace');

            expect(result).toBe('test-workspace-id');
            expect(mockGlobalDb.createWorkspace).toHaveBeenCalledWith({
                id: 'test-workspace-id',
                path: '/test/path',
                name: 'Test Workspace',
                status: 'disconnected',
                createdAt: expect.any(String),
                updatedAt: expect.any(String),
                lastActivity: expect.any(String),
                taskCount: 0,
                activeTask: null
            });
        });

        it('should extract workspace name from path when not provided', async () => {
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);
            mockGlobalDb.createWorkspace.mockResolvedValue({ id: 'test-workspace-id' });

            await registry.registerWorkspace('/home/user/my-workspace');

            expect(mockGlobalDb.createWorkspace).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'my-workspace' })
            );
        });
    });

    describe('updateWorkspaceActivity', () => {
        it('should update workspace activity and reset timer', async () => {
            vi.useFakeTimers();

            await registry.updateWorkspaceActivity('test-id');

            expect(mockGlobalDb.updateWorkspaceActivity).toHaveBeenCalledWith('test-id');
        });
    });

    describe('updateWorkspaceActivityByPath', () => {
        it('should update activity when workspace exists', async () => {
            const workspace = { id: 'test-id', path: '/test/path' };
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(workspace);

            await registry.updateWorkspaceActivityByPath('/test/path');

            expect(mockGlobalDb.updateWorkspaceActivity).toHaveBeenCalledWith('test-id');
        });

        it('should not update activity when workspace does not exist', async () => {
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);

            await registry.updateWorkspaceActivityByPath('/test/path');

            expect(mockGlobalDb.updateWorkspaceActivity).not.toHaveBeenCalled();
        });
    });

    describe('getAllWorkspaces', () => {
        it('should return mapped workspace metadata', async () => {
            const workspaces = [{
                id: 'test-id',
                path: '/test/path',
                name: 'Test',
                status: 'active',
                lastActivity: '2023-01-01T00:00:00.000Z',
                taskCount: 5,
                activeTask: 'task-1'
            }];

            mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);

            const result = await registry.getAllWorkspaces();

            expect(result).toEqual([{
                id: 'test-id',
                path: '/test/path',
                name: 'Test',
                status: 'active',
                lastActivity: expect.any(Date),
                isActive: true,
                taskCount: 5,
                activeTask: 'task-1'
            }]);
        });
    });

    describe('getWorkspaceByPath', () => {
        it('should return workspace metadata when found', async () => {
            const workspace = {
                id: 'test-id',
                path: '/test/path',
                name: 'Test',
                status: 'active',
                lastActivity: '2023-01-01T00:00:00.000Z',
                taskCount: 5,
                activeTask: 'task-1'
            };

            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(workspace);

            const result = await registry.getWorkspaceByPath('/test/path');

            expect(result).toEqual({
                id: 'test-id',
                path: '/test/path',
                name: 'Test',
                status: 'active',
                lastActivity: expect.any(Date),
                isActive: true,
                taskCount: 5,
                activeTask: 'task-1'
            });
        });

        it('should return null when workspace not found', async () => {
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);

            const result = await registry.getWorkspaceByPath('/test/path');

            expect(result).toBeNull();
        });
    });

    describe('scanAndRegisterWorkspaces', () => {
        beforeEach(() => {
            // Mock file system for scanning with path-aware behavior
            (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(true);
            (readdirSync as MockedFunction<typeof readdirSync>).mockImplementation((path: string) => {
                // Return .task only for the root test path to avoid infinite recursion
                if (path === '/test/path' || path === '/test') {
                    return ['.task'];
                }
                // For any subdirectory, return empty to prevent recursion
                return [];
            });
            (statSync as MockedFunction<typeof statSync>).mockReturnValue({
                isDirectory: () => true
            } as any);
        });

        it('should scan paths and register workspaces', async () => {
            const registry = new WorkspaceRegistry(mockDrizzleDb, {
                scanPaths: ['/test/path']
            });

            // Mock scanForWorkspaces to return a workspace without recursion
            (registry as any).scanForWorkspaces = vi.fn().mockResolvedValue(['/test/path/.task']);

            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);
            mockGlobalDb.createWorkspace.mockResolvedValue({ id: 'test-id' });

            const result = await registry.scanAndRegisterWorkspaces();

            expect(result).toEqual(['test-id']);
        });

        it('should handle scan errors gracefully', async () => {
            const registry = new WorkspaceRegistry(mockDrizzleDb, {
                scanPaths: ['/test/path']
            });

            (readdirSync as MockedFunction<typeof readdirSync>).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = await registry.scanAndRegisterWorkspaces();

            expect(result).toEqual([]);
        });

        it('should handle registration errors gracefully', async () => {
            const registry = new WorkspaceRegistry(mockDrizzleDb, {
                scanPaths: ['/test/path']
            });

            // Mock scanForWorkspaces to return a workspace without recursion
            (registry as any).scanForWorkspaces = vi.fn().mockResolvedValue(['/test/path/.task']);

            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);
            mockGlobalDb.createWorkspace.mockRejectedValue(new Error('DB error'));

            const result = await registry.scanAndRegisterWorkspaces();

            expect(result).toEqual([]);
        });
    });

    describe('scanForWorkspaces', () => {
        it('should return empty array when path does not exist', async () => {
            (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(false);

            const result = await (registry as any).scanForWorkspaces('/nonexistent');

            expect(result).toEqual([]);
        });

        it('should scan directories and find specly workspaces', async () => {
            (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(true);
            (readdirSync as MockedFunction<typeof readdirSync>).mockImplementation((path: string) => {
                if (path === '/test') {
                    return ['specly-workspace', 'regular-dir'];
                }
                return [];
            });
            (statSync as MockedFunction<typeof statSync>)
                .mockReturnValue({ isDirectory: () => true } as any);

            // Mock existsSync for isSpeclyWorkspace checks
            (existsSync as MockedFunction<typeof existsSync>).mockImplementation((path: string) => {
                // specly-workspace has .task subdirectory
                if (path === '/test/specly-workspace/.task') return true;
                // regular-dir does not have .task or .specly subdirectory
                if (path === '/test/regular-dir/.task') return false;
                if (path === '/test/regular-dir/.specly') return false;
                // Default to true for other paths (like the base path existence check)
                return true;
            });

            const result = await (registry as any).scanForWorkspaces('/test');

            expect(result).toContain('/test/specly-workspace');
            expect(result).not.toContain('/test/regular-dir');
        });

        it('should not recursively scan when depth limit reached', async () => {
            // Mock a path that's already at depth limit
            (existsSync as MockedFunction<typeof existsSync>).mockImplementation((path) => {
                // Base paths exist
                if (path === '/test/level1/level2') return true;
                if (path === '/test/level1/level2/level3') return true;
                if (path === '/test/level1/level2/level3/deep-dir') return true;
                // No .task or .specly subdirectories exist for any of these
                return false;
            });
            (readdirSync as MockedFunction<typeof readdirSync>).mockImplementation((path) => {
                if (path === '/test/level1/level2') {
                    return ['level3'];
                }
                if (path === '/test/level1/level2/level3') {
                    return ['deep-dir'];
                }
                return [];
            });

            const result = await (registry as any).scanForWorkspaces('/test/level1/level2');

            // Should recurse to level3 and deep-dir but not beyond due to depth limit
            expect(readdirSync).toHaveBeenCalledTimes(3); // Once for /test/level1/level2, once for /test/level1/level2/level3, once for /test/level1/level2/level3/deep-dir
            expect(result).toEqual([]);
        });

        it('should skip inaccessible entries', async () => {
            (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(true);
            (readdirSync as MockedFunction<typeof readdirSync>).mockImplementation((path: string) => {
                if (path === '/test') {
                    return ['accessible', 'inaccessible'];
                }
                return [];
            });
            (statSync as MockedFunction<typeof statSync>)
                .mockReturnValueOnce({ isDirectory: () => true } as any)
                .mockImplementationOnce(() => { throw new Error('Permission denied'); });

            const result = await (registry as any).scanForWorkspaces('/test');

            expect(result).toContain('/test/accessible');
            expect(result).not.toContain('/test/inaccessible');
        });

        it('should handle scan directory errors', async () => {
            (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(true);
            (readdirSync as MockedFunction<typeof readdirSync>).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = await (registry as any).scanForWorkspaces('/test');

            expect(result).toEqual([]);
        });
    });

    describe('isSpeclyWorkspace', () => {
        it('should return true when .task directory exists', () => {
            (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(true);

            const result = (registry as any).isSpeclyWorkspace('/test/workspace');

            expect(result).toBe(true);
            expect(existsSync).toHaveBeenCalledWith('/test/workspace/.task');
        });

        it('should return true when .specly directory exists', () => {
            (existsSync as MockedFunction<typeof existsSync>)
                .mockReturnValueOnce(false) // .task doesn't exist
                .mockReturnValueOnce(true); // .specly exists

            const result = (registry as any).isSpeclyWorkspace('/test/workspace');

            expect(result).toBe(true);
            expect(existsSync).toHaveBeenCalledWith('/test/workspace/.specly');
        });

        it('should return false when neither directory exists', () => {
            (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(false);

            const result = (registry as any).isSpeclyWorkspace('/test/workspace');

            expect(result).toBe(false);
        });
    });

    describe('extractWorkspaceName', () => {
        it('should extract name from path', () => {
            const result = (registry as any).extractWorkspaceName('/home/user/my-workspace');

            expect(result).toBe('my-workspace');
        });

        it('should handle root path', () => {
            const result = (registry as any).extractWorkspaceName('/');

            expect(result).toBe('workspace');
        });
    });

    describe('checkWorkspaceHealth', () => {
        it('should return error when path does not exist', () => {
            (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(false);

            const result = (registry as any).checkWorkspaceHealth('/nonexistent');

            expect(result).toBe('error');
        });

        it('should return disconnected when path exists and is specly workspace', () => {
            (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(true);
            // Mock isSpeclyWorkspace to return true
            const originalIsSpeclyWorkspace = (registry as any).isSpeclyWorkspace;
            (registry as any).isSpeclyWorkspace = vi.fn().mockReturnValue(true);

            const result = (registry as any).checkWorkspaceHealth('/test/workspace');

            expect(result).toBe('disconnected');

            // Restore original method
            (registry as any).isSpeclyWorkspace = originalIsSpeclyWorkspace;
        });

        it('should return error when path exists but is not specly workspace', () => {
            (existsSync as MockedFunction<typeof existsSync>).mockReturnValue(true);
            // Mock isSpeclyWorkspace to return false
            const originalIsSpeclyWorkspace = (registry as any).isSpeclyWorkspace;
            (registry as any).isSpeclyWorkspace = vi.fn().mockReturnValue(false);

            const result = (registry as any).checkWorkspaceHealth('/test/workspace');

            expect(result).toBe('error');

            // Restore original method
            (registry as any).isSpeclyWorkspace = originalIsSpeclyWorkspace;
        });

        it('should return error when exception occurs', () => {
            (existsSync as MockedFunction<typeof existsSync>).mockImplementation(() => {
                throw new Error('Access denied');
            });

            const result = (registry as any).checkWorkspaceHealth('/test/workspace');

            expect(result).toBe('error');
        });
    });

    describe('startActivityMonitoring', () => {
        it('should clear existing timer and set new one', () => {
            vi.useFakeTimers();

            const existingTimer = setTimeout(() => { }, 1000);
            (registry as any).activityTimers.set('test-id', existingTimer);

            (registry as any).startActivityMonitoring('test-id');

            expect((registry as any).activityTimers.get('test-id')).not.toBe(existingTimer);
        });

        it('should update workspace status on timeout', () => {
            vi.useFakeTimers();

            (registry as any).startActivityMonitoring('test-id');

            vi.advanceTimersByTime(300000); // 5 minutes

            expect(mockGlobalDb.updateWorkspace).toHaveBeenCalledWith('test-id', {
                status: 'inactive',
                updatedAt: expect.any(String)
            });
        });

        it('should handle update errors gracefully', () => {
            vi.useFakeTimers();

            mockGlobalDb.updateWorkspace.mockRejectedValue(new Error('DB error'));

            (registry as any).startActivityMonitoring('test-id');

            vi.advanceTimersByTime(300000);

            // Should not throw, error should be logged
            expect(mockGlobalDb.updateWorkspace).toHaveBeenCalled();
        });
    });

    describe('updateWorkspaceStatuses', () => {
        it('should update statuses when they differ', async () => {
            const workspaces = [{
                id: 'test-id',
                path: '/test/path',
                status: 'active'
            }];

            mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);

            // Mock checkWorkspaceHealth to return different status
            const originalCheckWorkspaceHealth = (registry as any).checkWorkspaceHealth;
            (registry as any).checkWorkspaceHealth = vi.fn().mockReturnValue('inactive');

            await (registry as any).updateWorkspaceStatuses();

            expect(mockGlobalDb.updateWorkspace).toHaveBeenCalledWith('test-id', {
                status: 'inactive',
                updatedAt: expect.any(String)
            });

            // Restore original method
            (registry as any).checkWorkspaceHealth = originalCheckWorkspaceHealth;
        });

        it('should not update when status is the same', async () => {
            const workspaces = [{
                id: 'test-id',
                path: '/test/path',
                status: 'active'
            }];

            mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);

            // Mock checkWorkspaceHealth to return same status
            const originalCheckWorkspaceHealth = (registry as any).checkWorkspaceHealth;
            (registry as any).checkWorkspaceHealth = vi.fn().mockReturnValue('active');

            await (registry as any).updateWorkspaceStatuses();

            expect(mockGlobalDb.updateWorkspace).not.toHaveBeenCalled();

            // Restore original method
            (registry as any).checkWorkspaceHealth = originalCheckWorkspaceHealth;
        });

        it('should handle errors gracefully', async () => {
            mockGlobalDb.getAllWorkspaces.mockRejectedValue(new Error('DB error'));

            await (registry as any).updateWorkspaceStatuses();

            // Should not throw
            expect(mockGlobalDb.getAllWorkspaces).toHaveBeenCalled();
        });
    });

    describe('unregisterWorkspace', () => {
        it('should clear activity timer and delete workspace', async () => {
            const timer = setTimeout(() => { }, 1000);
            (registry as any).activityTimers.set('test-id', timer);

            await registry.unregisterWorkspace('test-id');

            expect((registry as any).activityTimers.has('test-id')).toBe(false);
            expect(mockGlobalDb.deleteWorkspace).toHaveBeenCalledWith('test-id');
        });

        it('should handle missing timer gracefully', async () => {
            await registry.unregisterWorkspace('test-id');

            expect(mockGlobalDb.deleteWorkspace).toHaveBeenCalledWith('test-id');
        });
    });

    describe('getWorkspaceStats', () => {
        it('should return correct statistics', async () => {
            const workspaces = [
                { status: 'active' },
                { status: 'active' },
                { status: 'idle' },
                { status: 'disconnected' },
                { status: 'inactive' },
                { status: 'error' }
            ];

            mockGlobalDb.getAllWorkspaces.mockResolvedValue(workspaces);

            const result = await registry.getWorkspaceStats();

            expect(result).toEqual({
                total: 6,
                active: 2,
                connected: 3, // active + idle
                disconnected: 2, // disconnected + inactive
                error: 1
            });
        });
    });
});