import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecsController, ToolsController } from '../api/specs-tools.js';
import { GlobalDatabaseService } from '../database/global-queries.js';

vi.mock('../utils/hash.js');
vi.mock('../utils/security-validators.js');
vi.mock('../utils/graph-validate.js');

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
