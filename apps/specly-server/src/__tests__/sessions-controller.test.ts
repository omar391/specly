import { describe, it, expect, vi } from 'vitest';
import { SessionsController } from '../api/sessions.js';
import { DatabaseService } from '../services/database-service.js';
import { BadRequestError } from '../api/middleware.js';

// Mock the database service
const mockGlobalDb = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllSessions: vi.fn()
};

const mockDatabaseService = {
    getGlobal: vi.fn().mockReturnValue(mockGlobalDb)
} as any as DatabaseService;

describe('SessionsController', () => {
    let controller: SessionsController;

    beforeEach(() => {
        controller = new SessionsController(mockDatabaseService);
        vi.clearAllMocks();
    });

    describe('getSessions', () => {
        it('returns sessions successfully', async () => {
            const mockSessions = [
                {
                    id: 'session-1',
                    workspaceId: 'workspace-1',
                    isActive: 1,
                    lastActivity: '2023-01-01T00:00:00Z',
                    createdAt: '2023-01-01T00:00:00Z'
                }
            ];

            mockGlobalDb.getAllSessions.mockResolvedValue(mockSessions);

            const mockContext = {
                req: {
                    query: vi.fn().mockReturnValue({})
                },
                json: vi.fn().mockReturnValue('response')
            };

            const result = await controller.getSessions(mockContext as any);

            expect(mockGlobalDb.initialize).toHaveBeenCalled();
            expect(mockGlobalDb.getAllSessions).toHaveBeenCalledWith({ workspaceId: undefined });
            expect(mockContext.json).toHaveBeenCalledWith({
                data: {
                    sessions: [{
                        id: 'session-1',
                        workspace_id: 'workspace-1',
                        is_active: true,
                        last_activity: '2023-01-01T00:00:00Z',
                        created_at: '2023-01-01T00:00:00Z'
                    }]
                }
            });
            expect(result).toBe('response');
        });

        it('filters by workspace_id when provided', async () => {
            mockGlobalDb.getAllSessions.mockResolvedValue([]);

            const mockContext = {
                req: {
                    query: vi.fn().mockReturnValue({ workspace_id: 'test-workspace' })
                },
                json: vi.fn().mockReturnValue('response')
            };

            await controller.getSessions(mockContext as any);

            expect(mockGlobalDb.getAllSessions).toHaveBeenCalledWith({ workspaceId: 'test-workspace' });
        });

        it('throws BadRequestError when task_id is not a string', async () => {
            const mockContext = {
                req: {
                    query: vi.fn().mockReturnValue({ task_id: 123 })
                },
                json: vi.fn()
            };

            await expect(controller.getSessions(mockContext as any)).rejects.toThrow(BadRequestError);
            await expect(controller.getSessions(mockContext as any)).rejects.toThrow('task_id must be a string when provided');
        });

        it('throws BadRequestError when workspace_id is not a string', async () => {
            const mockContext = {
                req: {
                    query: vi.fn().mockReturnValue({ workspace_id: 456 })
                },
                json: vi.fn()
            };

            await expect(controller.getSessions(mockContext as any)).rejects.toThrow(BadRequestError);
            await expect(controller.getSessions(mockContext as any)).rejects.toThrow('workspace_id must be a string when provided');
        });

        it('handles empty sessions array', async () => {
            mockGlobalDb.getAllSessions.mockResolvedValue(null);

            const mockContext = {
                req: {
                    query: vi.fn().mockReturnValue({})
                },
                json: vi.fn().mockReturnValue('response')
            };

            await controller.getSessions(mockContext as any);

            expect(mockContext.json).toHaveBeenCalledWith({
                data: { sessions: [] }
            });
        });

        it('maps session data correctly', async () => {
            const mockSessions = [
                {
                    id: 'session-1',
                    workspaceId: 'workspace-1',
                    isActive: 0, // Should map to false
                    lastActivity: '2023-01-01T00:00:00Z',
                    createdAt: '2023-01-01T00:00:00Z'
                },
                {
                    id: 'session-2',
                    workspaceId: 'workspace-2',
                    isActive: 1, // Should map to true
                    lastActivity: '2023-01-02T00:00:00Z',
                    createdAt: '2023-01-02T00:00:00Z'
                }
            ];

            mockGlobalDb.getAllSessions.mockResolvedValue(mockSessions);

            const mockContext = {
                req: {
                    query: vi.fn().mockReturnValue({})
                },
                json: vi.fn().mockReturnValue('response')
            };

            await controller.getSessions(mockContext as any);

            expect(mockContext.json).toHaveBeenCalledWith({
                data: {
                    sessions: [
                        {
                            id: 'session-1',
                            workspace_id: 'workspace-1',
                            is_active: false,
                            last_activity: '2023-01-01T00:00:00Z',
                            created_at: '2023-01-01T00:00:00Z'
                        },
                        {
                            id: 'session-2',
                            workspace_id: 'workspace-2',
                            is_active: true,
                            last_activity: '2023-01-02T00:00:00Z',
                            created_at: '2023-01-02T00:00:00Z'
                        }
                    ]
                }
            });
        });
    });
});