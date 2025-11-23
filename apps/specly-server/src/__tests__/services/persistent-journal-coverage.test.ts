import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('PersistentJournalService - Coverage', () => {
    let mockDb: any;
    let mockMgr: any;
    let mockGlobalService: any;

    beforeEach(() => {
        vi.resetModules();

        mockDb = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
        };

        mockMgr = {
            initialized: true,
            getDb: vi.fn().mockImplementation(() => { console.log('GET DB CALLED'); return mockDb; })
        };

        mockGlobalService = {
            initialize: vi.fn().mockResolvedValue(undefined),
            getDrizzleManager: vi.fn().mockImplementation(() => { console.log('GET DRIZZLE MANAGER CALLED'); return mockMgr; })
        };

        vi.doMock('../../database/global-queries.js', () => ({
            getGlobalDatabaseService: vi.fn().mockImplementation(() => { console.log('GET GLOBAL SERVICE CALLED'); return mockGlobalService; })
        }));

        vi.doMock('../../database/schema/global-schema.js', () => ({
            actionJournal: { sessionId: 'sid', specHash: 'hash', idempotencyKey: 'key', status: 'status', id: 'id' },
            specs: { hash: 'hash' }
        }));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should handle initialization failure', async () => {
        mockGlobalService.initialize.mockRejectedValue(new Error('Init failed'));

        const { PersistentJournalService } = await import('../../services/persistent-journal-service.js');
        const journal = new PersistentJournalService();

        // Trigger initialization via public method
        await journal.recordStart('hash', 1);

        // Verify initialized is false (internal state, hard to check directly without access)
        // But we can check if it tries to initialize again on next call?
        // Or just ensure it didn't throw.
    });

    it('should handle resolveIdempotencyKey uninitialized manager', async () => {
        mockMgr.initialized = false;

        const { PersistentJournalService } = await import('../../services/persistent-journal-service.js');
        const journal = new PersistentJournalService();

        // Access private method via any
        const key = await (journal as any).resolveIdempotencyKey('hash');
        expect(key).toBe('hash');
    });

    it('should handle resolveIdempotencyKey DB error', async () => {
        mockDb.select.mockImplementation(() => { throw new Error('DB Error'); });

        const { PersistentJournalService } = await import('../../services/persistent-journal-service.js');
        const journal = new PersistentJournalService();

        const key = await (journal as any).resolveIdempotencyKey('hash');
        expect(key).toBe('hash');
    });

    it('should handle resolveIdempotencyKey auto-create spec error', async () => {
        // Simulate spec not found
        mockDb.limit.mockResolvedValue([]);
        // Simulate insert error
        mockDb.values.mockRejectedValue(new Error('Insert failed'));

        const { PersistentJournalService } = await import('../../services/persistent-journal-service.js');
        const journal = new PersistentJournalService();

        const key = await (journal as any).resolveIdempotencyKey('hash');
        expect(key).toBe('hash');
    });

    it('should handle upsert uninitialized manager', async () => {
        mockMgr.initialized = false;

        const { PersistentJournalService } = await import('../../services/persistent-journal-service.js');
        const journal = new PersistentJournalService();

        await journal.recordStart('hash', 1);
        expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should handle upsert metrics error', async () => {
        mockDb.select.mockImplementation(() => { console.log('MOCK DB SELECT CALLED'); throw new Error('DB Error'); });
        const metrics = {
            inc: vi.fn().mockImplementation(() => { console.log('METRICS INC CALLED'); throw new Error('Metrics Error'); })
        };

        const { PersistentJournalService } = await import('../../services/persistent-journal-service.js');
        const journal = new PersistentJournalService('session', { metrics: metrics as any });

        // Should not throw
        await journal.recordStart('hash', 1);
        expect(metrics.inc).toHaveBeenCalled();
    });

    it('should handle getSuccessfulResult uninitialized manager', async () => {
        mockMgr.initialized = false;

        const { PersistentJournalService } = await import('../../services/persistent-journal-service.js');
        const journal = new PersistentJournalService();

        const result = await journal.getSuccessfulResult('hash');
        expect(result).toBeUndefined();
    });

    it('should handle getSuccessfulResult DB error', async () => {
        mockDb.select.mockRejectedValue(new Error('DB Error'));

        const { PersistentJournalService } = await import('../../services/persistent-journal-service.js');
        const journal = new PersistentJournalService();

        const result = await journal.getSuccessfulResult('hash');
        expect(result).toBeUndefined();
    });
});
