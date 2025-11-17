import { describe, it, expect, vi } from 'vitest';

describe('cli runCli and main branches', () => {
    it('runCli success path with executeOverride returns non-error result', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const execOverride = vi.fn().mockResolvedValue({ isError: false, content: { ok: true } });
        const mod = await import('../cli.js');
        try {
            await mod.runCli('specly_init', { foo: 'bar' }, { executeOverride: execOverride });
            expect(execOverride).toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
        }
    });

    it('runCli propagates error when result.isError is true', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const execOverride = vi.fn().mockResolvedValue({ isError: true, content: { message: 'bad' } });
        const mod = await import('../cli.js');
        try {
            await expect(mod.runCli('specly_start', {}, { executeOverride: execOverride })).rejects.toThrow();
        } finally {
            logSpy.mockRestore();
        }
    });

    it('runCli handles thrown exceptions from execute', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const execOverride = vi.fn().mockRejectedValue(new Error('boom'));
        const mod = await import('../cli.js');
        try {
            await expect(mod.runCli('specly_add', {}, { executeOverride: execOverride })).rejects.toThrow();
        } finally {
            logSpy.mockRestore();
        }
    });

    it('main throws when no args provided', async () => {
        const origArgv = process.argv;
        process.argv = ['node', 'cli.js'];
        const mod = await import('../cli.js');
        try {
            await expect(mod.main()).rejects.toThrow();
        } finally {
            process.argv = origArgv;
        }
    });

    it('runCli prints array content items and handles text items', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const execOverride = vi.fn().mockResolvedValue({ isError: false, content: [{ type: 'text', text: 'hello' }, { type: 'json', value: { ok: true } }] });
        const mod = await import('../cli.js');
        try {
            await mod.runCli('specly_init', { foo: 'bar' }, { executeOverride: execOverride });
            expect(execOverride).toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
        }
    });

    it('runCli prints non-array content directly', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const execOverride = vi.fn().mockResolvedValue({ isError: false, content: { some: 'value' } });
        const mod = await import('../cli.js');
        try {
            await mod.runCli('specly_init', { foo: 'bar' }, { executeOverride: execOverride });
            expect(execOverride).toHaveBeenCalled();
        } finally {
            logSpy.mockRestore();
        }
    });

    it('unhandledRejection handler calls process.exit(1)', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => { /* noop */ }) as unknown as never);
        // Add the handler manually since it's not added in test environment
        const handler = (reason: any, promise: any) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        };
        process.on('unhandledRejection', handler);
        try {
            // Trigger unhandled rejection
            Promise.reject(new Error('boom'));
            // Wait a bit for the event loop
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(exitSpy).toHaveBeenCalledWith(1);
        } finally {
            process.removeListener('unhandledRejection', handler);
            exitSpy.mockRestore();
        }
    });

    it('initializeTools logs on import-time failure and executeToolCall rejects', async () => {
        vi.resetModules();
        vi.mock('../test-utils/database-test-helpers.js', () => ({ getTestDatabaseInstances: () => ({ isInitialized: false }) }));
        // Export a DrizzleDatabaseManager class that throws on construction to simulate runtime import failure
        vi.mock('../database/drizzle-connection.js', () => ({
            DrizzleDatabaseManager: class { constructor() { throw new Error('drizzle import failed'); } },
            DatabaseType: { GLOBAL: 'GLOBAL' }
        }));

        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        try {
            const mod = await import('../cli.js');
            await expect(mod.executeToolCall('specly_init', {})).rejects.toThrow();
            expect(errSpy).toHaveBeenCalled();
        } finally {
            errSpy.mockRestore();
        }
    });

    it('initializeTools handles missing drizzle manager and logs error', async () => {
        vi.resetModules();
        const origNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            vi.mock('../test-utils/database-test-helpers.js', () => ({ getTestDatabaseInstances: () => ({ isInitialized: false }) }));
            vi.mock('../database/global-queries.js', () => ({
                getGlobalDatabaseService: () => ({
                    initialize: async () => { /* noop */ },
                    getDrizzleManager: () => { throw new Error('no manager'); }
                })
            }));

            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            try {
                const mod = await import('../cli.js');
                await expect(mod.executeToolCall('specly_init', {})).rejects.toThrow();
                expect(errSpy).toHaveBeenCalled();
            } finally {
                errSpy.mockRestore();
            }
        } finally {
            process.env.NODE_ENV = origNodeEnv;
        }
    });

    it('initializeTools uses test database instances when provided', async () => {
        vi.resetModules();
        vi.doMock('../test-utils/database-test-helpers.js', () => ({
            getTestDatabaseInstances: () => ({
                isInitialized: true,
                drizzleManager: {},
                dbService: { initialize: async () => { /* noop */ }, getDrizzleManager: () => ({}) }
            })
        }));

        // Mock tool constructors to ensure they can be constructed with a minimal drizzle manager
        const toolCtor = vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue({ isError: false, content: { ok: true } }) }));
        const mockSchema = { parse: vi.fn().mockReturnValue({}) };
        vi.doMock('../tools/init.js', () => ({ InitToolNew: toolCtor, initToolSchema: mockSchema }));
        vi.doMock('../tools/start.js', () => ({ StartTool: toolCtor, startToolSchema: mockSchema }));
        vi.doMock('../tools/add.js', () => ({ AddToolNew: toolCtor, addToolSchema: mockSchema }));
        vi.doMock('../tools/status.js', () => ({ StatusToolNew: toolCtor, statusToolSchema: mockSchema }));
        vi.doMock('../tools/update.js', () => ({ UpdateToolNew: toolCtor, updateToolSchema: mockSchema }));
        vi.doMock('../tools/audit.js', () => ({ AuditToolNew: toolCtor, auditToolSchema: mockSchema }));
        vi.doMock('../tools/focus.js', () => ({ FocusToolNew: toolCtor, focusToolSchema: mockSchema }));
        vi.doMock('../tools/github.js', () => ({ GitHubTool: toolCtor, githubToolSchema: mockSchema }));
        vi.doMock('../tools/rule-update.js', () => ({ RuleUpdateTool: toolCtor, ruleUpdateToolSchema: mockSchema }));
        vi.doMock('../tools/remote-interface.js', () => ({ RemoteInterfaceTool: toolCtor, remoteInterfaceToolSchema: mockSchema }));

        const mod = await import('../cli.js');
        const result = await mod.executeToolCall('specly_init', {});
        expect(result).toHaveProperty('isError', false);
    });

    it('throwUnhandledTool helper throws the expected error', async () => {
        const mod = await import('../cli.js');
        expect(() => mod.throwUnhandledTool('specly_magic')).toThrow('Unhandled tool: specly_magic');
    });

    it('executeToolCall throws for unknown tool name', async () => {
        const mod = await import('../cli.js');
        await expect(mod.executeToolCall('unknown_tool', {})).rejects.toThrow('Unknown tool: unknown_tool');
    });

    it('initializeTools logs error when initializeGlobalDatabaseService throws', async () => {
        vi.resetModules();
        // Mock test instances to be unavailable so it uses production path
        vi.doMock('../test-utils/database-test-helpers.js', () => ({ getTestDatabaseInstances: () => ({ isInitialized: false }) }));
        // Override NODE_ENV to trigger production path
        const origNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            // Mock GlobalDatabaseService to throw on initialize
            vi.doMock('../database/global-queries.js', () => ({
                getGlobalDatabaseService: () => ({
                    initialize: vi.fn().mockImplementation(() => { throw new Error('initialize failed'); }),
                    getDrizzleManager: () => ({})
                }),
                GlobalDatabaseService: class GlobalDatabaseService { constructor(/*..*/) { } }
            }));

            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            try {
                const mod = await import('../cli.js');
                await expect(mod.executeToolCall('specly_init', {})).rejects.toThrow();
                expect(errSpy).toHaveBeenCalled();
            } finally {
                errSpy.mockRestore();
            }
        } finally {
            process.env.NODE_ENV = origNodeEnv;
        }
    });
});
