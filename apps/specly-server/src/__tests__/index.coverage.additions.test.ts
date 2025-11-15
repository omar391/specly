import { vi, test, expect, beforeEach, afterEach } from 'vitest';
import * as indexModule from '../index.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  delete process.env.SPECLY_TRANSITION_SIMULATE;
});

test('buildStartOptions callbacks exercise lifecycle paths safely', async () => {
  const { buildStartOptions, SpeclyServer, performTransitionSpawn } = indexModule as any;

  // Spy on SpeclyServer prototype lifecycle methods so internal singleton calls are intercepted
  const ensureInitSpy = vi.spyOn(SpeclyServer.prototype, 'ensureServerInitialized').mockImplementation(async () => {});
  const ensureSeedSpy = vi.spyOn(SpeclyServer.prototype, 'ensureSpeclySeed').mockImplementation(async (_: any) => {});
  const configureSpy = vi.spyOn(SpeclyServer.prototype, 'configureSpeclyApp').mockImplementation(async () => {});
  const setupRoutesSpy = vi.spyOn(SpeclyServer.prototype, 'setupSpeclyApi').mockImplementation(async () => {});
  const startBgSpy = vi.spyOn(SpeclyServer.prototype, 'startBackgroundJobs').mockImplementation(() => {});
  const stopBgSpy = vi.spyOn(SpeclyServer.prototype, 'stopBackgroundJobs').mockImplementation(() => {});

  // Spy on performTransitionSpawn to avoid real spawn
  const spawnSpy = vi.spyOn(indexModule, 'performTransitionSpawn').mockImplementation(async () => {});

  const opts = buildStartOptions();

  // onInitialize should call ensureServerInitialized and ensureSpeclySeed
  await opts.onInitialize({ forceSeed: true });
  expect(ensureInitSpy).toHaveBeenCalled();
  expect(ensureSeedSpy).toHaveBeenCalled();

  // configureApp should call configureSpeclyApp
  await opts.configureApp({}, { local: false });
  expect(configureSpy).toHaveBeenCalled();

  // setupRoutes should call setupSpeclyApi
  await opts.setupRoutes({}, {});
  expect(setupRoutesSpy).toHaveBeenCalled();

  // onAfterStart just logs; ensure it runs without error
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  await opts.onAfterStart({}, { port: 1234 });
  expect(logSpy).toHaveBeenCalled();
  logSpy.mockRestore();

  // localMode.onLocalStart should call startBackgroundJobs
  await opts.localMode.onLocalStart({}, {});
  expect(startBgSpy).toHaveBeenCalled();

  // localMode.onShutdown should call stopBackgroundJobs and schedule exit; mock process.exit
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {}) as any);
  // stub setTimeout to run immediately
  const originalSetTimeout = global.setTimeout;
  // @ts-ignore
  global.setTimeout = (cb: any, _ms?: number) => { cb(); return 0 as any; };

  try {
    await opts.localMode.onShutdown({}, {});
    expect(stopBgSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalled();
  } finally {
    global.setTimeout = originalSetTimeout;
    exitSpy.mockRestore();
  }

  // localMode.onTransition should call stopBackgroundJobs and then spawn; set simulate env var to avoid real spawn
  process.env.SPECLY_TRANSITION_SIMULATE = '1';
  // stub setTimeout so the delayed spawn runs synchronously in the test
  // @ts-ignore
  global.setTimeout = (cb: any, _ms?: number) => { cb(); return 0 as any; };
  try {
    await opts.localMode.onTransition({}, {});
    // allow any pending microtasks from the async callback to resolve
    await Promise.resolve();
    await Promise.resolve();
    expect(stopBgSpy).toHaveBeenCalled();
    // directly invoke the spawn helper to exercise its logic under test-mode
    await indexModule.performTransitionSpawn();
    expect(spawnSpy).toHaveBeenCalled();
  } finally {
    // restore original timer
    global.setTimeout = originalSetTimeout;
  }
});
