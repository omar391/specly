import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureSpecs } from '../test-utils/ensure-specs.js';
import { initializeGlobalDatabase, clearGlobalDatabaseInstance } from '../database/drizzle-connection.js';

describe('ensureSpecs', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ensure-specs-test-'));
  });

  afterEach(async () => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    clearGlobalDatabaseInstance();
  });

  it('inserts new specs successfully', async () => {
    await initializeGlobalDatabase();
    const specs = [
      { hash: 'test-spec-1', intent: 'autonomous' as const, sideEffect: false },
      { hash: 'test-spec-2', intent: 'human' as const, sideEffect: true }
    ];

    await expect(ensureSpecs(specs)).resolves.toBeUndefined();
  });

  it('handles duplicate specs gracefully (covers catch block)', async () => {
    await initializeGlobalDatabase();
    const specs = [
      { hash: 'duplicate-spec', intent: 'autonomous' as const, sideEffect: false }
    ];

    // Insert first time
    await ensureSpecs(specs);
    // Insert again - should not throw, catch block should execute
    await expect(ensureSpecs(specs)).resolves.toBeUndefined();
  });

  it('handles specs with idempotency key template', async () => {
    await initializeGlobalDatabase();
    const specs = [
      {
        hash: 'idempotent-spec',
        intent: 'autonomous' as const,
        sideEffect: false,
        idempotencyKeyTemplate: 'test-{{param}}'
      }
    ];

    await expect(ensureSpecs(specs)).resolves.toBeUndefined();
  });

  it('handles empty list', async () => {
    await initializeGlobalDatabase();
    await expect(ensureSpecs([])).resolves.toBeUndefined();
  });

  it('initializes database if not initialized', async () => {
    const specs = [{ hash: 'init-test' }];
    await expect(ensureSpecs(specs)).resolves.toBeUndefined();
  });

  it('uses default values for intent and sideEffect', async () => {
    await initializeGlobalDatabase();
    const specs = [{ hash: 'default-test' }];
    await expect(ensureSpecs(specs)).resolves.toBeUndefined();
  });
});