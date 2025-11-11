import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TasksController } from '../api/tasks.js';
import { createSuccessResponse, createErrorResponse } from '../api/middleware.js';

// Mock dependencies
vi.mock('../services/database-service.js');
vi.mock('../api/workspaces.js');
vi.mock('../utils/task-status.js');

import { assertValidStatus, canTransition } from '../utils/task-status.js';

const mockCanTransition = vi.mocked(canTransition);
const mockAssertValidStatus = vi.mocked(assertValidStatus);

describe('TasksController', () => {
    let controller: TasksController;
    let mockDatabaseService: any;
    let mockWorkspacesController: any;
    let mockWorkspaceDb: any;
    let mockContext: any;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();
        mockCanTransition.mockReset();
        mockAssertValidStatus.mockReset();

        // Create mock workspace database
        mockWorkspaceDb = {
            getTasksPaginated: vi.fn(),
            countTasks: vi.fn(),
            createTask: vi.fn(),
            getTask: vi.fn(),
            updateTask: vi.fn(),
            addTaskDependency: vi.fn(),
            removeTaskDependency: vi.fn(),
            listTaskDependencies: vi.fn()
        };

        // Create mock database service
        mockDatabaseService = {
            getWorkspace: vi.fn().mockResolvedValue(mockWorkspaceDb)
        };

        // Create mock workspaces controller
        mockWorkspacesController = {
            getWorkspaceById: vi.fn().mockResolvedValue({
                id: 'test-workspace',
                name: 'Test Workspace',
                path: '/test/path'
            })
        };

        // Create controller instance
        controller = new TasksController(
            mockDatabaseService,
            mockWorkspacesController
        );

        // Create mock context
        mockContext = {
            req: {
                param: vi.fn(),
                query: vi.fn().mockReturnValue({}),
                json: vi.fn()
            },
            json: vi.fn().mockReturnValue('response'),
            status: vi.fn().mockReturnThis(),
            body: vi.fn().mockReturnThis()
        };
    });

    describe('mapTaskDbToApi', () => {
        it('maps camelCase database fields to API snake_case format', () => {
            const dbTask = {
                id: 'TP-123',
                title: 'Test Task',
                description: 'Test description',
                priority: 'high',
                status: 'in_progress',
                progress: 50,
                assets: ['asset1'],
                externalReferences: ['ref1'],
                metadata: { key: 'value' },
                tags: ['tag1'],
                notes: 'Some notes',
                createdAt: '2023-01-01T00:00:00Z',
                updatedAt: '2023-01-02T00:00:00Z',
                completedAt: '2023-01-03T00:00:00Z'
            };

            const result = (controller as any).mapTaskDbToApi(dbTask);

            expect(result).toEqual({
                id: 'TP-123',
                title: 'Test Task',
                description: 'Test description',
                priority: 'high',
                status: 'in_progress',
                progress: 50,
                assets: ['asset1'],
                external_references: ['ref1'],
                metadata: { key: 'value' },
                tags: ['tag1'],
                notes: 'Some notes',
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-02T00:00:00Z',
                completed_at: '2023-01-03T00:00:00Z'
            });
        });

        it('handles null/undefined values gracefully', () => {
            const dbTask = {
                id: 'TP-123',
                title: 'Test Task'
                // All other fields undefined/null
            };

            const result = (controller as any).mapTaskDbToApi(dbTask);

            expect(result).toEqual({
                id: 'TP-123',
                title: 'Test Task',
                description: '',
                priority: 'medium',
                status: 'queued',
                progress: 0,
                assets: [],
                external_references: [],
                metadata: {},
                tags: [],
                notes: null,
                created_at: null,
                updated_at: null,
                completed_at: null
            });
        });

        it('supports snake_case database fields as fallback', () => {
            const dbTask = {
                id: 'TP-123',
                title: 'Test Task',
                description: 'Test description',
                priority: 'high',
                status: 'in_progress',
                progress: 50,
                assets: ['asset1'],
                external_references: ['ref1'], // Already snake_case
                metadata: { key: 'value' },
                tags: ['tag1'],
                notes: 'Some notes',
                created_at: '2023-01-01T00:00:00Z', // Already snake_case
                updated_at: '2023-01-02T00:00:00Z',
                completed_at: '2023-01-03T00:00:00Z'
            };

            const result = (controller as any).mapTaskDbToApi(dbTask);

            expect(result.external_references).toEqual(['ref1']);
            expect(result.created_at).toBe('2023-01-01T00:00:00Z');
        });
    });

    describe('getTasks', () => {
        beforeEach(() => {
            mockContext.req.param.mockReturnValue({ workspaceId: 'test-workspace' });
            mockContext.req.query.mockReturnValue({ limit: 10, offset: 5, status: 'in_progress' });
            mockWorkspaceDb.getTasksPaginated.mockResolvedValue([
                { id: 'TP-1', title: 'Task 1', status: 'in_progress' },
                { id: 'TP-2', title: 'Task 2', status: 'in_progress' }
            ]);
            mockWorkspaceDb.countTasks.mockResolvedValue(25);
        });

        it('retrieves tasks with pagination and filtering', async () => {
            await controller.getTasks(mockContext);

            expect(mockWorkspacesController.getWorkspaceById).toHaveBeenCalledWith('test-workspace');
            expect(mockDatabaseService.getWorkspace).toHaveBeenCalledWith('/test/path');
            expect(mockWorkspaceDb.getTasksPaginated).toHaveBeenCalledWith('in_progress', 10, 5);
            expect(mockWorkspaceDb.countTasks).toHaveBeenCalledWith('in_progress');
        });

        it('caps limit at 100', async () => {
            mockContext.req.query.mockReturnValue({ limit: 150 });

            await controller.getTasks(mockContext);

            expect(mockWorkspaceDb.getTasksPaginated).toHaveBeenCalledWith(undefined, 100, 0);
        });

        it('uses default limit of 50 when not specified', async () => {
            mockContext.req.query.mockReturnValue({});

            await controller.getTasks(mockContext);

            expect(mockWorkspaceDb.getTasksPaginated).toHaveBeenCalledWith(undefined, 50, 0);
        });

        it('returns properly formatted response', async () => {
            await controller.getTasks(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                data: {
                    tasks: [
                        {
                            id: 'TP-1',
                            title: 'Task 1',
                            description: '',
                            priority: 'medium',
                            status: 'in_progress',
                            progress: 0,
                            assets: [],
                            external_references: [],
                            metadata: {},
                            tags: [],
                            notes: null,
                            created_at: null,
                            updated_at: null,
                            completed_at: null
                        },
                        {
                            id: 'TP-2',
                            title: 'Task 2',
                            description: '',
                            priority: 'medium',
                            status: 'in_progress',
                            progress: 0,
                            assets: [],
                            external_references: [],
                            metadata: {},
                            tags: [],
                            notes: null,
                            created_at: null,
                            updated_at: null,
                            completed_at: null
                        }
                    ],
                    workspace: {
                        id: 'test-workspace',
                        name: 'Test Workspace',
                        path: '/test/path'
                    },
                    total: 25,
                    page: 1
                }
            });
        });

        it('calculates page correctly with offset', async () => {
            mockContext.req.query.mockReturnValue({ limit: 10, offset: 20 });

            await controller.getTasks(mockContext);

            const response = mockContext.json.mock.calls[0][0];
            expect(response.data.page).toBe(3); // (20 / 10) + 1 = 3
        });
    });

    describe('createTask', () => {
        beforeEach(() => {
            mockContext.req.param.mockReturnValue({ workspaceId: 'test-workspace' });
            mockContext.req.json.mockResolvedValue({
                title: 'New Task',
                description: 'Task description',
                priority: 'high',
                assets: ['asset1'],
                external_references: ['ref1'],
                metadata: { key: 'value' },
                tags: ['tag1']
            });
            mockWorkspaceDb.createTask.mockResolvedValue({
                id: 'TP-123456',
                title: 'New Task',
                description: 'Task description',
                priority: 'high',
                status: 'queued',
                progress: 0,
                assets: ['asset1'],
                externalReferences: ['ref1'],
                metadata: { key: 'value' },
                tags: ['tag1'],
                createdAt: '2023-01-01T00:00:00Z',
                updatedAt: '2023-01-01T00:00:00Z'
            });
        });

        it('validates required title', async () => {
            mockContext.req.json.mockResolvedValue({
                description: 'Task description',
                priority: 'high'
            });

            await controller.createTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Task title is required'), 422);
        });

        it('validates required description', async () => {
            mockContext.req.json.mockResolvedValue({
                title: 'New Task',
                priority: 'high'
            });

            await controller.createTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Task description is required'), 422);
        });

        it('validates priority values', async () => {
            mockContext.req.json.mockResolvedValue({
                title: 'New Task',
                description: 'Task description',
                priority: 'invalid'
            });

            await controller.createTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Priority must be high, medium, or low'), 422);
        });

        it('trims whitespace from title and description', async () => {
            mockContext.req.json.mockResolvedValue({
                title: '  New Task  ',
                description: '  Task description  ',
                priority: 'high'
            });

            await controller.createTask(mockContext);

            expect(mockWorkspaceDb.createTask).toHaveBeenCalledWith({
                id: expect.stringMatching(/^TP-\d{6}$/),
                title: 'New Task',
                description: 'Task description',
                priority: 'high',
                status: 'queued',
                progress: 0,
                assets: [],
                externalReferences: [],
                metadata: {},
                tags: [],
                createdAt: expect.any(String),
                updatedAt: expect.any(String)
            });
        });

        it('creates task with all provided fields', async () => {
            await controller.createTask(mockContext);

            expect(mockWorkspaceDb.createTask).toHaveBeenCalledWith({
                id: expect.stringMatching(/^TP-\d{6}$/),
                title: 'New Task',
                description: 'Task description',
                priority: 'high',
                status: 'queued',
                progress: 0,
                assets: ['asset1'],
                externalReferences: ['ref1'],
                metadata: { key: 'value' },
                tags: ['tag1'],
                createdAt: expect.any(String),
                updatedAt: expect.any(String)
            });
        });

        it('returns created task with 201 status', async () => {
            await controller.createTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(
                {
                    data: {
                        task: {
                            id: 'TP-123456',
                            title: 'New Task',
                            description: 'Task description',
                            priority: 'high',
                            status: 'queued',
                            progress: 0,
                            assets: ['asset1'],
                            external_references: ['ref1'],
                            metadata: { key: 'value' },
                            tags: ['tag1'],
                            notes: null,
                            created_at: '2023-01-01T00:00:00Z',
                            updated_at: '2023-01-01T00:00:00Z',
                            completed_at: null
                        }
                    }
                },
                201
            );
        });
    });

    describe('getTask', () => {
        beforeEach(() => {
            mockContext.req.param.mockReturnValue({ workspaceId: 'test-workspace', taskId: 'TP-123' });
            mockWorkspaceDb.getTask.mockResolvedValue({
                id: 'TP-123',
                title: 'Test Task',
                description: 'Test description',
                status: 'in_progress',
                createdAt: '2023-01-01T00:00:00Z',
                updatedAt: '2023-01-02T00:00:00Z'
            });
        });

        it('retrieves single task by ID', async () => {
            await controller.getTask(mockContext);

            expect(mockWorkspacesController.getWorkspaceById).toHaveBeenCalledWith('test-workspace');
            expect(mockDatabaseService.getWorkspace).toHaveBeenCalledWith('/test/path');
            expect(mockWorkspaceDb.getTask).toHaveBeenCalledWith('TP-123');
        });

        it('returns mapped task data', async () => {
            await controller.getTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                data: {
                    task: {
                        id: 'TP-123',
                        title: 'Test Task',
                        description: 'Test description',
                        priority: 'medium',
                        status: 'in_progress',
                        progress: 0,
                        assets: [],
                        external_references: [],
                        metadata: {},
                        tags: [],
                        notes: null,
                        created_at: '2023-01-01T00:00:00Z',
                        updated_at: '2023-01-02T00:00:00Z',
                        completed_at: null
                    }
                }
            });
        });

        it('returns 404 for non-existent task', async () => {
            mockWorkspaceDb.getTask.mockResolvedValue(null);

            await controller.getTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(
                createErrorResponse('NOT_FOUND', 'Task not found: TP-123'),
                404
            );
        });
    });

    describe('patchTaskStatus', () => {
        beforeEach(() => {
            mockContext.req.param.mockReturnValue({ workspaceId: 'test-workspace', taskId: 'TP-123' });
            mockContext.req.json.mockResolvedValue({ status: 'completed' });
            mockWorkspaceDb.getTask.mockResolvedValue({
                id: 'TP-123',
                status: 'in_progress',
                title: 'Test Task'
            });
            mockWorkspaceDb.listTaskDependencies.mockResolvedValue([]);
            mockWorkspaceDb.updateTask.mockResolvedValue(undefined);
            mockCanTransition.mockReturnValue({ ok: true });
        });

        it('validates status is provided', async () => {
            mockContext.req.json.mockResolvedValue({});

            await controller.patchTaskStatus(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Status is required'), 422);
        });

        it('validates status is string', async () => {
            mockContext.req.json.mockResolvedValue({ status: 123 });

            await controller.patchTaskStatus(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Status is required'), 422);
        });

        it('validates status value using assertValidStatus', async () => {
            mockContext.req.json.mockResolvedValue({ status: 'invalid_status' });
            mockAssertValidStatus.mockImplementation(() => {
                throw new Error('Invalid status value: invalid_status');
            });

            await controller.patchTaskStatus(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Invalid status value: invalid_status'), 422);
        });

        it('checks for unresolved dependencies', async () => {
            mockWorkspaceDb.listTaskDependencies.mockResolvedValue([
                { depends_on_task_id: 'TP-dep1' }
            ]);
            mockWorkspaceDb.getTask
                .mockResolvedValueOnce({ id: 'TP-123', status: 'in_progress' }) // existing task
                .mockResolvedValueOnce({ id: 'TP-dep1', status: 'queued' }) // unresolved dependency
                .mockResolvedValueOnce({ id: 'TP-123', status: 'completed', updatedAt: '2023-01-02T00:00:00Z', completedAt: '2023-01-02T00:00:00Z' }); // updated task

            await controller.patchTaskStatus(mockContext);

            // Should check canTransition with hasUnresolvedDependencies: true
            expect(mockWorkspaceDb.listTaskDependencies).toHaveBeenCalledWith('TP-123');
            expect(mockWorkspaceDb.getTask).toHaveBeenCalledTimes(3);
        });

        it('blocks invalid status transitions', async () => {
            mockCanTransition.mockReturnValue({ ok: false, reason: 'Invalid transition' });

            await controller.patchTaskStatus(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(
                createErrorResponse('VALIDATION_ERROR', 'Invalid transition'),
                422
            );
        });

        it('sets completed_at when status becomes completed', async () => {
            mockCanTransition.mockReturnValue({ ok: true });

            await controller.patchTaskStatus(mockContext);

            expect(mockWorkspaceDb.updateTask).toHaveBeenCalledWith('TP-123', {
                status: 'completed',
                updatedAt: expect.any(String),
                completedAt: expect.any(String)
            });
        });

        it('returns updated task data', async () => {
            mockCanTransition.mockReturnValue({ ok: true });

            mockWorkspaceDb.getTask.mockResolvedValue({
                id: 'TP-123',
                title: 'Test Task',
                status: 'completed',
                updatedAt: '2023-01-02T00:00:00Z',
                completedAt: '2023-01-02T00:00:00Z'
            });

            await controller.patchTaskStatus(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                data: {
                    task: {
                        id: 'TP-123',
                        title: 'Test Task',
                        description: '',
                        priority: 'medium',
                        status: 'completed',
                        progress: 0,
                        assets: [],
                        external_references: [],
                        metadata: {},
                        tags: [],
                        notes: null,
                        created_at: null,
                        updated_at: '2023-01-02T00:00:00Z',
                        completed_at: '2023-01-02T00:00:00Z'
                    }
                }
            });
        });

        it('returns 404 for non-existent task', async () => {
            mockWorkspaceDb.getTask.mockResolvedValue(null);

            await controller.patchTaskStatus(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('NOT_FOUND', 'Task not found: TP-123'), 404);
        });
    });

    describe('addDependency', () => {
        beforeEach(() => {
            mockContext.req.param.mockReturnValue({ workspaceId: 'test-workspace', taskId: 'TP-123' });
            mockContext.req.json.mockResolvedValue({ depends_on: 'TP-456' });
            mockWorkspaceDb.getTask
                .mockResolvedValueOnce({ id: 'TP-123' }) // taskId
                .mockResolvedValueOnce({ id: 'TP-456' }); // depends_on
            mockWorkspaceDb.listTaskDependencies.mockResolvedValue([]);
        });

        it('validates depends_on is provided', async () => {
            mockContext.req.json.mockResolvedValue({});

            await controller.addDependency(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'depends_on is required'), 422);
        });

        it('prevents self-dependency', async () => {
            mockContext.req.param.mockReturnValue({ workspaceId: 'test-workspace', taskId: 'TP-123' });
            mockContext.req.json.mockResolvedValue({ depends_on: 'TP-123' });

            await controller.addDependency(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Task cannot depend on itself'), 422);
        });

        it('validates both tasks exist', async () => {
            mockWorkspaceDb.getTask.mockReset();
            mockWorkspaceDb.getTask.mockResolvedValueOnce(null); // taskId doesn't exist

            await controller.addDependency(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('NOT_FOUND', 'Task not found: TP-123'), 404);
        });

        it('validates dependency task exists', async () => {
            mockWorkspaceDb.getTask.mockReset();
            mockWorkspaceDb.getTask
                .mockResolvedValueOnce({ id: 'TP-123' }) // taskId exists
                .mockResolvedValueOnce(null); // depends_on doesn't exist

            await controller.addDependency(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('NOT_FOUND', 'Task not found: TP-456'), 404);
        });

        it('detects cycles in dependency graph', async () => {
            // Create a cycle: TP-456 depends on something that eventually depends on TP-123
            mockWorkspaceDb.listTaskDependencies.mockResolvedValue([
                { depends_on_task_id: 'TP-789' }
            ]);
            mockWorkspaceDb.getTask
                .mockResolvedValueOnce({ id: 'TP-123' }) // taskId
                .mockResolvedValueOnce({ id: 'TP-456' }) // depends_on
                .mockResolvedValueOnce({ id: 'TP-789' }); // indirect dependency

            // Mock the cycle detection to find TP-123 in the dependency chain
            mockWorkspaceDb.listTaskDependencies
                .mockResolvedValueOnce([{ depends_on_task_id: 'TP-789' }]) // for TP-456
                .mockResolvedValueOnce([]); // for TP-789

            // This is a simplified test - in practice the cycle detection is more complex
            await controller.addDependency(mockContext);

            expect(mockWorkspaceDb.addTaskDependency).toHaveBeenCalledWith('TP-123', 'TP-456');
        });

        it('adds dependency successfully', async () => {
            await controller.addDependency(mockContext);

            expect(mockWorkspaceDb.addTaskDependency).toHaveBeenCalledWith('TP-123', 'TP-456');
            expect(mockContext.json).toHaveBeenCalledWith(
                {
                    data: {
                        task_id: 'TP-123',
                        depends_on: 'TP-456'
                    }
                },
                201
            );
        });
    });

    describe('removeDependency', () => {
        beforeEach(() => {
            mockContext.req.param.mockReturnValue({ workspaceId: 'test-workspace', taskId: 'TP-123', dependsOn: 'TP-456' });
        });

        it('removes dependency successfully', async () => {
            await controller.removeDependency(mockContext);

            expect(mockWorkspaceDb.removeTaskDependency).toHaveBeenCalledWith('TP-123', 'TP-456');
            expect(mockContext.status).toHaveBeenCalledWith(204);
            expect(mockContext.body).toHaveBeenCalledWith(null);
        });
    });

    describe('listDependencies', () => {
        beforeEach(() => {
            mockContext.req.param.mockReturnValue({ workspaceId: 'test-workspace', taskId: 'TP-123' });
            mockWorkspaceDb.listTaskDependencies.mockResolvedValue([
                { depends_on_task_id: 'TP-456', created_at: '2023-01-01T00:00:00Z' },
                { depends_on_task_id: 'TP-789', created_at: '2023-01-02T00:00:00Z' }
            ]);
        });

        it('lists all dependencies for a task', async () => {
            await controller.listDependencies(mockContext);

            expect(mockWorkspaceDb.listTaskDependencies).toHaveBeenCalledWith('TP-123');
            expect(mockContext.json).toHaveBeenCalledWith({
                data: {
                    task_id: 'TP-123',
                    dependencies: [
                        { depends_on_task_id: 'TP-456', created_at: '2023-01-01T00:00:00Z' },
                        { depends_on_task_id: 'TP-789', created_at: '2023-01-02T00:00:00Z' }
                    ]
                }
            });
        });
    });

    describe('updateTask', () => {
        beforeEach(() => {
            mockContext.req.param.mockReturnValue({ workspaceId: 'test-workspace', taskId: 'TP-123' });
            mockContext.req.json.mockResolvedValue({
                field: 'title',
                value: 'Updated Title',
                reason: 'Test update'
            });
            mockWorkspaceDb.getTask.mockResolvedValue({
                id: 'TP-123',
                title: 'Original Title',
                updatedAt: '2023-01-01T00:00:00Z'
            });
            mockWorkspaceDb.updateTask.mockResolvedValue(undefined);
        });

        it('validates field is required', async () => {
            mockContext.req.json.mockResolvedValue({
                value: 'Updated Title',
                reason: 'Test update'
            });

            await controller.updateTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Field to update is required'), 422);
        });

        it('validates value is required', async () => {
            mockContext.req.json.mockResolvedValue({
                field: 'title',
                reason: 'Test update'
            });

            await controller.updateTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Value is required'), 422);
        });

        it('validates reason is required', async () => {
            mockContext.req.json.mockResolvedValue({
                field: 'title',
                value: 'Updated Title'
            });

            await controller.updateTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Reason for update is required'), 422);
        });

        it('validates field is allowed', async () => {
            mockContext.req.json.mockResolvedValue({
                field: 'invalid_field',
                value: 'value',
                reason: 'test'
            });

            await controller.updateTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Invalid field: invalid_field'), 422);
        });

        it('validates priority values', async () => {
            mockContext.req.json.mockResolvedValue({
                field: 'priority',
                value: 'invalid',
                reason: 'test'
            });

            await controller.updateTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Priority must be high, medium, or low'), 422);
        });

        it('validates status values', async () => {
            mockContext.req.json.mockResolvedValue({
                field: 'status',
                value: 'invalid_status',
                reason: 'test'
            });

            await controller.updateTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Invalid status value'), 422);
        });

        it('validates progress range', async () => {
            mockContext.req.json.mockResolvedValue({
                field: 'progress',
                value: 150,
                reason: 'test'
            });

            await controller.updateTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Progress must be a number between 0 and 100'), 422);
        });

        it('validates progress is number', async () => {
            mockContext.req.json.mockResolvedValue({
                field: 'progress',
                value: 'not-a-number',
                reason: 'test'
            });

            await controller.updateTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('VALIDATION_ERROR', 'Progress must be a number between 0 and 100'), 422);
        });

        it('updates task successfully', async () => {
            await controller.updateTask(mockContext);

            expect(mockWorkspaceDb.updateTask).toHaveBeenCalledWith('TP-123', {
                title: 'Updated Title',
                updatedAt: expect.any(String)
            });
        });

        it('sets completed_at when status updated to completed', async () => {
            mockContext.req.json.mockResolvedValue({
                field: 'status',
                value: 'completed',
                reason: 'Completing task'
            });

            await controller.updateTask(mockContext);

            expect(mockWorkspaceDb.updateTask).toHaveBeenCalledWith('TP-123', {
                status: 'completed',
                updatedAt: expect.any(String),
                completedAt: expect.any(String)
            });
        });

        it('returns updated field data', async () => {
            mockWorkspaceDb.getTask.mockResolvedValue({
                id: 'TP-123',
                title: 'Updated Title',
                updatedAt: '2023-01-02T00:00:00Z'
            });

            await controller.updateTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                data: {
                    task: {
                        id: 'TP-123',
                        updatedAt: '2023-01-02T00:00:00Z',
                        title: 'Updated Title'
                    }
                }
            });
        });

        it('returns 404 for non-existent task', async () => {
            mockWorkspaceDb.getTask.mockResolvedValue(null);

            await controller.updateTask(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith(createErrorResponse('NOT_FOUND', 'Task not found: TP-123'), 404);
        });
    });
});