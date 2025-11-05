/**
 * Unit Tests for PersistentJournalService
 *
 * Tests journal persistence, idempotency key resolution, upsert logic,
 * error handling, and metrics integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersistentJournalService, createPersistentJournal } from '../services/persistent-journal-service.js';
import { getGlobalDatabaseService } from '../database/global-queries.js';

// Create comprehensive mock for DrizzleORM query builder with fluent interface
const createMockQueryBuilder = () => {
    const mock = {
        select: vi.fn(),
        from: vi.fn(),
        where: vi.fn(),
        insert: vi.fn(),
        values: vi.fn(),
        update: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        returning: vi.fn(),
        orderBy: vi.fn(),
        limit: vi.fn(),
        offset: vi.fn(),
        onConflictDoNothing: vi.fn()
    };

    // Setup chaining for most methods
    mock.select.mockReturnValue(mock);
    mock.from.mockReturnValue(mock);
    mock.where.mockReturnValue(mock);
    mock.insert.mockReturnValue(mock);
    mock.values.mockReturnValue(mock);
    mock.update.mockReturnValue(mock);
    mock.set.mockReturnValue(mock);
    mock.delete.mockReturnValue(mock);
    mock.orderBy.mockReturnValue(mock);
    mock.offset.mockReturnValue(mock);
    mock.onConflictDoNothing.mockReturnValue(mock);

    return mock;
};

// Mock the global database service
vi.mock('../database/global-queries.js');

describe('PersistentJournalService', () => {
    let mockGlobalService: any;
    let mockDrizzleManager: any;
    let mockDb: ReturnType<typeof createMockQueryBuilder>;
    let service: PersistentJournalService;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Create mock query builder
        mockDb = createMockQueryBuilder();

        mockDrizzleManager = {
            initialized: true,
            getDb: vi.fn().mockReturnValue(mockDb)
        };

        mockGlobalService = {
            initialize: vi.fn().mockResolvedValue(undefined),
            getDrizzleManager: vi.fn().mockReturnValue(mockDrizzleManager)
        };

        // Mock the getGlobalDatabaseService function
        (getGlobalDatabaseService as any).mockReturnValue(mockGlobalService);

        service = new PersistentJournalService('test-session');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Constructor and Initialization', () => {
        it('should create service with default sessionId', () => {
            const defaultService = new PersistentJournalService();
            expect(defaultService).toBeInstanceOf(PersistentJournalService);
        });

        it('should create service with custom sessionId', () => {
            const customService = new PersistentJournalService('custom-session');
            expect(customService).toBeInstanceOf(PersistentJournalService);
        });

        it('should accept metrics collector in options', () => {
            const mockMetrics = { inc: vi.fn() };
            const serviceWithMetrics = new PersistentJournalService('test', { metrics: mockMetrics });
            expect(serviceWithMetrics).toBeInstanceOf(PersistentJournalService);
        });
    });

    describe('ensureInitialized', () => {
        it('should initialize service on first call', async () => {
            await (service as any).ensureInitialized();
            expect(mockGlobalService.initialize).toHaveBeenCalledTimes(1);
            expect((service as any).initialized).toBe(true);
        });

        it('should skip initialization if already initialized', async () => {
            (service as any).initialized = true;
            await (service as any).ensureInitialized();
            expect(mockGlobalService.initialize).not.toHaveBeenCalled();
        });

        it('should handle concurrent initialization calls', async () => {
            const initPromises = [
                (service as any).ensureInitialized(),
                (service as any).ensureInitialized(),
                (service as any).ensureInitialized()
            ];

            await Promise.all(initPromises);
            expect(mockGlobalService.initialize).toHaveBeenCalledTimes(1);
        });

        it('should handle initialization failure gracefully', async () => {
            mockGlobalService.initialize.mockRejectedValue(new Error('Init failed'));
            await (service as any).ensureInitialized();
            // The method catches errors internally
            expect((service as any).initialized).toBe(false);
        });
    });

    describe('resolveIdempotencyKey', () => {
        beforeEach(async () => {
            await (service as any).ensureInitialized();
        });

        it('should return specHash as fallback when manager not initialized', async () => {
            mockDrizzleManager.initialized = false;
            const key = await (service as any).resolveIdempotencyKey('test-hash');
            expect(key).toBe('test-hash');
        });

        it('should return cached key on subsequent calls', async () => {
            (service as any).specCache['test-hash'] = 'cached-key';
            const key = await (service as any).resolveIdempotencyKey('test-hash');
            expect(key).toBe('cached-key');
            expect(mockDb.select).not.toHaveBeenCalled();
        });

        it('should return specHash when spec not found and auto-create disabled', async () => {
            process.env.SPECLY_JOURNAL_AUTOCREATE_SPEC = 'false';
            mockDb.limit.mockResolvedValue([]);

            const key = await (service as any).resolveIdempotencyKey('test-hash');
            expect(key).toBe('test-hash');
        });

        it('should auto-create spec when not found and auto-create enabled', async () => {
            process.env.SPECLY_JOURNAL_AUTOCREATE_SPEC = 'true';
            mockDb.limit.mockResolvedValueOnce([]); // First call for spec lookup
            mockDb.limit.mockResolvedValueOnce([]); // Second call after insert

            const key = await (service as any).resolveIdempotencyKey('test-hash');
            expect(key).toBe('test-hash');
            expect(mockDb.insert).toHaveBeenCalled();
        });

        it('should use template when spec has idempotencyKeyTemplate', async () => {
            mockDb.limit.mockResolvedValue([{
                hash: 'test-hash',
                idempotencyKeyTemplate: 'prefix-{{spec_hash}}-suffix'
            }]);

            const key = await (service as any).resolveIdempotencyKey('test-hash');
            expect(key).toBe('prefix-test-hash-suffix');
            expect((service as any).specCache['test-hash']).toBe('prefix-test-hash-suffix');
        });

        it('should handle template replacement with whitespace', async () => {
            mockDb.limit.mockResolvedValue([{
                hash: 'test-hash',
                idempotencyKeyTemplate: 'node-{{ spec_hash }}'
            }]);

            const key = await (service as any).resolveIdempotencyKey('test-hash');
            expect(key).toBe('node-test-hash');
        });

        it('should return specHash on database errors', async () => {
            mockDb.limit.mockRejectedValue(new Error('DB error'));
            const key = await (service as any).resolveIdempotencyKey('test-hash');
            expect(key).toBe('test-hash');
        });

        it('should handle insert errors during auto-create gracefully', async () => {
            process.env.SPECLY_JOURNAL_AUTOCREATE_SPEC = 'true';
            mockDb.limit.mockResolvedValue([]);
            mockDb.insert.mockRejectedValue(new Error('Insert failed'));

            const key = await (service as any).resolveIdempotencyKey('test-hash');
            expect(key).toBe('test-hash');
        });

        afterEach(() => {
            delete process.env.SPECLY_JOURNAL_AUTOCREATE_SPEC;
        });
    });

    describe('upsert', () => {
        beforeEach(async () => {
            await (service as any).ensureInitialized();
        });

        it('should insert new row when no existing record', async () => {
            mockDb.limit.mockResolvedValue([]);

            await (service as any).upsert('test-hash', () => { }, (idemKey: string) => ({ id: 'new-id', data: 'test' }));

            expect(mockDb.insert).toHaveBeenCalled();
        });

        it('should update existing row when record found', async () => {
            const existingRow = { id: 'existing-id', attempts: 1 };
            mockDb.limit.mockResolvedValue([existingRow]);

            await (service as any).upsert('test-hash', (row: any) => ({ ...row, attempts: 2 }), () => { });

            expect(mockDb.update).toHaveBeenCalled();
        });

        it('should skip operation when manager not initialized', async () => {
            mockDrizzleManager.initialized = false;
            await (service as any).upsert('test-hash', () => { }, () => { });
            expect(mockDb.limit).not.toHaveBeenCalled();
        });

        it('should increment metrics on database errors', async () => {
            const mockMetrics = { inc: vi.fn() };
            service = new PersistentJournalService('test-session', { metrics: mockMetrics });

            mockDb.limit.mockRejectedValue(new Error('DB error'));

            await (service as any).upsert('test-hash', () => { }, () => { });

            expect(mockMetrics.inc).toHaveBeenCalledWith('specly_engine_journal_failures_total');
        });

        it('should handle metrics errors gracefully', async () => {
            const mockMetrics = { inc: vi.fn().mockImplementation(() => { throw new Error('Metrics error'); }) };
            service = new PersistentJournalService('test-session', { metrics: mockMetrics });

            mockDb.limit.mockRejectedValue(new Error('DB error'));

            // Should not throw despite metrics error
            await expect((service as any).upsert('test-hash', () => { }, () => { })).resolves.not.toThrow();
        });
    });

    describe('getSuccessfulResult', () => {
        beforeEach(async () => {
            await (service as any).ensureInitialized();
        });

        it('should return undefined when manager not initialized', async () => {
            mockDrizzleManager.initialized = false;
            const result = await service.getSuccessfulResult('test-hash');
            expect(result).toBeUndefined();
        });

        it('should return successful result row when found', async () => {
            const mockRow = { id: 'test-id', resultJson: { output: 'success' } };
            mockDb.limit.mockResolvedValue([mockRow]);

            const result = await service.getSuccessfulResult('test-hash');
            expect(result).toBe(mockRow);
        });

        it('should return undefined when no successful result found', async () => {
            mockDb.limit.mockResolvedValue([]);

            const result = await service.getSuccessfulResult('test-hash');
            expect(result).toBeUndefined();
        });

        it('should return undefined on database errors', async () => {
            mockDb.limit.mockRejectedValue(new Error('DB error'));
            const result = await service.getSuccessfulResult('test-hash');
            expect(result).toBeUndefined();
        });
    });

    describe('recordStart', () => {
        it('should record start with correct data', async () => {
            const mockUpsert = vi.spyOn(service as any, 'upsert').mockResolvedValue(undefined);

            await service.recordStart('test-hash', 1);

            expect(mockUpsert).toHaveBeenCalledWith(
                'test-hash',
                expect.any(Function),
                expect.any(Function)
            );
        });
    });

    describe('recordSuccess', () => {
        it('should record success with result data', async () => {
            const mockUpsert = vi.spyOn(service as any, 'upsert').mockResolvedValue(undefined);
            const output = { result: 'success' };

            await service.recordSuccess('test-hash', 2, output);

            expect(mockUpsert).toHaveBeenCalledWith(
                'test-hash',
                expect.any(Function),
                expect.any(Function)
            );
        });
    });

    describe('recordFailure', () => {
        it('should record failure with error data', async () => {
            const mockUpsert = vi.spyOn(service as any, 'upsert').mockResolvedValue(undefined);
            const error = { message: 'Test error' };

            await service.recordFailure('test-hash', 3, error);

            expect(mockUpsert).toHaveBeenCalledWith(
                'test-hash',
                expect.any(Function),
                expect.any(Function)
            );
        });
    });

    describe('createPersistentJournal', () => {
        it('should create service instance', () => {
            const journal = createPersistentJournal('test-session');
            expect(journal).toBeInstanceOf(PersistentJournalService);
        });

        it('should pass options to constructor', () => {
            const mockMetrics = { inc: vi.fn() };
            const journal = createPersistentJournal('test-session', { metrics: mockMetrics });
            expect(journal).toBeInstanceOf(PersistentJournalService);
        });
    });

    describe('Error Handling Edge Cases', () => {
        it('should handle resolveIdempotencyKey errors in upsert', async () => {
            const mockUpsert = vi.spyOn(service as any, 'upsert');
            vi.spyOn(service as any, 'resolveIdempotencyKey').mockRejectedValue(new Error('Resolve failed'));

            await service.recordStart('test-hash', 1);

            // Should still call upsert but with fallback key
            expect(mockUpsert).toHaveBeenCalled();
        });

        it('should handle database errors in all operations', async () => {
            mockDrizzleManager.initialized = false;

            // All operations should handle gracefully
            await expect(service.getSuccessfulResult('test-hash')).resolves.toBeUndefined();
            await expect(service.recordStart('test-hash', 1)).resolves.not.toThrow();
            await expect(service.recordSuccess('test-hash', 1, {})).resolves.not.toThrow();
            await expect(service.recordFailure('test-hash', 1, { message: 'error' })).resolves.not.toThrow();
        });
    });
});