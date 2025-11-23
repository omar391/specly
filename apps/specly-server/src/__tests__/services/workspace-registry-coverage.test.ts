import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies at top level for fs
vi.mock('fs', async () => {
    return {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        statSync: vi.fn(),
    };
});

describe('WorkspaceRegistry - Coverage', () => {
    let registry: any; // Type as any to access private methods
    let mockGlobalDb: any;
    let mockDrizzle: any;

    beforeEach(async () => {
        vi.resetModules();
        vi.useFakeTimers();

        mockGlobalDb = {
            updateWorkspace: vi.fn(),
            getAllWorkspaces: vi.fn(),
            getWorkspaceByPath: vi.fn(),
            createWorkspace: vi.fn(),
            updateWorkspaceActivity: vi.fn(),
            deleteWorkspace: vi.fn(),
        };

        mockDrizzle = {};

        // Mock GlobalDatabaseService using doMock to access mockGlobalDb
        vi.doMock('../../database/global-queries.js', () => {
            return {
                GlobalDatabaseService: vi.fn().mockImplementation(() => mockGlobalDb)
            };
        });

        const { WorkspaceRegistry } = await import('../../services/workspace-registry.js');
        registry = new WorkspaceRegistry(mockDrizzle, {
            activityTimeoutMs: 1000,
            cleanupIntervalMs: 1000,
            scanPaths: ['/tmp/scan']
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('should handle error in startActivityMonitoring timeout', async () => {
        // Setup
        mockGlobalDb.createWorkspace.mockImplementation((data: any) => Promise.resolve(data));
        mockGlobalDb.updateWorkspace.mockRejectedValue(new Error('Update failed'));

        // Mock fs
        const fs = await import('fs');
        vi.mocked(fs.existsSync).mockReturnValue(true); // Path exists
        // Mock isSpeclyWorkspace to return true (checks .task or .specly)
        // We need to make sure checkWorkspaceHealth returns something valid
        vi.mocked(fs.existsSync).mockImplementation((path: any) => {
            if (path.endsWith('.task')) return true;
            return true;
        });

        // Register to start monitoring
        const wsId = await registry.registerWorkspace('/tmp/ws1');

        // Fast forward time to trigger timeout
        vi.advanceTimersByTime(1001);

        // Verify updateWorkspace was called and failed (we can't verify the catch block execution directly but we can verify it didn't crash)
        expect(mockGlobalDb.updateWorkspace).toHaveBeenCalledWith(wsId, expect.objectContaining({ status: 'inactive' }));
    });

    it('should handle error in updateWorkspaceStatuses', async () => {
        mockGlobalDb.getAllWorkspaces.mockRejectedValue(new Error('DB Error'));

        // Start registry to trigger interval
        await registry.start();

        // Fast forward time
        await vi.advanceTimersByTimeAsync(1001);

        // Should log error but not crash
        expect(mockGlobalDb.getAllWorkspaces).toHaveBeenCalled();

        registry.stop();
    });

    it('should handle error in checkWorkspaceHealth', async () => {
        const fs = await import('fs');
        vi.mocked(fs.existsSync).mockImplementation(() => {
            throw new Error('FS Error');
        });

        // Access private method via any
        const status = (registry as any).checkWorkspaceHealth('/tmp/path');
        expect(status).toBe('error');
    });

    it('should handle error in scanForWorkspaces (readdirSync)', async () => {
        const fs = await import('fs');
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockImplementation(() => {
            throw new Error('Read Error');
        });

        const workspaces = await (registry as any).scanForWorkspaces('/tmp/path');
        expect(workspaces).toEqual([]);
    });

    it('should handle error in scanForWorkspaces (statSync)', async () => {
        const fs = await import('fs');
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue(['dir1'] as any);
        vi.mocked(fs.statSync).mockImplementation(() => {
            throw new Error('Stat Error');
        });

        const workspaces = await (registry as any).scanForWorkspaces('/tmp/path');
        expect(workspaces).toEqual([]);
    });

    it('should handle error in scanAndRegisterWorkspaces (scanForWorkspaces)', async () => {
        // Mock scanForWorkspaces to throw
        registry['scanForWorkspaces'] = vi.fn().mockRejectedValue(new Error('Scan failed'));

        const ids = await registry.scanAndRegisterWorkspaces();
        expect(ids).toEqual([]);
    });

    it('should handle error in scanAndRegisterWorkspaces (registerWorkspace)', async () => {
        // Mock scanForWorkspaces to return paths
        registry['scanForWorkspaces'] = vi.fn().mockResolvedValue(['/tmp/ws1']);
        // Mock registerWorkspace to throw
        registry.registerWorkspace = vi.fn().mockRejectedValue(new Error('Register failed'));

        const ids = await registry.scanAndRegisterWorkspaces();
        expect(ids).toEqual([]);
    });
});
