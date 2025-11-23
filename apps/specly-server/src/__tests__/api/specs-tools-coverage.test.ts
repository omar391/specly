import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecsController, ToolsController } from '../../api/specs-tools.js';
import { GlobalDatabaseService } from '../../database/global-queries.js';
import { DatabaseService } from '../../services/database-service.js';
import { GraphValidationError } from '../../utils/graph-validate.js';
import { mapGraphValidationToPublicError } from '../../utils/graph-error-map.js';

// Mock dependencies
vi.mock('../../utils/security-validators.js', () => ({
    validateSpecSecurity: vi.fn(),
    validateCommandAliasUniqueness: vi.fn(),
    validateGraphSizeLimits: vi.fn(),
    validateGraphDepth: vi.fn()
}));

vi.mock('../../utils/graph-validate.js', () => ({
    validateToolGraph: vi.fn(),
    GraphValidationError: class extends Error { code: string; constructor(msg: string, code: string) { super(msg); this.code = code; } }
}));

vi.mock('../../utils/graph-error-map.js', () => ({
    mapGraphValidationToPublicError: vi.fn().mockReturnValue({ code: 'MAPPED_ERROR' })
}));

describe('SpecsTools Coverage', () => {
    let mockDbService: any;
    let mockDb: any;
    let mockContext: any;
    let specsController: SpecsController;
    let toolsController: ToolsController;

    const createMockBuilder = (result: any) => {
        const builder: any = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve(result)
        };
        return builder;
    };

    beforeEach(() => {
        vi.resetAllMocks();
        mockDb = {
            select: vi.fn(),
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
        };
        // Default select behavior: return empty array
        mockDb.select.mockReturnValue(createMockBuilder([]));

        mockDbService = {
            initialize: vi.fn(),
            getDrizzleManager: vi.fn().mockReturnValue({ getDb: () => mockDb }),
            getDb: () => mockDb
        };
        mockContext = {
            req: {
                json: vi.fn(),
                param: vi.fn()
            },
            json: vi.fn()
        };
        specsController = new SpecsController(mockDbService);
        toolsController = new ToolsController(mockDbService);
    });

    it('should resolve injected GlobalDatabaseService', async () => {
        const injected = new GlobalDatabaseService({} as any);
        mockContext.dbService = injected;
        injected.initialize = vi.fn();
        injected.getDrizzleManager = vi.fn().mockReturnValue({ getDb: () => mockDb });

        mockContext.req.json.mockResolvedValue({
            executor_type: 'e', executor_version: 'v', intent: 'i'
        });

        mockDb.select.mockReturnValue(createMockBuilder([])); // No existing spec

        await specsController.createSpec(mockContext);
        expect(injected.initialize).toHaveBeenCalled();
    });

    it('should resolve injected DatabaseService', async () => {
        const global = new GlobalDatabaseService({} as any);
        global.initialize = vi.fn();
        global.getDrizzleManager = vi.fn().mockReturnValue({ getDb: () => mockDb });

        const injected = new DatabaseService({} as any);
        vi.spyOn(injected, 'getGlobal').mockReturnValue(global);

        mockContext.dbService = injected;
        mockContext.req.json.mockResolvedValue({
            executor_type: 'e', executor_version: 'v', intent: 'i'
        });

        mockDb.select.mockReturnValue(createMockBuilder([]));

        await specsController.createSpec(mockContext);
        expect(injected.getGlobal).toHaveBeenCalled();
        expect(global.initialize).toHaveBeenCalled();
    });

    it('should resolve injected DrizzleDatabaseManager', async () => {
        const injected = { getDb: () => mockDb, initialize: vi.fn() };
        mockContext.dbService = injected;

        mockContext.req.json.mockResolvedValue({
            executor_type: 'e', executor_version: 'v', intent: 'i'
        });

        mockDb.select.mockReturnValue(createMockBuilder([]));

        await specsController.createSpec(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(expect.objectContaining({ created: true }), 201);
    });

    it('should handle createSpec missing fields', async () => {
        mockContext.req.json.mockResolvedValue({});
        await specsController.createSpec(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Missing required spec fields' }),
            400
        );
    });

    it('should handle createSpec security error', async () => {
        mockContext.req.json.mockResolvedValue({
            executor_type: 'e', executor_version: 'v', intent: 'i'
        });
        const { validateSpecSecurity } = await import('../../utils/security-validators.js');
        vi.mocked(validateSpecSecurity).mockReturnValue({ message: 'Sec Err', code: 'SEC', details: {} } as any);

        await specsController.createSpec(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Sec Err' }),
            422
        );
    });

    it('should handle createTool missing name', async () => {
        mockContext.req.json.mockResolvedValue({});
        await toolsController.createTool(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'name required' }),
            400
        );
    });

    it('should handle createTool alias conflict', async () => {
        mockContext.req.json.mockResolvedValue({ name: 'tool', command_alias: 'alias' });
        const { validateCommandAliasUniqueness } = await import('../../utils/security-validators.js');
        vi.mocked(validateCommandAliasUniqueness).mockResolvedValue({ message: 'Alias Err', code: 'ALIAS', details: {} } as any);

        await toolsController.createTool(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Alias Err' }),
            409
        );
    });

    it('should handle createTool existing tool', async () => {
        mockContext.req.json.mockResolvedValue({ name: 'tool' });
        mockDb.select.mockReturnValue(createMockBuilder(['exists']));

        await toolsController.createTool(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'tool exists' }),
            409
        );
    });

    it('should handle createToolVersion invalid body', async () => {
        mockContext.req.json.mockResolvedValue({});
        await toolsController.createToolVersion(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'ordered_specs[] and entry_spec required' }),
            400
        );
    });

    it('should handle createToolVersion tool not found', async () => {
        mockContext.req.json.mockResolvedValue({ ordered_specs: [], entry_spec: 'e' });
        mockDb.select.mockReturnValue(createMockBuilder([])); // Tool check returns empty

        await toolsController.createToolVersion(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'tool not found' }),
            404
        );
    });

    it('should handle createToolVersion missing spec', async () => {
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['missing'], entry_spec: 'e' });
        mockDb.select
            .mockReturnValueOnce(createMockBuilder(['tool'])) // Tool exists
            .mockReturnValueOnce(createMockBuilder([])); // Specs check returns empty

        await toolsController.createToolVersion(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'spec missing' }),
            422
        );
    });

    it('should handle createToolVersion graph size error', async () => {
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['s'], entry_spec: 's' });
        mockDb.select
            .mockReturnValueOnce(createMockBuilder(['tool']))
            .mockReturnValueOnce(createMockBuilder([{ hash: 's' }]));

        const { validateGraphSizeLimits } = await import('../../utils/security-validators.js');
        vi.mocked(validateGraphSizeLimits).mockReturnValue({ message: 'Size Err', code: 'SIZE', details: {} } as any);

        await toolsController.createToolVersion(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Size Err' }),
            422
        );
    });

    it('should handle createToolVersion graph depth error', async () => {
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['s'], entry_spec: 's' });
        mockDb.select
            .mockReturnValueOnce(createMockBuilder(['tool']))
            .mockReturnValueOnce(createMockBuilder([{ hash: 's' }]));

        const { validateGraphDepth } = await import('../../utils/security-validators.js');
        vi.mocked(validateGraphDepth).mockReturnValue({ message: 'Depth Err', code: 'DEPTH', details: {} } as any);

        await toolsController.createToolVersion(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Depth Err' }),
            422
        );
    });

    it('should handle createToolVersion graph validation error', async () => {
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['s'], entry_spec: 's' });
        mockDb.select
            .mockReturnValueOnce(createMockBuilder(['tool']))
            .mockReturnValueOnce(createMockBuilder([{ hash: 's' }]));

        const { validateToolGraph } = await import('../../utils/graph-validate.js');
        vi.mocked(validateToolGraph).mockImplementation(() => {
            throw new GraphValidationError('Graph Err', 'CODE' as any);
        });

        vi.mocked(mapGraphValidationToPublicError).mockReturnValue({ code: 'MAPPED_ERROR' } as any);

        await toolsController.createToolVersion(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Graph Err', code: 'MAPPED_ERROR' }),
            422
        );
    });

    it('should handle createToolVersion generic validation error', async () => {
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['s'], entry_spec: 's' });
        mockDb.select
            .mockReturnValueOnce(createMockBuilder(['tool']))
            .mockReturnValueOnce(createMockBuilder([{ hash: 's' }]));

        const { validateToolGraph } = await import('../../utils/graph-validate.js');
        vi.mocked(validateToolGraph).mockImplementation(() => {
            throw new Error('Generic Err');
        });

        await toolsController.createToolVersion(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'validation failure', detail: 'Generic Err' }),
            500
        );
    });
});
