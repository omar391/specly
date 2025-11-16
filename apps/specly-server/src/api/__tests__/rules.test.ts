import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const mockRepo = {
    addOrReinforce: vi.fn(),
    list: vi.fn(),
};

const mockDb = {
    initialize: vi.fn(),
    getDrizzleManager: vi.fn(() => ({
        getDb: vi.fn(() => ({
            select: vi.fn(() => ({
                from: vi.fn(() => ({
                    where: vi.fn(() => Promise.resolve([]))
                }))
            }))
        }))
    })),
};

vi.mock('../../repositories/workspace-rules-repository.js', () => ({
    WorkspaceRulesRepository: vi.fn(() => mockRepo)
}));

vi.mock('../../database/global-queries.js', () => ({
    GlobalDatabaseService: class MockGlobalDatabaseService {
        initialize = mockDb.initialize;
        getDrizzleManager = mockDb.getDrizzleManager;
    }
}));

import { RulesController } from '../rules.js';
import type { GlobalDatabaseService } from '../../database/global-queries.js';
import { WorkspaceRulesRepository } from '../../repositories/workspace-rules-repository.js';
import { z } from 'zod';

describe('RulesController', () => {
    let controller: RulesController;

    beforeEach(() => {
        vi.clearAllMocks();
        controller = new RulesController(mockDb);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided globalDb', () => {
            const db = { initialize: vi.fn() };
            const ctrl = new RulesController(db as any);
            expect(ctrl).toBeDefined();
        });

        it('should initialize without globalDb', () => {
            const ctrl = new RulesController();
            expect(ctrl).toBeDefined();
        });
    });

    describe('initialize', () => {
        it('should initialize when shouldInitialize is true', async () => {
            const ctrl = new RulesController(); // No db provided, so shouldInitialize = true
            await ctrl.initialize();
            expect(mockDb.initialize).toHaveBeenCalled();
        });

        it('should not initialize when shouldInitialize is false', async () => {
            await controller.initialize(); // Has db provided, so shouldInitialize = false
            expect(mockDb.initialize).not.toHaveBeenCalled();
        });
    });

    describe('createRule', () => {
        it('should create rule successfully with created=true', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({
                    workspace_id: 'ws-1',
                    relation: 'always-do',
                    rule: 'test rule'
                }) },
                json: vi.fn(),
            };
            mockRepo.addOrReinforce.mockResolvedValue({ id: 'rule-1', created: true, confidence: 1 });

            await controller.createRule(mockCtx as any);

            expect(mockCtx.req.json).toHaveBeenCalled();
            expect(mockRepo.addOrReinforce).toHaveBeenCalledWith({
                workspaceId: 'ws-1',
                relation: 'always-do',
                rule: 'test rule',
                originalText: null,
                sourceSessionId: null
            });
            expect(mockCtx.json).toHaveBeenCalledWith({
                id: 'rule-1',
                created: true,
                confidence: 1
            }, 201);
        });

        it('should create rule successfully with created=false', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({
                    workspace_id: 'ws-1',
                    relation: 'never-do',
                    rule: 'test rule',
                    original_text: 'original',
                    source_session_id: 'session-1'
                }) },
                json: vi.fn(),
            };
            mockRepo.addOrReinforce.mockResolvedValue({ id: 'rule-1', created: false, confidence: 50 });

            await controller.createRule(mockCtx as any);

            expect(mockRepo.addOrReinforce).toHaveBeenCalledWith({
                workspaceId: 'ws-1',
                relation: 'never-do',
                rule: 'test rule',
                originalText: 'original',
                sourceSessionId: 'session-1'
            });
            expect(mockCtx.json).toHaveBeenCalledWith({
                id: 'rule-1',
                created: false,
                confidence: 50
            }, 200);
        });

        it('should return 400 for ZodError', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({}) }, // Missing required fields
                json: vi.fn(),
            };

            await controller.createRule(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid input',
                    details: expect.any(Array)
                }
            }, 400);
        });

        it('should return 500 for other errors', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({
                    workspace_id: 'ws-1',
                    relation: 'always-do',
                    rule: 'test rule'
                }) },
                json: vi.fn(),
            };
            const error = new Error('Database error');
            mockRepo.addOrReinforce.mockRejectedValue(error);

            await controller.createRule(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Database error'
                }
            }, 500);
        });

        it('should return 500 for unknown error', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({
                    workspace_id: 'ws-1',
                    relation: 'always-do',
                    rule: 'test rule'
                }) },
                json: vi.fn(),
            };
            mockRepo.addOrReinforce.mockRejectedValue('string error');

            await controller.createRule(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Unknown error'
                }
            }, 500);
        });
    });

    describe('getRules', () => {
        it('should get rules successfully with default active_only=true', async () => {
            const mockCtx = {
                req: {
                    query: vi.fn((key) => {
                        if (key === 'workspace_id') return 'ws-1';
                        if (key === 'active_only') return undefined; // default true
                        return undefined;
                    })
                },
                json: vi.fn(),
            };
            const rules = [
                { id: '1', confidence: 80, lastReinforcedAt: '2023-01-03T00:00:00Z', createdAt: '2023-01-01T00:00:00Z' },
                { id: '2', confidence: 90, lastReinforcedAt: '2023-01-02T00:00:00Z', createdAt: '2023-01-02T00:00:00Z' },
                { id: '3', confidence: 80, lastReinforcedAt: '2023-01-01T00:00:00Z', createdAt: '2023-01-03T00:00:00Z' }
            ];
            mockRepo.list.mockResolvedValue(rules);

            await controller.getRules(mockCtx as any);

            expect(mockRepo.list).toHaveBeenCalledWith('ws-1', true);
            expect(mockCtx.json).toHaveBeenCalledWith({ rules: [
                { id: '2', confidence: 90, lastReinforcedAt: '2023-01-02T00:00:00Z', createdAt: '2023-01-02T00:00:00Z' }, // highest confidence
                { id: '1', confidence: 80, lastReinforcedAt: '2023-01-03T00:00:00Z', createdAt: '2023-01-01T00:00:00Z' }, // same conf, later time
                { id: '3', confidence: 80, lastReinforcedAt: '2023-01-01T00:00:00Z', createdAt: '2023-01-03T00:00:00Z' }  // same conf, earlier time
            ] }, 200);
        });

        it('should get rules with active_only=false', async () => {
            const mockCtx = {
                req: {
                    query: vi.fn((key) => {
                        if (key === 'workspace_id') return 'ws-1';
                        if (key === 'active_only') return 'false';
                        return undefined;
                    })
                },
                json: vi.fn(),
            };
            mockRepo.list.mockResolvedValue([]);

            await controller.getRules(mockCtx as any);

            expect(mockRepo.list).toHaveBeenCalledWith('ws-1', false);
        });

        it('should get rules with active_only=true string', async () => {
            const mockCtx = {
                req: {
                    query: vi.fn((key) => {
                        if (key === 'workspace_id') return 'ws-1';
                        if (key === 'active_only') return 'true';
                        return undefined;
                    })
                },
                json: vi.fn(),
            };
            mockRepo.list.mockResolvedValue([]);

            await controller.getRules(mockCtx as any);

            expect(mockRepo.list).toHaveBeenCalledWith('ws-1', true);
        });

        it('should sort rules with null confidence', async () => {
            const mockCtx = {
                req: {
                    query: vi.fn((key) => {
                        if (key === 'workspace_id') return 'ws-1';
                        return undefined;
                    })
                },
                json: vi.fn(),
            };
            const rules = [
                { id: '1', confidence: null, lastReinforcedAt: '2023-01-02T00:00:00Z', createdAt: '2023-01-01T00:00:00Z' },
                { id: '2', confidence: 50, lastReinforcedAt: '2023-01-01T00:00:00Z', createdAt: '2023-01-02T00:00:00Z' }
            ];
            mockRepo.list.mockResolvedValue(rules);

            await controller.getRules(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ rules: [
                { id: '2', confidence: 50, lastReinforcedAt: '2023-01-01T00:00:00Z', createdAt: '2023-01-02T00:00:00Z' }, // confidence 50
                { id: '1', confidence: null, lastReinforcedAt: '2023-01-02T00:00:00Z', createdAt: '2023-01-01T00:00:00Z' }  // null confidence treated as 0
            ] }, 200);
        });

        it('should sort rules with same confidence and time', async () => {
            const mockCtx = {
                req: {
                    query: vi.fn((key) => {
                        if (key === 'workspace_id') return 'ws-1';
                        return undefined;
                    })
                },
                json: vi.fn(),
            };
            const rules = [
                { id: '1', confidence: 50, lastReinforcedAt: '2023-01-01T00:00:00Z', createdAt: '2023-01-01T00:00:00Z' },
                { id: '2', confidence: 50, lastReinforcedAt: '2023-01-01T00:00:00Z', createdAt: '2023-01-01T00:00:00Z' }
            ];
            mockRepo.list.mockResolvedValue(rules);

            await controller.getRules(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ rules: rules }, 200); // Order should be preserved when times are equal
        });

        it('should sort rules with same confidence but different times', async () => {
            const mockCtx = {
                req: {
                    query: vi.fn((key) => {
                        if (key === 'workspace_id') return 'ws-1';
                        return undefined;
                    })
                },
                json: vi.fn(),
            };
            const rules = [
                { id: '1', confidence: 50, lastReinforcedAt: '2023-01-01T00:00:00Z', createdAt: '2023-01-01T00:00:00Z' },
                { id: '2', confidence: 50, lastReinforcedAt: '2023-01-02T00:00:00Z', createdAt: '2023-01-02T00:00:00Z' }
            ];
            mockRepo.list.mockResolvedValue(rules);

            await controller.getRules(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ rules: [
                { id: '2', confidence: 50, lastReinforcedAt: '2023-01-02T00:00:00Z', createdAt: '2023-01-02T00:00:00Z' }, // later time
                { id: '1', confidence: 50, lastReinforcedAt: '2023-01-01T00:00:00Z', createdAt: '2023-01-01T00:00:00Z' }  // earlier time
            ] }, 200);
        });

        it('should return 400 for missing workspace_id', async () => {
            const mockCtx = {
                req: {
                    query: vi.fn(() => undefined)
                },
                json: vi.fn(),
            };

            await controller.getRules(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({
                error: {
                    code: 'MISSING_WORKSPACE_ID',
                    message: 'workspace_id query parameter is required'
                }
            }, 400);
        });

        it('should return 400 for ZodError on active_only', async () => {
            const mockCtx = {
                req: {
                    query: vi.fn((key) => {
                        if (key === 'workspace_id') return 'ws-1';
                        if (key === 'active_only') return 'invalid';
                        return undefined;
                    })
                },
                json: vi.fn(),
            };

            await controller.getRules(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid query parameters',
                    details: expect.any(Array)
                }
            }, 400);
        });

        it('should return 500 for other errors', async () => {
            const mockCtx = {
                req: {
                    query: vi.fn((key) => {
                        if (key === 'workspace_id') return 'ws-1';
                        return undefined;
                    })
                },
                json: vi.fn(),
            };
            const error = new Error('Database error');
            mockRepo.list.mockRejectedValue(error);

            await controller.getRules(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Database error'
                }
            }, 500);
        });

        it('should return 500 for unknown error', async () => {
            const mockCtx = {
                req: {
                    query: vi.fn((key) => {
                        if (key === 'workspace_id') return 'ws-1';
                        return undefined;
                    })
                },
                json: vi.fn(),
            };
            mockRepo.list.mockRejectedValue('string error');

            await controller.getRules(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Unknown error'
                }
            }, 500);
        });
    });
});