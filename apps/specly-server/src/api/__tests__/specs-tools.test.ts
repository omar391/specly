import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecsController, ToolsController } from '../specs-tools.js';
import { GlobalDatabaseService } from '../../database/global-queries.js';
import { DatabaseService } from '../../services/database-service.js';

// Mock dependencies
vi.mock('../../database/global-queries.js', () => ({
    GlobalDatabaseService: vi.fn().mockImplementation((dbInstance) => ({
        initialize: vi.fn(),
        getDrizzleManager: () => dbInstance || { getDb: () => ({}) },
    })),
}));
vi.mock('../../services/database-service.js');
vi.mock('../../utils/hash.js');
vi.mock('../../utils/graph-validate.js');
vi.mock('../../utils/graph-error-map.js');
vi.mock('../../utils/security-validators.js');
vi.mock('drizzle-orm');

describe('SpecsController', () => {
    let controller: SpecsController;
    let mockDbService: any;
    let mockDb: any;
    let mockMgr: any;

    beforeEach(() => {
        // Mock drizzle query builder
        const mockQuery = {
            from: vi.fn().mockImplementation((table: any) => {
                if (table?.name === 'specs') {
                    // Handle db.select({ hash: specs.hash }).from(specs) pattern
                    return [];
                }
                // Handle db.select().from(table).where(...).limit(...) pattern
                return mockQuery;
            }),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([]),
        };
        mockDb = {
            select: vi.fn().mockImplementation((selectObj?: any) => {
                if (selectObj && selectObj.hash) {
                    // Handle db.select({ hash: specs.hash }).from(specs) pattern
                    return {
                        from: vi.fn().mockResolvedValue([{ hash: 'hash1' }])
                    };
                }
                // Handle db.select().from(table).where(...).limit(...) pattern
                return mockQuery;
            }),
            insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
        };
        mockMgr = { getDb: () => mockDb };
        mockDbService = {
            initialize: vi.fn(),
            getDrizzleManager: () => mockMgr,
        };
        controller = new SpecsController(mockDbService);
    });

    it('createSpec - success creates new spec', async () => {
        const ctx: any = {
            req: {
                json: vi.fn().mockResolvedValue({
                    executor_type: 'test',
                    executor_version: '1.0',
                    intent: 'test intent',
                    side_effect: true,
                    content_template: 'template',
                    static_params: {},
                    input_schema: {},
                    output_schema: {},
                    idempotency_key_template: 'key',
                    retry_policy: {},
                    show_output: true,
                    security: {},
                    metadata: {}
                })
            },
            json: vi.fn(),
        };

        // Mock hash
        const { hashSpec } = await import('../../utils/hash.js');
        (hashSpec as any).mockReturnValue({ hash: 'testhash' });

        // Mock security validation
        const { validateSpecSecurity } = await import('../../utils/security-validators.js');
        (validateSpecSecurity as any).mockReturnValue(null);

        await controller.createSpec(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ hash: 'testhash', created: true }, 201);
    });

    it('createSpec - returns existing if hash matches', async () => {
        const ctx: any = {
            req: {
                json: vi.fn().mockResolvedValue({
                    executor_type: 'test',
                    executor_version: '1.0',
                    intent: 'test intent'
                })
            },
            json: vi.fn(),
        };

        const { hashSpec } = await import('../../utils/hash.js');
        (hashSpec as any).mockReturnValue({ hash: 'existinghash' });

        const { validateSpecSecurity } = await import('../../utils/security-validators.js');
        (validateSpecSecurity as any).mockReturnValue(null);

        // Mock existing
        mockDb.select().limit.mockResolvedValue([{ hash: 'existinghash' }]);

        await controller.createSpec(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ hash: 'existinghash', created: false });
    });

    it('createSpec - fails on missing required fields', async () => {
        const ctx: any = {
            req: { json: vi.fn().mockResolvedValue({}) },
            json: vi.fn(),
        };

        await controller.createSpec(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'Missing required spec fields', required: ['executor_type', 'executor_version', 'intent'] }, 400);
    });

    it('createSpec - uses injected GlobalDatabaseService', async () => {
        const ctx: any = {
            req: {
                json: vi.fn().mockResolvedValue({
                    executor_type: 'test',
                    executor_version: '1.0',
                    intent: 'test intent'
                })
            },
            json: vi.fn(),
        };
        (ctx as any).dbService = mockDbService; // Inject GlobalDatabaseService

        const { hashSpec } = await import('../../utils/hash.js');
        (hashSpec as any).mockReturnValue({ hash: 'injectedhash' });

        const { validateSpecSecurity } = await import('../../utils/security-validators.js');
        (validateSpecSecurity as any).mockReturnValue(null);

        await controller.createSpec(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ hash: 'injectedhash', created: true }, 201);
    });

    it('createSpec - uses injected DatabaseService', async () => {
        const ctx: any = {
            req: {
                json: vi.fn().mockResolvedValue({
                    executor_type: 'test',
                    executor_version: '1.0',
                    intent: 'test intent'
                })
            },
            json: vi.fn(),
        };
        const mockDatabaseService = { getGlobal: () => mockDbService };
        (ctx as any).dbService = mockDatabaseService; // Inject DatabaseService

        const { hashSpec } = await import('../../utils/hash.js');
        (hashSpec as any).mockReturnValue({ hash: 'dbservicehash' });

        const { validateSpecSecurity } = await import('../../utils/security-validators.js');
        (validateSpecSecurity as any).mockReturnValue(null);

        await controller.createSpec(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ hash: 'dbservicehash', created: true }, 201);
    });

    it('createSpec - fails on security validation error', async () => {
        const ctx: any = {
            req: {
                json: vi.fn().mockResolvedValue({
                    executor_type: 'test',
                    executor_version: '1.0',
                    intent: 'test intent'
                })
            },
            json: vi.fn(),
        };

        const { hashSpec } = await import('../../utils/hash.js');
        (hashSpec as any).mockReturnValue({ hash: 'securityhash' });

        const { validateSpecSecurity } = await import('../../utils/security-validators.js');
        (validateSpecSecurity as any).mockReturnValue({ message: 'security error', code: 'SEC_ERROR', details: {} });

        await controller.createSpec(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'security error', code: 'SEC_ERROR', details: {} }, 422);
    });

describe('ToolsController', () => {
    let controller: ToolsController;
    let mockDbService: any;
    let mockDb: any;
    let mockMgr: any;

    beforeEach(() => {
        // Mock drizzle query builder
        const mockQuery = {
            from: vi.fn().mockImplementation((table: any) => {
                if (table?.name === 'specs') {
                    // Handle db.select({ hash: specs.hash }).from(specs) pattern
                    return [];
                }
                // Handle db.select().from(table).where(...).limit(...) pattern
                return mockQuery;
            }),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([]),
        };
        mockDb = {
            select: vi.fn().mockImplementation((selectObj?: any) => {
                if (selectObj && selectObj.hash) {
                    // Handle db.select({ hash: specs.hash }).from(specs) pattern
                    return {
                        from: vi.fn().mockResolvedValue([{ hash: 'hash1' }])
                    };
                }
                // Handle db.select().from(table).where(...).limit(...) pattern
                return mockQuery;
            }),
            insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
        };
        mockMgr = { getDb: () => mockDb };
        mockDbService = {
            initialize: vi.fn(),
            getDrizzleManager: () => mockMgr,
        };
        controller = new ToolsController(mockDbService);
    });

    it('createTool - success creates new tool', async () => {
        const ctx: any = {
            req: { json: vi.fn().mockResolvedValue({ name: 'testtool', description: 'desc' }) },
            json: vi.fn(),
        };

        await controller.createTool(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ name: 'testtool', created: true }, 201);
    });

    it('createTool - fails on missing name', async () => {
        const ctx: any = {
            req: { json: vi.fn().mockResolvedValue({}) },
            json: vi.fn(),
        };

        await controller.createTool(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'name required' }, 400);
    });

    it('createTool - fails if tool exists', async () => {
        const ctx: any = {
            req: { json: vi.fn().mockResolvedValue({ name: 'existing' }) },
            json: vi.fn(),
        };

        // Mock existing
        mockDb.select().limit.mockResolvedValue([{ name: 'existing' }]);

        await controller.createTool(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'tool exists', name: 'existing' }, 409);
    });

    it('createTool - uses injected GlobalDatabaseService', async () => {
        const ctx: any = {
            req: { json: vi.fn().mockResolvedValue({ name: 'testtool' }) },
            json: vi.fn(),
        };
        (ctx as any).dbService = mockDbService; // Inject GlobalDatabaseService

        await controller.createTool(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ name: 'testtool', created: true }, 201);
    });

    it('createTool - success with command_alias', async () => {
        const ctx: any = {
            req: { json: vi.fn().mockResolvedValue({ name: 'testtool', command_alias: 'alias' }) },
            json: vi.fn(),
        };

        const { validateCommandAliasUniqueness } = await import('../../utils/security-validators.js');
        (validateCommandAliasUniqueness as any).mockResolvedValue(null); // No error

        await controller.createTool(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ name: 'testtool', created: true }, 201);
    });

    it('createTool - fails on command_alias validation error', async () => {
        const ctx: any = {
            req: { json: vi.fn().mockResolvedValue({ name: 'testtool', command_alias: 'duplicate' }) },
            json: vi.fn(),
        };

        const { validateCommandAliasUniqueness } = await import('../../utils/security-validators.js');
        (validateCommandAliasUniqueness as any).mockResolvedValue({ message: 'alias exists', code: 'ALIAS_DUPLICATE', details: {} });

        await controller.createTool(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'alias exists', code: 'ALIAS_DUPLICATE', details: {} }, 409);
    });

    it('createToolVersion - success with edges having conditions', async () => {
        const ctx: any = {
            req: {
                param: vi.fn().mockReturnValue('testtool'),
                json: vi.fn().mockResolvedValue({
                    ordered_specs: ['hash1'],
                    entry_spec: 'hash1',
                    edges: [{ from: 'hash1', to: 'hash1', condition_type: 'equals', condition_value: 'val', priority: 1 }]
                })
            },
            json: vi.fn(),
        };

        // Mock tool exists
        mockDb.select().limit.mockResolvedValueOnce([{ name: 'testtool' }]);
        // Mock specs exist - handled by mockImplementation

        const { hashToolVersion } = await import('../../utils/hash.js');
        (hashToolVersion as any).mockReturnValue({ hash: 'edgehash' });

        const { validateGraphSizeLimits, validateGraphDepth } = await import('../../utils/security-validators.js');
        (validateGraphSizeLimits as any).mockReturnValue(null);
        (validateGraphDepth as any).mockReturnValue(null);

        const { validateToolGraph } = await import('../../utils/graph-validate.js');
        (validateToolGraph as any).mockImplementation(() => { });

        await controller.createToolVersion(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ hash: 'edgehash', tool: 'testtool', created: true }, 201);
    });

    it('createToolVersion - fails if ordered_specs not array', async () => {
        const ctx: any = {
            req: {
                param: vi.fn().mockReturnValue('testtool'),
                json: vi.fn().mockResolvedValue({
                    ordered_specs: 'notarray',
                    entry_spec: 'hash1'
                })
            },
            json: vi.fn(),
        };

        await controller.createToolVersion(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'ordered_specs[] and entry_spec required' }, 400);
    });

    it('createToolVersion - fails if entry_spec missing', async () => {
        const ctx: any = {
            req: {
                param: vi.fn().mockReturnValue('testtool'),
                json: vi.fn().mockResolvedValue({
                    ordered_specs: ['hash1']
                })
            },
            json: vi.fn(),
        };

        await controller.createToolVersion(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'ordered_specs[] and entry_spec required' }, 400);
    });

    it('createToolVersion - fails if tool not found', async () => {
        const ctx: any = {
            req: {
                param: vi.fn().mockReturnValue('nonexistent'),
                json: vi.fn().mockResolvedValue({
                    ordered_specs: ['hash1'],
                    entry_spec: 'hash1'
                })
            },
            json: vi.fn(),
        };

        // Mock no tool
        mockDb.select().limit.mockResolvedValue([]);

        await controller.createToolVersion(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'tool not found', tool: 'nonexistent' }, 404);
    });

    it('createToolVersion - fails if multiple specs and some missing', async () => {
        const ctx: any = {
            req: {
                param: vi.fn().mockReturnValue('testtool'),
                json: vi.fn().mockResolvedValue({
                    ordered_specs: ['hash1', 'missing'],
                    entry_spec: 'hash1'
                })
            },
            json: vi.fn(),
        };

        // Mock tool exists
        mockDb.select().limit.mockResolvedValueOnce([{ name: 'testtool' }]);
        // Mock specs exist - only hash1, missing not

        await controller.createToolVersion(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'spec missing', spec: 'missing', code: 'GRAPH_MISSING_NODE' }, 422);
    });

    it('createToolVersion - fails on graph size validation', async () => {
        const ctx: any = {
            req: {
                param: vi.fn().mockReturnValue('testtool'),
                json: vi.fn().mockResolvedValue({
                    ordered_specs: ['hash1'],
                    entry_spec: 'hash1',
                    edges: []
                })
            },
            json: vi.fn(),
        };

        // Mock tool exists
        mockDb.select().limit.mockResolvedValueOnce([{ name: 'testtool' }]);
        // Mock specs exist - handled by mockImplementation

        const { validateGraphSizeLimits } = await import('../../utils/security-validators.js');
        (validateGraphSizeLimits as any).mockReturnValue({ message: 'too big', code: 'SIZE', details: {} });

        await controller.createToolVersion(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'too big', code: 'SIZE', details: {} }, 422);
    });

    it('createToolVersion - fails on graph depth validation', async () => {
        const ctx: any = {
            req: {
                param: vi.fn().mockReturnValue('testtool'),
                json: vi.fn().mockResolvedValue({
                    ordered_specs: ['hash1'],
                    entry_spec: 'hash1',
                    edges: []
                })
            },
            json: vi.fn(),
        };

        // Mock tool exists
        mockDb.select().limit.mockResolvedValueOnce([{ name: 'testtool' }]);
        // Mock specs exist - handled by mockImplementation

        const { validateGraphSizeLimits, validateGraphDepth } = await import('../../utils/security-validators.js');
        (validateGraphSizeLimits as any).mockReturnValue(null);
        (validateGraphDepth as any).mockReturnValue({ message: 'too deep', code: 'DEPTH', details: {} });

        await controller.createToolVersion(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'too deep', code: 'DEPTH', details: {} }, 422);
    });

    it('createToolVersion - fails on non-GraphValidationError in graph validation', async () => {
        const ctx: any = {
            req: {
                param: vi.fn().mockReturnValue('testtool'),
                json: vi.fn().mockResolvedValue({
                    ordered_specs: ['hash1'],
                    entry_spec: 'hash1',
                    edges: []
                })
            },
            json: vi.fn(),
        };

        // Mock tool exists
        mockDb.select().limit.mockResolvedValueOnce([{ name: 'testtool' }]);
        // Mock specs exist - handled by mockImplementation

        const { validateGraphSizeLimits, validateGraphDepth } = await import('../../utils/security-validators.js');
        (validateGraphSizeLimits as any).mockReturnValue(null);
        (validateGraphDepth as any).mockReturnValue(null);

        const { validateToolGraph } = await import('../../utils/graph-validate.js');
        (validateToolGraph as any).mockImplementation(() => {
            throw new Error('unexpected error');
        });

        await controller.createToolVersion(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'validation failure', detail: 'unexpected error' }, 500);
    });

    it('createToolVersion - fails on GraphValidationError in graph validation', async () => {
        const ctx: any = {
            req: {
                param: vi.fn().mockReturnValue('testtool'),
                json: vi.fn().mockResolvedValue({
                    ordered_specs: ['hash1'],
                    entry_spec: 'hash1',
                    edges: []
                })
            },
            json: vi.fn(),
        };

        // Mock tool exists
        mockDb.select().limit.mockResolvedValueOnce([{ name: 'testtool' }]);
        // Mock specs exist - handled by mockImplementation

        const { validateGraphSizeLimits, validateGraphDepth } = await import('../../utils/security-validators.js');
        (validateGraphSizeLimits as any).mockReturnValue(null);
        (validateGraphDepth as any).mockReturnValue(null);

        const { GraphValidationError, validateToolGraph } = await import('../../utils/graph-validate.js');
        const { mapGraphValidationToPublicError } = await import('../../utils/graph-error-map.js');
        const mockMappedError = { code: 'GRAPH_CYCLE', message: 'graph error' };
        (validateToolGraph as any).mockImplementation(() => {
            const error = new GraphValidationError('ERR_CYCLE', 'graph error');
            error.message = 'graph error'; // Ensure message is set
            throw error;
        });
        (mapGraphValidationToPublicError as any).mockReturnValue(mockMappedError);

        await controller.createToolVersion(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ error: 'graph error', code: 'GRAPH_CYCLE' }, 422);
    });

    it('createToolVersion - returns existing if hash matches', async () => {
        const ctx: any = {
            req: {
                param: vi.fn().mockReturnValue('testtool'),
                json: vi.fn().mockResolvedValue({
                    ordered_specs: ['hash1'],
                    entry_spec: 'hash1',
                    edges: []
                })
            },
            json: vi.fn(),
        };

        // Mock tool exists
        mockDb.select().limit.mockResolvedValueOnce([{ name: 'testtool' }]);
        // Mock specs exist - handled by mockImplementation

        const { hashToolVersion } = await import('../../utils/hash.js');
        (hashToolVersion as any).mockReturnValue({ hash: 'existingversion' });

        const { validateGraphSizeLimits, validateGraphDepth } = await import('../../utils/security-validators.js');
        (validateGraphSizeLimits as any).mockReturnValue(null);
        (validateGraphDepth as any).mockReturnValue(null);

        const { validateToolGraph } = await import('../../utils/graph-validate.js');
        (validateToolGraph as any).mockImplementation(() => { });

        // Mock existing version
        mockDb.select().limit.mockResolvedValueOnce([{ hash: 'existingversion' }]);

        await controller.createToolVersion(ctx);

        expect(ctx.json).toHaveBeenCalledWith({ hash: 'existingversion', tool: 'testtool', created: false });
    });
});


});
