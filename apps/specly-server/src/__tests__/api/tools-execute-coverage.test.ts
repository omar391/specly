import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolsExecuteController } from '../../api/tools-execute.js';
import { SpecEngineErrorCode } from '../../services/spec-engine.js';

describe('ToolsExecuteController Coverage', () => {
    let mockEngine: any;
    let mockPausedStore: any;
    let mockDb: any;
    let controller: ToolsExecuteController;
    let mockContext: any;

    beforeEach(() => {
        mockEngine = {
            run: vi.fn(),
            resume: vi.fn()
        };
        mockPausedStore = {
            get: vi.fn(),
            save: vi.fn(),
            delete: vi.fn()
        };
        mockDb = {
            getGlobal: vi.fn()
        };
        controller = new ToolsExecuteController(
            () => mockEngine,
            mockPausedStore,
            mockDb
        );
        mockContext = {
            req: {
                query: vi.fn(),
                json: vi.fn()
            },
            json: vi.fn()
        };
    });

    it('should reject deprecated mode query param', async () => {
        mockContext.req.query.mockReturnValue('run');
        await controller.execute(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining('deprecated') }) }),
            400
        );
    });

    it('should handle tool_version_id not found', async () => {
        mockContext.req.query.mockReturnValue(undefined);
        mockContext.req.json.mockResolvedValue({ tool_version_id: '00000000-0000-0000-0000-000000000000' });

        const mockGlobalDb = {
            getToolVersion: vi.fn().mockResolvedValue(null)
        };
        mockDb.getGlobal.mockReturnValue(mockGlobalDb);

        await controller.execute(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: { message: 'tool_version_id not found' } }),
            404
        );
    });

    it('should handle invalid manifest in tool_version_id', async () => {
        mockContext.req.query.mockReturnValue(undefined);
        mockContext.req.json.mockResolvedValue({ tool_version_id: '00000000-0000-0000-0000-000000000000' });

        const mockGlobalDb = {
            getToolVersion: vi.fn().mockResolvedValue({ graphManifest: {} }) // Invalid manifest
        };
        mockDb.getGlobal.mockReturnValue(mockGlobalDb);

        await controller.execute(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: { message: 'Stored tool version manifest invalid' } }),
            500
        );
    });

    it('should handle tool_version_id resolution error', async () => {
        mockContext.req.query.mockReturnValue(undefined);
        mockContext.req.json.mockResolvedValue({ tool_version_id: '00000000-0000-0000-0000-000000000000' });

        const mockGlobalDb = {
            getToolVersion: vi.fn().mockRejectedValue(new Error('DB Error'))
        };
        mockDb.getGlobal.mockReturnValue(mockGlobalDb);

        await controller.execute(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: { message: 'DB Error' } }),
            500
        );
    });

    it('should handle resumeToken not found', async () => {
        mockContext.req.query.mockReturnValue(undefined);
        mockContext.req.json.mockResolvedValue({
            resumeToken: 'invalid-token',
            human_input: { specHash: 'hash' }
        });

        mockPausedStore.get.mockResolvedValue(null);

        await controller.execute(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: { message: 'resumeToken not found' } }),
            404
        );
    });

    it('should handle missing graph in resume', async () => {
        mockContext.req.query.mockReturnValue(undefined);
        mockContext.req.json.mockResolvedValue({
            resumeToken: 'valid-token',
            human_input: { specHash: 'hash' }
            // No graph, no tool_version_id
        });

        mockPausedStore.get.mockResolvedValue({});

        await controller.execute(mockContext);
        // Schema validation passes because graph is optional in schema (but required logic check)
        // Wait, schema says: if isResume, human_input required.
        // Logic says: if (!graph) return error.
        // But `resolvedGraph` is undefined if no tool_version_id.

        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: { message: 'graph or tool_version_id required for resume' } }),
            400
        );
    });

    it('should handle internal error', async () => {
        mockContext.req.query.mockReturnValue(undefined);
        mockContext.req.json.mockRejectedValue(new Error('JSON Parse Error'));

        await controller.execute(mockContext);
        // safeParse catches JSON errors? No, c.req.json() throws if body invalid JSON.
        // If c.req.json() throws, it goes to catch block.
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: { message: 'JSON Parse Error' } }),
            500
        );
    });

    it('should map HTTP status codes correctly', async () => {
        mockContext.req.query.mockReturnValue(undefined);
        mockContext.req.json.mockResolvedValue({
            graph: { entry: 'a', nodes: { a: { intent: 'autonomous' } }, edges: [] }
        });

        const codes = [
            { code: SpecEngineErrorCode.GRAPH_CYCLE, status: 422 },
            { code: SpecEngineErrorCode.LEASE_ACQUIRE_FAILED, status: 409 },
            { code: SpecEngineErrorCode.RESUME_TOKEN_INVALID, status: 404 },
            { code: SpecEngineErrorCode.ROUTE_DEAD_END, status: 500 },
            { code: 'UNKNOWN' as any, status: 500 }
        ];

        for (const { code, status } of codes) {
            mockEngine.run.mockResolvedValue({ errorCode: code });
            await controller.execute(mockContext);
            expect(mockContext.json).toHaveBeenLastCalledWith(expect.anything(), status);
        }
    });

    it('should handle missing graph in run path', async () => {
        mockContext.req.query.mockReturnValue(undefined);
        mockContext.req.json.mockResolvedValue({
            // No graph, no tool_version_id, no resumeToken
        });

        await controller.execute(mockContext);
        expect(mockContext.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: {
                    message: 'Invalid request',
                    details: {
                        fieldErrors: { graph: ['graph or tool_version_id required'] },
                        formErrors: []
                    }
                }
            }),
            400
        );
    });
});
