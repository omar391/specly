import { vi, test, expect } from 'vitest';

// Tests to exercise remaining CLI error/exit branches in cli.ts

test('main throws when invoked with no arguments (usage early-exit)', async () => {
    const originalArgv = process.argv.slice();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    try {
        process.argv = [process.execPath, '/path/to/node']; // no user args -> args.length < 1
        // Import the module and call main
        const mod = await import('../cli.js');
        await expect(mod.main()).rejects.toThrow('process.exit called with code 1');
        expect(errorSpy).toHaveBeenCalled();
    } finally {
        errorSpy.mockRestore();
        process.argv = originalArgv;
    }
});

test('runCli outer catch logs and rethrows when executeOverride throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    const execMock = vi.fn().mockRejectedValue(new Error('BOOM'));
    try {
        const mod = await import('../cli.js');
        await expect(mod.runCli('specly_start', {}, { executeOverride: execMock as any })).rejects.toThrow('process.exit called with code 1');
        // Outer catch logs a "❌ CLI test failed:" message
        expect(errorSpy.mock.calls.some(c => String(c[0]).includes('❌ CLI test failed:'))).toBe(true);
    } finally {
        errorSpy.mockRestore();
    }
});

test('process unhandledRejection handler logs and calls process.exit', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { }) as any);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    try {
        // Emit an unhandledRejection to exercise the global handler
        process.emit('unhandledRejection', new Error('uh-oh'), Promise.resolve());
        expect(errorSpy).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
        exitSpy.mockRestore();
        errorSpy.mockRestore();
    }
});
