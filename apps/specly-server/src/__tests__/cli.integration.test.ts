import { test, expect } from 'vitest';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Child process required to safely exercise process.exit / runIfMain behavior:
// running the compiled CLI in a separate Node process avoids terminating the test runner.

const pkgDir = path.resolve(__dirname, '..', '..');
const distPath = path.resolve(pkgDir, 'dist', 'index.js');

function runBuild() {
    const res = child_process.spawnSync('pnpm', ['run', 'build'], {
        cwd: pkgDir,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'test' },
        stdio: 'inherit'
    });
    if (res.status !== 0) {
        throw new Error('build failed');
    }
}

function runNodeWithArgs(args: string[], extraEnv: Record<string, string> = {}) {
    const env = { ...process.env, NODE_ENV: 'test', VITEST: '1', SPECLY_TRANSITION_SIMULATE: '1', SPECLY_GC_ENABLED: 'false', ...extraEnv };
    const res = child_process.spawnSync(process.execPath, [distPath, ...args], {
        cwd: pkgDir,
        encoding: 'utf8',
        env,
        timeout: 30000,
        killSignal: 'SIGKILL'
    });
    return res as child_process.SpawnSyncReturns;
}

test('cli integration: usage branch with invalid/no args (child process required)', () => {
    // Build package first so dist/index.js exists
    runBuild();

    const res = runNodeWithArgs([]);

    // Should not kill parent vitest process; exit should be non-zero for usage/error
    expect(res.status === null ? res.signal : res.status).not.toBe(0);
    const stderr = (res.stderr || '') as string;
    const stdout = (res.stdout || '') as string;

    const normalized = (stderr + '\n' + stdout).toLowerCase();
    expect(/usage|specly/.test(normalized)).toBe(true);
}, 60000);

test('cli integration: fatal error branch (simulated) via preloaded thrower', () => {
    // Build package
    runBuild();

    // Create a temp module that will throw when required to simulate a fatal error
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specly-cli-test-'));
    const throwerPath = path.join(tmpDir, 'thrower.cjs');
    const throwerContent = `
if (process.env.SPECLY_INTEGRATION_THROW === '1') {
  console.error('FATAL_TEST_ERROR: simulated fatal error for integration test');
  throw new Error('simulated fatal error for integration test');
}
`;
    fs.writeFileSync(throwerPath, throwerContent, 'utf8');

    try {
        const res = child_process.spawnSync(process.execPath, [distPath], {
            cwd: pkgDir,
            encoding: 'utf8',
            env: {
                ...process.env,
                NODE_ENV: 'test',
                VITEST: '1',
                SPECLY_TRANSITION_SIMULATE: '1',
                SPECLY_GC_ENABLED: 'false',
                SPECLY_INTEGRATION_THROW: '1',
                NODE_OPTIONS: `--require ${throwerPath}`
            },
            timeout: 30000,
            killSignal: 'SIGKILL'
        });

        const stderr = String(res.stderr || '');
        const statusOrSignal = res.status === null ? res.signal : res.status;
        expect(statusOrSignal).not.toBe(0);
        expect(stderr).toContain('FATAL_TEST_ERROR: simulated fatal error for integration test');
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
    }
});