import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('TasksController - Final Coverage', () => {
    let mockDbService: any;
    let mockWorkspacesController: any;
    let mockWorkspaceDb: any;

    beforeEach(() => {
        vi.resetModules();

        mockWorkspaceDb = {
            getTask: vi.fn(),
            listTaskDependencies: vi.fn(),
            addTaskDependency: vi.fn(),
            updateTask: vi.fn(),
        };

        mockDbService = {
            getWorkspace: vi.fn().mockResolvedValue(mockWorkspaceDb),
        };

        mockWorkspacesController = {
            getWorkspaceById: vi.fn().mockResolvedValue({ id: 'ws1', path: 'path/to/ws' }),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // Line 238: if (seen.has(cur)) continue;
    it('should skip already seen nodes during cycle detection', async () => {
        // Setup a graph where we visit a node multiple times but it's not the target (no cycle to target)
        // Target: taskA. Depends on: taskB.
        // taskB depends on taskC and taskD.
        // taskC depends on taskE.
        // taskD depends on taskE.
        // When processing taskB -> taskC -> taskE, we add E to seen.
        // When processing taskB -> taskD -> taskE, we should hit "seen.has(E)" and continue.

        const { TasksController } = await import('../../api/tasks.js');
        const tasksController = new TasksController(mockDbService, mockWorkspacesController);

        mockWorkspaceDb.getTask.mockResolvedValue({ id: 'exists' });

        mockWorkspaceDb.listTaskDependencies.mockImplementation(async (taskId: string) => {
            if (taskId === 'taskB') return [{ depends_on_task_id: 'taskC' }, { depends_on_task_id: 'taskD' }];
            if (taskId === 'taskC') return [{ depends_on_task_id: 'taskE' }];
            if (taskId === 'taskD') return [{ depends_on_task_id: 'taskE' }];
            return [];
        });

        const ctx: any = {
            req: {
                param: () => ({ workspaceId: 'ws1', taskId: 'taskA' }),
                json: async () => ({ depends_on: 'taskB' }),
            },
            json: vi.fn((data, status) => ({ data, status })),
        };

        const result = await tasksController.addDependency(ctx);

        expect(result.status).toBe(201);
        // We can't easily assert that "continue" was hit, but if the code didn't crash and logic is correct, it passes.
        // To be sure, we can verify that listTaskDependencies was called for taskE only once if we were strictly traversing,
        // but here it might be called once because of the check.
        // Actually, if we hit 'continue', we skip adding neighbors of E to stack again.
        // If we didn't have the check, we would process E twice.
    });

    // Branch 52 at line 343: if (updateData.value === 'completed')
    it('should set completedAt when updating status to completed', async () => {
        const { TasksController } = await import('../../api/tasks.js');
        const tasksController = new TasksController(mockDbService, mockWorkspacesController);

        mockWorkspaceDb.getTask.mockResolvedValue({ id: 'task1', status: 'in_progress' });

        const ctx: any = {
            req: {
                param: () => ({ workspaceId: 'ws1', taskId: 'task1' }),
                json: async () => ({
                    field: 'status',
                    value: 'completed',
                    reason: 'done'
                }),
            },
            json: vi.fn((data) => ({ data })),
        };

        await tasksController.updateTask(ctx);

        expect(mockWorkspaceDb.updateTask).toHaveBeenCalledWith(
            'task1',
            expect.objectContaining({
                status: 'completed',
                completedAt: expect.any(String),
            })
        );
    });

    // Branch 22 (line 176): e?.message || 'Invalid status value'
    it('should use default error message if validation fails without message', async () => {
        // We need to mock assertValidStatus from utils/task-status.js
        vi.doMock('../../utils/task-status.js', () => ({
            assertValidStatus: () => { throw {}; }, // Throw object with no message
            canTransition: () => ({ ok: true }),
        }));

        // Re-import controller to pick up mock
        const { TasksController } = await import('../../api/tasks.js');
        const tasksController = new TasksController(mockDbService, mockWorkspacesController);

        const ctx: any = {
            req: {
                param: () => ({ workspaceId: 'ws1', taskId: 'task1' }),
                json: async () => ({ status: 'invalid' }),
            },
            json: vi.fn((data, status) => ({ data, status })),
        };

        const result = await tasksController.patchTaskStatus(ctx);
        expect((result as any).data.error.message).toBe('Invalid status value');
    });

    // Branch 24 (line 184): (existingTask.status as string) ?? 'queued'
    it('should default to queued if existing task has no status', async () => {
        // Mock canTransition to verify it received 'queued'
        const canTransitionMock = vi.fn().mockReturnValue({ ok: true });
        vi.doMock('../../utils/task-status.js', () => ({
            assertValidStatus: () => { },
            canTransition: canTransitionMock,
        }));

        const { TasksController } = await import('../../api/tasks.js');
        const tasksController = new TasksController(mockDbService, mockWorkspacesController);

        mockWorkspaceDb.getTask.mockResolvedValue({ id: 'task1', status: null }); // No status
        mockWorkspaceDb.listTaskDependencies.mockResolvedValue([]);

        const ctx: any = {
            req: {
                param: () => ({ workspaceId: 'ws1', taskId: 'task1' }),
                json: async () => ({ status: 'in_progress' }),
            },
            json: vi.fn((data, status) => ({ data, status })),
        };

        await tasksController.patchTaskStatus(ctx);
        expect(canTransitionMock).toHaveBeenCalledWith('queued', 'in_progress', expect.anything());
    });

    // Branch 30 (line 198): check.reason || ...
    it('should use default error message if transition check fails without reason', async () => {
        mockWorkspaceDb.getTask.mockResolvedValue({ id: 'task1', status: 'queued' });
        mockWorkspaceDb.listTaskDependencies.mockResolvedValue([]);

        vi.doMock('../../utils/task-status.js', () => ({
            assertValidStatus: () => { },
            canTransition: () => ({ ok: false }), // No reason
        }));

        const { TasksController } = await import('../../api/tasks.js');
        const tasksController = new TasksController(mockDbService, mockWorkspacesController);

        const ctx: any = {
            req: {
                param: () => ({ workspaceId: 'ws1', taskId: 'task1' }),
                json: async () => ({ status: 'completed' }),
            },
            json: vi.fn((data, status) => ({ data, status })),
        };

        const result = await tasksController.patchTaskStatus(ctx);
        expect((result as any).data.error.message).toContain('Invalid status transition');
    });
});
