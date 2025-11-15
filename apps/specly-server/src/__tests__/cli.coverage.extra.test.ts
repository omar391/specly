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
        try {
            // Call the registered unhandledRejection handlers directly to avoid creating a true unhandled rejection
            const handlers = process.listeners('unhandledRejection');
            for (const h of handlers) {
                // call with a reason and a dummy promise
                (h as any)(new Error('boom'), Promise.resolve());
            }
            expect(exitSpy).toHaveBeenCalledWith(1);
        } finally {
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

    it('throwUnhandledTool helper throws the expected error', async () => {
        const mod = await import('../cli.js');
        expect(() => mod.throwUnhandledTool('specly_magic')).toThrow('Unhandled tool: specly_magic');
    });
});
