import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecsController, ToolsController } from '../api/specs-tools.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { GraphValidationError } from '../utils/graph-validate.js';

// Mock dependencies
vi.mock('../database/global-queries.js');
vi.mock('../utils/hash.js');
vi.mock('../utils/graph-validate.js');
vi.mock('../utils/security-validators.js');

describe('SpecsController', () => {
    let dbService: GlobalDatabaseService;
    let controller: SpecsController;
    let mockContext: any;

    beforeEach(() => {
        dbService = new GlobalDatabaseService({} as any);
        controller = new SpecsController(dbService);
        mockContext = {
            req: {
                json: vi.fn()
            },
            json: vi.fn()
        };
    });

    describe('createSpec', () => {
        it('rejects spec creation with missing required fields', async () => {
            mockContext.req.json.mockResolvedValue({});

            await controller.createSpec(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Missing required spec fields', required: ['executor_type', 'executor_version', 'intent'] }, 400);
        });

        it('rejects spec creation with missing executor_type', async () => {
            mockContext.req.json.mockResolvedValue({
                executor_version: '1',
                intent: 'autonomous'
            });

            await controller.createSpec(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Missing required spec fields', required: ['executor_type', 'executor_version', 'intent'] }, 400);
        });

        it('rejects spec creation with missing executor_version', async () => {
            mockContext.req.json.mockResolvedValue({
                executor_type: 'noop',
                intent: 'autonomous'
            });

            await controller.createSpec(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Missing required spec fields', required: ['executor_type', 'executor_version', 'intent'] }, 400);
        });

        it('rejects spec creation with missing intent', async () => {
            mockContext.req.json.mockResolvedValue({
                executor_type: 'noop',
                executor_version: '1'
            });

            await controller.createSpec(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Missing required spec fields', required: ['executor_type', 'executor_version', 'intent'] }, 400);
        });

        it('rejects spec creation with security validation error', async () => {
            const { validateSpecSecurity } = await import('../utils/security-validators.js');
            (validateSpecSecurity as any).mockReturnValue({
                message: 'Security error',
                code: 'ERR_SECURITY',
                details: { field: 'executor_type' }
            });

            mockContext.req.json.mockResolvedValue({
                executor_type: 'noop',
                executor_version: '1',
                intent: 'autonomous'
            });

            await controller.createSpec(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'Security error',
                code: 'ERR_SECURITY',
                details: { field: 'executor_type' }
            }, 422);
        });

        it('returns existing spec when hash already exists', async () => {
            const { validateSpecSecurity } = await import('../utils/security-validators.js');
            const { hashSpec } = await import('../utils/hash.js');
            (validateSpecSecurity as any).mockReturnValue(null);
            (hashSpec as any).mockReturnValue({ hash: 'test-hash' });

            const mockDb = {
                initialize: vi.fn(),
                getDrizzleManager: vi.fn().mockReturnValue({
                    getDb: vi.fn().mockReturnValue({
                        select: vi.fn().mockImplementation((selection?: any) => ({
                            from: vi.fn().mockReturnValue({
                                where: vi.fn().mockReturnValue({
                                    limit: vi.fn().mockResolvedValue([{ hash: 'test-hash' }])
                                })
                            })
                        })),
                        insert: vi.fn()
                    })
                })
            };
            vi.spyOn(dbService, 'initialize').mockResolvedValue();
            vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

            mockContext.req.json.mockResolvedValue({
                executor_type: 'noop',
                executor_version: '1',
                intent: 'autonomous'
            });

            await controller.createSpec(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                hash: 'test-hash',
                created: false
            });
        });
    });
});

describe('ToolsController', () => {
    let dbService: GlobalDatabaseService;
    let controller: ToolsController;
    let mockContext: any;

    beforeEach(() => {
        dbService = new GlobalDatabaseService({} as any);
        controller = new ToolsController(dbService);
        mockContext = {
            req: {
                json: vi.fn(),
                param: vi.fn()
            },
            json: vi.fn()
        };
    });

    describe('createTool', () => {
        it('rejects tool creation with missing name', async () => {
            mockContext.req.json.mockResolvedValue({ description: 'Test tool' });

            await controller.createTool(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'name required'
            }, 400);
        });

        it('rejects tool creation with duplicate command_alias', async () => {
            const { validateCommandAliasUniqueness } = await import('../utils/security-validators.js');
            (validateCommandAliasUniqueness as any).mockResolvedValue({
                message: 'Alias conflict',
                code: 'ERR_COMMAND_ALIAS_CONFLICT',
                details: { alias: 'test-alias' }
            });

            mockContext.req.json.mockResolvedValue({
                name: 'test-tool',
                command_alias: 'test-alias'
            });

            await controller.createTool(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'Alias conflict',
                code: 'ERR_COMMAND_ALIAS_CONFLICT',
                details: { alias: 'test-alias' }
            }, 409);
        });

        it('rejects tool creation with duplicate name', async () => {
            const { validateCommandAliasUniqueness } = await import('../utils/security-validators.js');
            (validateCommandAliasUniqueness as any).mockResolvedValue(null);

            const mockDb = {
                initialize: vi.fn(),
                getDrizzleManager: vi.fn().mockReturnValue({
                    getDb: vi.fn().mockReturnValue({
                        select: vi.fn().mockReturnValue({
                            from: vi.fn().mockReturnValue({
                                where: vi.fn().mockReturnValue({
                                    limit: vi.fn().mockResolvedValue([{ name: 'existing-tool' }])
                                })
                            })
                        })
                    })
                })
            };
            vi.spyOn(dbService, 'initialize').mockResolvedValue();
            vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

            mockContext.req.json.mockResolvedValue({
                name: 'existing-tool'
            });

            await controller.createTool(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'tool exists',
                name: 'existing-tool'
            }, 409);
        });
    });

    describe('createToolVersion', () => {
        it('rejects tool version creation with missing ordered_specs', async () => {
            mockContext.req.param.mockReturnValue('test-tool');
            mockContext.req.json.mockResolvedValue({
                entry_spec: 'hash'
            });

            await controller.createToolVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'ordered_specs[] and entry_spec required'
            }, 400);
        });

        it('rejects tool version creation with missing entry_spec', async () => {
            mockContext.req.param.mockReturnValue('test-tool');
            mockContext.req.json.mockResolvedValue({
                ordered_specs: ['hash']
            });

            await controller.createToolVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'ordered_specs[] and entry_spec required'
            }, 400);
        });

        it('rejects tool version creation for non-existent tool', async () => {
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
                        })
                    })
                })
            };
            vi.spyOn(dbService, 'initialize').mockResolvedValue();
            vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

            mockContext.req.param.mockReturnValue('nonexistent-tool');
            mockContext.req.json.mockResolvedValue({
                ordered_specs: ['hash'],
                entry_spec: 'hash',
                edges: []
            });

            await controller.createToolVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'tool not found',
                tool: 'nonexistent-tool'
            }, 404);
        });

        it('rejects tool version creation with missing spec', async () => {
            const mockDb = {
                initialize: vi.fn(),
                getDrizzleManager: vi.fn().mockReturnValue({
                    getDb: vi.fn().mockReturnValue({
                        select: vi.fn().mockImplementation((columns?: any) => {
                            if (columns && typeof columns === 'object' && 'hash' in columns) {
                                // db.select({ hash: specs.hash }).from(specs) pattern
                                return {
                                    from: vi.fn().mockResolvedValue([]) // No specs exist
                                };
                            } else {
                                // db.select().from(table).where(...).limit(1) pattern
                                return {
                                    from: vi.fn().mockReturnValue({
                                        where: vi.fn().mockReturnValue({
                                            limit: vi.fn().mockResolvedValue([{ name: 'test-tool' }])
                                        })
                                    })
                                };
                            }
                        })
                    })
                })
            };
            vi.spyOn(dbService, 'initialize').mockResolvedValue();
            vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

            mockContext.req.param.mockReturnValue('test-tool');
            mockContext.req.json.mockResolvedValue({
                ordered_specs: ['missing-hash'],
                entry_spec: 'missing-hash',
                edges: []
            });

            await controller.createToolVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'spec missing',
                spec: 'missing-hash',
                code: 'GRAPH_MISSING_NODE'
            }, 422);
        });

        it('rejects tool version creation with graph size validation error', async () => {
            const { validateGraphSizeLimits } = await import('../utils/security-validators.js');
            (validateGraphSizeLimits as any).mockReturnValue({
                message: 'Graph too large',
                code: 'ERR_GRAPH_SIZE',
                details: { size: 1000 }
            });

            const mockDb = {
                initialize: vi.fn(),
                getDrizzleManager: vi.fn().mockReturnValue({
                    getDb: vi.fn().mockReturnValue({
                        select: vi.fn().mockImplementation((columns?: any) => {
                            if (columns && typeof columns === 'object' && 'hash' in columns) {
                                // db.select({ hash: specs.hash }).from(specs) pattern
                                return {
                                    from: vi.fn().mockResolvedValue([{ hash: 'existing-hash' }])
                                };
                            } else {
                                // db.select().from(table).where(...).limit(1) pattern
                                return {
                                    from: vi.fn().mockReturnValue({
                                        where: vi.fn().mockReturnValue({
                                            limit: vi.fn().mockResolvedValue([{ name: 'test-tool' }])
                                        })
                                    })
                                };
                            }
                        })
                    })
                })
            };
            vi.spyOn(dbService, 'initialize').mockResolvedValue();
            vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

            mockContext.req.param.mockReturnValue('test-tool');
            mockContext.req.json.mockResolvedValue({
                ordered_specs: ['existing-hash'],
                entry_spec: 'existing-hash',
                edges: []
            });

            await controller.createToolVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'Graph too large',
                code: 'ERR_GRAPH_SIZE',
                details: { size: 1000 }
            }, 422);
        });

        it('rejects tool version creation with graph depth validation error', async () => {
            const { validateGraphSizeLimits, validateGraphDepth } = await import('../utils/security-validators.js');
            (validateGraphSizeLimits as any).mockReturnValue(null);
            (validateGraphDepth as any).mockReturnValue({
                message: 'Graph too deep',
                code: 'ERR_GRAPH_DEPTH',
                details: { depth: 100 }
            });

            const mockDb = {
                initialize: vi.fn(),
                getDrizzleManager: vi.fn().mockReturnValue({
                    getDb: vi.fn().mockReturnValue({
                        select: vi.fn().mockImplementation((columns?: any) => {
                            if (columns && typeof columns === 'object' && 'hash' in columns) {
                                // db.select({ hash: specs.hash }).from(specs) pattern
                                return {
                                    from: vi.fn().mockResolvedValue([{ hash: 'existing-hash' }])
                                };
                            } else {
                                // db.select().from(table).where(...).limit(1) pattern
                                return {
                                    from: vi.fn().mockReturnValue({
                                        where: vi.fn().mockReturnValue({
                                            limit: vi.fn().mockResolvedValue([{ name: 'test-tool' }])
                                        })
                                    })
                                };
                            }
                        })
                    })
                })
            };
            vi.spyOn(dbService, 'initialize').mockResolvedValue();
            vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

            mockContext.req.param.mockReturnValue('test-tool');
            mockContext.req.json.mockResolvedValue({
                ordered_specs: ['existing-hash'],
                entry_spec: 'existing-hash',
                edges: []
            });

            await controller.createToolVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'Graph too deep',
                code: 'ERR_GRAPH_DEPTH',
                details: { depth: 100 }
            }, 422);
        });

        it('rejects tool version creation with graph validation error', async () => {
            const { validateGraphSizeLimits, validateGraphDepth } = await import('../utils/security-validators.js');
            const { hashToolVersion } = await import('../utils/hash.js');
            const { validateToolGraph } = await import('../utils/graph-validate.js');
            (validateGraphSizeLimits as any).mockReturnValue(null);
            (validateGraphDepth as any).mockReturnValue(null);
            (hashToolVersion as any).mockReturnValue({ hash: 'test-hash' });

            // Mock the validateToolGraph function to throw GraphValidationError
            const mockValidateToolGraph = vi.mocked(validateToolGraph);
            mockValidateToolGraph.mockImplementationOnce(() => {
                throw new GraphValidationError('ERR_CYCLE', 'Cycle detected');
            });

            const mockDb = {
                initialize: vi.fn(),
                getDrizzleManager: vi.fn().mockReturnValue({
                    getDb: vi.fn().mockReturnValue({
                        select: vi.fn().mockImplementation((columns?: any) => {
                            if (columns && typeof columns === 'object' && 'hash' in columns) {
                                // db.select({ hash: specs.hash }).from(specs) pattern
                                return {
                                    from: vi.fn().mockResolvedValue([{ hash: 'existing-hash' }])
                                };
                            } else {
                                // db.select().from(table).where(...).limit(1) pattern
                                return {
                                    from: vi.fn().mockReturnValue({
                                        where: vi.fn().mockReturnValue({
                                            limit: vi.fn().mockResolvedValue([{ name: 'test-tool' }])
                                        })
                                    })
                                };
                            }
                        })
                    })
                })
            };
            vi.spyOn(dbService, 'initialize').mockResolvedValue();
            vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

            mockContext.req.param.mockReturnValue('test-tool');
            mockContext.req.json.mockResolvedValue({
                ordered_specs: ['existing-hash'],
                entry_spec: 'existing-hash',
                edges: []
            });

            await controller.createToolVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'Cycle detected',
                code: 'GRAPH_CYCLE'
            }, 422);
        });

        it('rejects tool version creation with unexpected validation error', async () => {
            const { validateGraphSizeLimits, validateGraphDepth } = await import('../utils/security-validators.js');
            const { validateToolGraph } = await import('../utils/graph-validate.js');
            const { hashToolVersion } = await import('../utils/hash.js');
            (validateGraphSizeLimits as any).mockReturnValue(null);
            (validateGraphDepth as any).mockReturnValue(null);
            (validateToolGraph as any).mockImplementationOnce(() => {
                throw new Error('Unexpected error');
            });
            (hashToolVersion as any).mockReturnValue({ hash: 'test-hash' });

            const mockDb = {
                initialize: vi.fn(),
                getDrizzleManager: vi.fn().mockReturnValue({
                    getDb: vi.fn().mockReturnValue({
                        select: vi.fn().mockImplementation((columns?: any) => {
                            if (columns && typeof columns === 'object' && 'hash' in columns) {
                                // db.select({ hash: specs.hash }).from(specs) pattern
                                return {
                                    from: vi.fn().mockResolvedValue([{ hash: 'existing-hash' }])
                                };
                            } else {
                                // db.select().from(table).where(...).limit(1) pattern
                                return {
                                    from: vi.fn().mockReturnValue({
                                        where: vi.fn().mockReturnValue({
                                            limit: vi.fn().mockResolvedValue([{ name: 'test-tool' }])
                                        })
                                    })
                                };
                            }
                        })
                    })
                })
            };
            vi.spyOn(dbService, 'initialize').mockResolvedValue();
            vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

            mockContext.req.param.mockReturnValue('test-tool');
            mockContext.req.json.mockResolvedValue({
                ordered_specs: ['existing-hash'],
                entry_spec: 'existing-hash',
                edges: []
            });

            await controller.createToolVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                error: 'validation failure',
                detail: 'Unexpected error'
            }, 500);
        });

        it('returns existing tool version when hash already exists', async () => {
            const { validateGraphSizeLimits, validateGraphDepth } = await import('../utils/security-validators.js');
            const { validateToolGraph } = await import('../utils/graph-validate.js');
            const { hashToolVersion } = await import('../utils/hash.js');
            (validateGraphSizeLimits as any).mockReturnValue(null);
            (validateGraphDepth as any).mockReturnValue(null);
            (validateToolGraph as any).mockReturnValue(undefined);
            (hashToolVersion as any).mockReturnValue({ hash: 'existing-version-hash' });

            const mockDb = {
                initialize: vi.fn(),
                getDrizzleManager: vi.fn().mockReturnValue({
                    getDb: vi.fn().mockReturnValue({
                        select: vi.fn().mockImplementation((columns?: any) => {
                            if (columns && typeof columns === 'object' && 'hash' in columns) {
                                // db.select({ hash: specs.hash }).from(specs) pattern
                                return {
                                    from: vi.fn().mockResolvedValue([{ hash: 'existing-hash' }])
                                };
                            } else {
                                // db.select().from(table).where(...).limit(1) pattern
                                return {
                                    from: vi.fn().mockReturnValue({
                                        where: vi.fn().mockReturnValue({
                                            limit: vi.fn().mockResolvedValue([{ name: 'test-tool' }])
                                        })
                                    })
                                };
                            }
                        }),
                        insert: vi.fn().mockReturnThis(),
                        values: vi.fn().mockResolvedValue(undefined)
                    })
                })
            };
            vi.spyOn(dbService, 'initialize').mockResolvedValue();
            vi.spyOn(dbService, 'getDrizzleManager').mockReturnValue(mockDb.getDrizzleManager());

            mockContext.req.param.mockReturnValue('test-tool');
            mockContext.req.json.mockResolvedValue({
                ordered_specs: ['existing-hash'],
                entry_spec: 'existing-hash',
                edges: []
            });

            await controller.createToolVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                hash: 'existing-version-hash',
                tool: 'test-tool',
                created: false
            });
        });
    });
});