import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecsController, ToolsController } from '../api/specs-tools.js';
import { GlobalDatabaseService } from '../database/global-queries.js';

vi.mock('../utils/hash.js');
vi.mock('../utils/security-validators.js');
vi.mock('../utils/graph-validate.js');
vi.mock('../utils/graph-error-map.js');

describe('Specs & Tools Controllers - success paths', () => {
    let dbService: GlobalDatabaseService;
    let specsController: SpecsController;
    let toolsController: ToolsController;
    let mockContext: any;

    beforeEach(() => {
        dbService = new GlobalDatabaseService({} as any);
        specsController = new SpecsController(dbService);
        toolsController = new ToolsController(dbService);
        mockContext = {
            req: {
                json: vi.fn(),
                param: vi.fn()
            },
            json: vi.fn()
        };
    });

    it('creates a new spec when none exists', async () => {
        const { validateSpecSecurity } = await import('../utils/security-validators.js');
        const { hashSpec } = await import('../utils/hash.js');
        (validateSpecSecurity as any).mockReturnValue(null);
        (hashSpec as any).mockReturnValue({ hash: 'new-hash' });

        const mockDb = {
            initialize: vi.fn(),
            getDrizzleManager: vi.fn().mockReturnValue({
                getDb: vi.fn().mockReturnValue({
                    select: vi.fn().mockImplementation((sel?: any) => ({
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockReturnValue({
                                limit: vi.fn().mockResolvedValue([])
                            })
                        })
                    })),
                    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
                })
            })
        };

        vi.spyOn(dbService, 'initialize').mockResolvedValue();
        vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

        mockContext.req.json.mockResolvedValue({
            executor_type: 'noop',
            executor_version: '1',
            intent: 'do-something'
        });

        await specsController.createSpec(mockContext);

        expect(mockContext.json).toHaveBeenCalledWith({ hash: 'new-hash', created: true }, 201);
    });

    it('creates a new tool when none exists', async () => {
        const { validateCommandAliasUniqueness } = await import('../utils/security-validators.js');
        (validateCommandAliasUniqueness as any).mockResolvedValue(null);

        const mockDb = {
            initialize: vi.fn(),
            getDrizzleManager: vi.fn().mockReturnValue({
                getDb: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockReturnValue({
                                limit: vi.fn().mockResolvedValue([])
                            })
                        })
                    }),
                    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
                })
            })
        };

        vi.spyOn(dbService, 'initialize').mockResolvedValue();
        vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

        mockContext.req.json.mockResolvedValue({ name: 'brand-new-tool', description: 'desc' });

        await toolsController.createTool(mockContext);

        expect(mockContext.json).toHaveBeenCalledWith({ name: 'brand-new-tool', created: true }, 201);
    });

    it('creates a new tool version when graph is valid', async () => {
        const { validateGraphSizeLimits, validateGraphDepth } = await import('../utils/security-validators.js');
        const { validateToolGraph } = await import('../utils/graph-validate.js');
        const { hashToolVersion } = await import('../utils/hash.js');
        const { specs, tools, toolVersions } = await import('../database/schema/global-schema.js');

        (validateGraphSizeLimits as any).mockReturnValue(null);
        (validateGraphDepth as any).mockReturnValue(null);
        (validateToolGraph as any).mockReturnValue(undefined);
        (hashToolVersion as any).mockReturnValue({ hash: 'tv-hash' });

        // Mock DB: tool exists, specs exist, toolVersions does not
        const mockDb = {
            initialize: vi.fn(),
            getDrizzleManager: vi.fn().mockReturnValue({
                getDb: vi.fn().mockReturnValue({
                    select: vi.fn().mockImplementation((columns?: any) => {
                        // specs select returns rows
                        if (columns && typeof columns === 'object' && 'hash' in columns) {
                            return { from: vi.fn().mockResolvedValue([{ hash: 's1' }]) };
                        }
                        // other selects return a `from` that inspects the table
                        return {
                            from: vi.fn().mockImplementation((table: any) => {
                                if (table === tools) {
                                    return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ name: 'my-tool' }]) }) };
                                }
                                if (table === toolVersions) {
                                    return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
                                }
                                return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
                            })
                        };
                    }),
                    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
                })
            })
        };

        vi.spyOn(dbService, 'initialize').mockResolvedValue();
        vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

        mockContext.req.param.mockReturnValue('my-tool');
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['s1'], entry_spec: 's1', edges: [] });

        await toolsController.createToolVersion(mockContext);

        expect(mockContext.json).toHaveBeenCalledWith({ hash: 'tv-hash', tool: 'my-tool', created: true }, 201);
    });
});

describe('Specs & Tools Controllers - error paths', () => {
    let dbService: GlobalDatabaseService;
    let specsController: SpecsController;
    let toolsController: ToolsController;
    let mockContext: any;

    beforeEach(() => {
        dbService = new GlobalDatabaseService({} as any);
        specsController = new SpecsController(dbService);
        toolsController = new ToolsController(dbService);
        mockContext = {
            req: {
                json: vi.fn(),
                param: vi.fn(),
            },
            json: vi.fn()
        };
        vi.spyOn(dbService, 'initialize').mockResolvedValue();
    });

    it('createSpec returns 400 when required fields missing', async () => {
        mockContext.req.json.mockResolvedValue({});
        await specsController.createSpec(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing required spec fields' }), 400);
    });

    it('createSpec returns 422 when security validation fails', async () => {
        const { validateSpecSecurity } = await import('../utils/security-validators.js');
        (validateSpecSecurity as any).mockReturnValue({ message: 'not allowed', code: 'SEC_FAIL', details: { foo: 'bar' } });
        mockContext.req.json.mockResolvedValue({ executor_type: 'noop', executor_version: '1', intent: 'i' });
        await specsController.createSpec(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith({ error: 'not allowed', code: 'SEC_FAIL', details: { foo: 'bar' } }, 422);
    });

    it('createSpec returns created:false when spec already exists', async () => {
        const { hashSpec } = await import('../utils/hash.js');
        const { validateSpecSecurity } = await import('../utils/security-validators.js');
        (validateSpecSecurity as any).mockReturnValue(null);
        (hashSpec as any).mockReturnValue({ hash: 'exists-hash' });

        const mockDb = {
            getDb: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ hash: 'exists-hash' }]) }) }) }),
                insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
            })
        } as any;

        vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue({ getDb: () => mockDb.getDb() } as any);
        mockContext.req.json.mockResolvedValue({ executor_type: 'noop', executor_version: '1', intent: 'i' });

        await specsController.createSpec(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith({ hash: 'exists-hash', created: false });
    });

    it('createTool returns 400 when name missing', async () => {
        mockContext.req.json.mockResolvedValue({});
        await toolsController.createTool(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith({ error: 'name required' }, 400);
    });

    it('createTool returns 409 when command_alias not unique', async () => {
        const { validateCommandAliasUniqueness } = await import('../utils/security-validators.js');
        (validateCommandAliasUniqueness as any).mockResolvedValue({ message: 'alias in use', code: 'ALIAS', details: {} });
        mockContext.req.json.mockResolvedValue({ name: 't', command_alias: 'a' });
        await toolsController.createTool(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith({ error: 'alias in use', code: 'ALIAS', details: {} }, 409);
    });

    it('createTool returns 409 when tool already exists', async () => {
        const mockDb = {
            getDb: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ name: 't' }]) }) }) }),
                insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
            })
        } as any;
        vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue({ getDb: () => mockDb.getDb() } as any);
        mockContext.req.json.mockResolvedValue({ name: 't' });
        await toolsController.createTool(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith({ error: 'tool exists', name: 't' }, 409);
    });

    it('createToolVersion returns 400 when ordered_specs or entry_spec missing', async () => {
        mockContext.req.param.mockReturnValue('my-tool');
        mockContext.req.json.mockResolvedValue({ ordered_specs: [], entry_spec: null });
        await toolsController.createToolVersion(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith({ error: 'ordered_specs[] and entry_spec required' }, 400);
    });

    it('createToolVersion returns 404 when tool not found', async () => {
        // Mock DB: no tool
        const { specs, tools, toolVersions } = await import('../database/schema/global-schema.js');
        const mockDb = {
            getDb: vi.fn().mockReturnValue({
                select: vi.fn().mockImplementation((cols?: any) => ({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) })),
                insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
            })
        } as any;
        vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue({ getDb: () => mockDb.getDb() } as any);
        mockContext.req.param.mockReturnValue('nope');
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['s'], entry_spec: 's' });
        await toolsController.createToolVersion(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith({ error: 'tool not found', tool: 'nope' }, 404);
    });

    it('createToolVersion returns 422 when a referenced spec is missing', async () => {
        const { specs, tools, toolVersions } = await import('../database/schema/global-schema.js');
        const mockDb = {
            getDb: vi.fn().mockReturnValue({
                // Tool exists
                select: vi.fn().mockImplementation((cols?: any) => {
                    if (cols && typeof cols === 'object' && 'hash' in cols) {
                        // spec rows empty
                        return { from: vi.fn().mockResolvedValue([]) };
                    }
                    return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ name: 'my-tool' }]) }) }) };
                }),
                insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
            })
        } as any;
        vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue({ getDb: () => mockDb.getDb() } as any);
        mockContext.req.param.mockReturnValue('my-tool');
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['missing'], entry_spec: 'missing', edges: [] });
        await toolsController.createToolVersion(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith({ error: 'spec missing', spec: 'missing', code: 'GRAPH_MISSING_NODE' }, 422);
    });

    it('createToolVersion maps GraphValidationError to public error code', async () => {
        const { specs, tools, toolVersions } = await import('../database/schema/global-schema.js');
        const { GraphValidationError } = await import('../utils/graph-validate.js');
        const { mapGraphValidationToPublicError } = await import('../utils/graph-error-map.js');
        (mapGraphValidationToPublicError as any).mockReturnValue({ code: 'CYCLE' });

        const mockDb = {
            getDb: vi.fn().mockReturnValue({
                select: vi.fn().mockImplementation((cols?: any) => {
                    if (cols && typeof cols === 'object' && 'hash' in cols) {
                        return { from: vi.fn().mockResolvedValue([{ hash: 's1' }]) };
                    }
                    return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ name: 'my-tool' }]) }) }) };
                }),
                insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
            })
        } as any;
        vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue({ getDb: () => mockDb.getDb() } as any);

        // cause validateToolGraph to throw GraphValidationError
        const gv = await import('../utils/graph-validate.js');
        (gv.validateToolGraph as any).mockImplementation(() => { throw new (gv.GraphValidationError)('ERR_CYCLE', 'cycle'); });

        mockContext.req.param.mockReturnValue('my-tool');
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['s1'], entry_spec: 's1', edges: [] });

        await toolsController.createToolVersion(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CYCLE' }), 422);
    });

    it('createToolVersion returns 500 when validator throws non-GraphValidationError', async () => {
        const { specs, tools, toolVersions } = await import('../database/schema/global-schema.js');
        const mockDb = {
            getDb: vi.fn().mockReturnValue({
                select: vi.fn().mockImplementation((cols?: any) => {
                    if (cols && typeof cols === 'object' && 'hash' in cols) {
                        return { from: vi.fn().mockResolvedValue([{ hash: 's1' }]) };
                    }
                    return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ name: 'my-tool' }]) }) }) };
                }),
                insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
            })
        } as any;
        vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue({ getDb: () => mockDb.getDb() } as any);

        const gv = await import('../utils/graph-validate.js');
        (gv.validateToolGraph as any).mockImplementation(() => { throw new Error('boom'); });

        mockContext.req.param.mockReturnValue('my-tool');
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['s1'], entry_spec: 's1', edges: [] });

        await toolsController.createToolVersion(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'validation failure' }), 500);
    });

    it('createToolVersion returns created:false when version already exists', async () => {
        const { specs, tools, toolVersions } = await import('../database/schema/global-schema.js');
        const { hashToolVersion } = await import('../utils/hash.js');
        (hashToolVersion as any).mockReturnValue({ hash: 'tv-exists' });

        // Ensure validators are reset so earlier throwing mocks don't leak into this test
        const sv = await import('../utils/security-validators.js');
        (sv.validateGraphSizeLimits as any).mockReturnValue(null);
        (sv.validateGraphDepth as any).mockReturnValue(null);
        const gv = await import('../utils/graph-validate.js');
        (gv.validateToolGraph as any).mockReturnValue(undefined);

        const mockDb = {
            getDb: vi.fn().mockReturnValue({
                select: vi.fn().mockImplementation((cols?: any) => {
                    if (cols && typeof cols === 'object' && 'hash' in cols) {
                        return { from: vi.fn().mockResolvedValue([{ hash: 's1' }]) };
                    }
                    return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ name: 'my-tool' }]) }) }) };
                }),
                insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
            })
        } as any;
        vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue({ getDb: () => mockDb.getDb() } as any);

        // existing toolVersion found
        // Spy select to behave differently when selecting by columns (specs) vs default selects
        vi.spyOn(mockDb.getDb(), 'select').mockImplementation((cols?: any) => {
            if (cols && typeof cols === 'object' && 'hash' in cols) {
                return { from: vi.fn().mockResolvedValue([{ hash: 's1' }]) };
            }
            return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ hash: 'tv-exists' }]) }) }) };
        }) as any;

        mockContext.req.param.mockReturnValue('my-tool');
        mockContext.req.json.mockResolvedValue({ ordered_specs: ['s1'], entry_spec: 's1', edges: [] });

        await toolsController.createToolVersion(mockContext as any);
        expect(mockContext.json).toHaveBeenCalledWith({ hash: 'tv-exists', tool: 'my-tool', created: false });
    });
});
