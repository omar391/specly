import { expect, test } from 'vitest';
import { buildStartOptions, SPECLY_VERSION } from '../index.js';

test('buildStartOptions returns expected shape and safe callbacks', () => {
    const opts = buildStartOptions();

    expect(opts.serverName).toBe('specly');
    expect(opts.serverVersion).toBe(SPECLY_VERSION);
    expect(opts.defaultPort).toBe(8989);

    // createInstanceManager should return an instance-like object
    const im = opts.createInstanceManager({ local: false, port: 0 });
    expect(im).toBeTruthy();
    expect(typeof im).toBe('object');
    // Some InstanceManager implementations expose getVersion; if present, verify it
    if (typeof (im as any).getVersion === 'function') {
        expect((im as any).getVersion()).toBe(SPECLY_VERSION);
    }

    // customOptionsParser should set forceSeed when flag present
    const parsed = opts.cliConfig.customOptionsParser(['--force-seed'], {});
    expect(parsed.forceSeed).toBe(true);

    // localMode handlers exist but we do not invoke onShutdown/onTransition (would exit/spawn)
    expect(opts.localMode).toBeDefined();
    expect(typeof opts.localMode.onLocalStart).toBe('function');
    expect(typeof opts.localMode.onShutdown).toBe('function');
    expect(typeof opts.localMode.onTransition).toBe('function');
});
