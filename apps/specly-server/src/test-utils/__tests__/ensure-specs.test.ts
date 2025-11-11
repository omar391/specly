import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureSpecs } from '../ensure-specs.js';
import { getGlobalDatabase } from '../../database/drizzle-connection.js';

// Mock the database dependencies
vi.mock('../../database/drizzle-connection.js', () => ({
  getGlobalDatabase: vi.fn()
}));

vi.mock('../../database/schema/global-schema.js', () => ({
  specs: 'mocked-specs-table'
}));

describe('ensureSpecs', () => {
  const mockDb = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined)
  };

  const mockDbMgr = {
    initialized: false,
    initialize: vi.fn().mockResolvedValue(undefined),
    getDb: vi.fn().mockReturnValue(mockDb)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getGlobalDatabase.mockReturnValue(mockDbMgr);
    mockDbMgr.initialized = false;
  });

  it('initializes database manager when not initialized', async () => {
    mockDbMgr.initialized = false;

    await ensureSpecs([{ hash: 'test-hash' }]);

    expect(mockDbMgr.initialize).toHaveBeenCalled();
    expect(mockDbMgr.getDb).toHaveBeenCalled();
  });

  it('does not initialize when already initialized', async () => {
    mockDbMgr.initialized = true;

    await ensureSpecs([{ hash: 'test-hash' }]);

    expect(mockDbMgr.initialize).not.toHaveBeenCalled();
    expect(mockDbMgr.getDb).toHaveBeenCalled();
  });

  it('inserts single spec successfully', async () => {
    const spec = {
      hash: 'test-hash',
      intent: 'human' as const,
      sideEffect: true,
      idempotencyKeyTemplate: 'test-template'
    };

    await ensureSpecs([spec]);

    expect(mockDb.insert).toHaveBeenCalledWith('mocked-specs-table');
    expect(mockDb.values).toHaveBeenCalledWith({
      hash: 'test-hash',
      executorType: 'noop',
      executorVersion: '1',
      intent: 'human',
      sideEffect: true,
      idempotencyKeyTemplate: 'test-template',
      staticParams: {},
      metadata: {}
    });
  });

  it('inserts multiple specs', async () => {
    const specs = [
      { hash: 'hash1' },
      { hash: 'hash2', intent: 'autonomous' as const },
      { hash: 'hash3', sideEffect: true }
    ];

    await ensureSpecs(specs);

    expect(mockDb.insert).toHaveBeenCalledTimes(3);
    expect(mockDb.values).toHaveBeenCalledTimes(3);
  });

  it('uses default values when not provided', async () => {
    await ensureSpecs([{ hash: 'test-hash' }]);

    expect(mockDb.values).toHaveBeenCalledWith({
      hash: 'test-hash',
      executorType: 'noop',
      executorVersion: '1',
      intent: 'autonomous',
      sideEffect: false,
      idempotencyKeyTemplate: undefined,
      staticParams: {},
      metadata: {}
    });
  });

  it('ignores insert errors (duplicates)', async () => {
    mockDb.values.mockRejectedValueOnce(new Error('UNIQUE constraint failed'));

    // Should not throw
    await expect(ensureSpecs([{ hash: 'duplicate-hash' }])).resolves.not.toThrow();

    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalled();
  });

  it('handles empty spec list', async () => {
    await ensureSpecs([]);

    expect(mockDbMgr.getDb).toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('handles mixed success and failure inserts', async () => {
    mockDb.values
      .mockResolvedValueOnce(undefined) // first succeeds
      .mockRejectedValueOnce(new Error('Duplicate')) // second fails
      .mockResolvedValueOnce(undefined); // third succeeds

    await ensureSpecs([
      { hash: 'success1' },
      { hash: 'duplicate' },
      { hash: 'success2' }
    ]);

    expect(mockDb.insert).toHaveBeenCalledTimes(3);
    expect(mockDb.values).toHaveBeenCalledTimes(3);
  });
});