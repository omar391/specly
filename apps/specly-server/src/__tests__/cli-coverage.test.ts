import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('./database/global-queries.js', () => ({
    getGlobalDatabaseService: vi.fn(),
    GlobalDatabaseService: vi.fn(),
    initializeGlobalDatabaseService: vi.fn(),
}));

vi.mock('./test-utils/database-test-helpers.js', () => ({
    getTestDatabaseInstances: vi.fn().mockReturnValue({ isInitialized: false }),
}));

describe('CLI Coverage', () => {
    let originalArgv: string[];
    let mockExit: any;
    let mockConsoleError: any;
    let mockConsoleLog: any;

    beforeEach(() => {
        originalArgv = process.argv;
        mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); });
        mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => { });
        mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.resetModules();
    });

    afterEach(() => {
        process.argv = originalArgv;
        vi.restoreAllMocks();
    });

    it('should fail main if no arguments provided', async () => {
        process.argv = ['node', 'cli.js'];
        const { main } = await import('../cli.js');

        await expect(main()).rejects.toThrow('process.exit called with code 1');
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    });

    it('should execute main with valid arguments', async () => {
        process.argv = ['node', 'cli.js', 'specly_init', '{}'];

        // Mock executeToolCall to avoid actual execution
        const deps = {
            executeOverride: vi.fn().mockResolvedValue({ isError: false, content: [] })
        };

        const { runCli } = await import('../cli.js');
        await runCli('specly_init', {}, deps);
        expect(deps.executeOverride).toHaveBeenCalledWith('specly_init', {});
    });

    it('should handle tool execution error in runCli', async () => {
        const deps = {
            executeOverride: vi.fn().mockResolvedValue({
                isError: true,
                content: [{ type: 'text', text: 'Error executing tool specly_init: Failed' }]
            })
        };

        const { runCli } = await import('../cli.js');
        await expect(runCli('specly_init', {}, deps)).rejects.toThrow('process.exit called with code 1');
        expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Failed');
    });

    it('should handle unexpected error in runCli', async () => {
        const deps = {
            executeOverride: vi.fn().mockRejectedValue(new Error('Unexpected crash'))
        };

        const { runCli } = await import('../cli.js');
        await expect(runCli('specly_init', {}, deps)).rejects.toThrow('process.exit called with code 1');
        expect(mockConsoleError).toHaveBeenCalledWith('Error:', 'Unexpected crash');
    });

    it('should handle initializeTools database error', async () => {
        // Mock dependencies for test environment path
        vi.doMock('../database/drizzle-connection.js', () => ({
            DrizzleDatabaseManager: vi.fn().mockImplementation(() => ({
                initialize: vi.fn()
            })),
            DatabaseType: { GLOBAL: 'global' }
        }));

        vi.doMock('../services/seed-manager.js', () => ({
            SeedManager: vi.fn().mockImplementation(() => ({
                initializeGlobalData: vi.fn()
            }))
        }));

        vi.doMock('../database/global-queries.js', () => ({
            getGlobalDatabaseService: vi.fn(),
            GlobalDatabaseService: vi.fn().mockImplementation(() => ({
                initialize: vi.fn().mockRejectedValue(new Error('DB Init Failed'))
            })),
            initializeGlobalDatabaseService: vi.fn(),
        }));

        const { executeToolCall } = await import('../cli.js');
        const result = await executeToolCall('specly_init', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed to initialize global database service');
    });

    it('should handle initializeTools drizzle manager error', async () => {
        // Mock dependencies for test environment path
        vi.doMock('../database/drizzle-connection.js', () => ({
            DrizzleDatabaseManager: vi.fn().mockImplementation(() => ({
                initialize: vi.fn()
            })),
            DatabaseType: { GLOBAL: 'global' }
        }));

        vi.doMock('../services/seed-manager.js', () => ({
            SeedManager: vi.fn().mockImplementation(() => ({
                initializeGlobalData: vi.fn()
            }))
        }));

        const mockDbService = {
            initialize: vi.fn(),
            getDrizzleManager: vi.fn().mockReturnValue(null) // Invalid
        };

        vi.doMock('../database/global-queries.js', () => ({
            getGlobalDatabaseService: vi.fn(),
            GlobalDatabaseService: vi.fn().mockImplementation(() => mockDbService),
            initializeGlobalDatabaseService: vi.fn(),
        }));

        const { executeToolCall } = await import('../cli.js');
        const result = await executeToolCall('specly_init', {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Drizzle manager error');
    });
});
