import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../services/prompt-orchestrator.js', () => ({
    PromptOrchestrator: vi.fn()
}));

vi.mock('../database/global-queries.js', () => ({
    GlobalDatabaseService: vi.fn()
}));

import { UpdateResourcesTool, updateResourcesToolSchema } from '../tools/update-resources.js';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';

const MockPromptOrchestrator = vi.mocked(PromptOrchestrator);
const MockGlobalDatabaseService = vi.mocked(GlobalDatabaseService);

describe('UpdateResourcesTool', () => {
    let mockDrizzleDb: DrizzleDatabaseManager;
    let tool: UpdateResourcesTool;
    let mockOrchestrator: { orchestratePrompt: ReturnType<typeof vi.fn> };
    let mockGlobalDb: { getWorkspaceByPath: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();

        mockDrizzleDb = { query: vi.fn(), execute: vi.fn() } as unknown as DrizzleDatabaseManager;

        mockOrchestrator = {
            orchestratePrompt: vi.fn()
        };

        mockGlobalDb = {
            getWorkspaceByPath: vi.fn()
        };

        MockPromptOrchestrator.mockImplementation(() => mockOrchestrator as any);
        MockGlobalDatabaseService.mockImplementation(() => mockGlobalDb as any);

        tool = new UpdateResourcesTool(mockDrizzleDb);
    });

    afterEach(() => {
        vi.useRealTimers();
        MockPromptOrchestrator.mockReset();
        MockGlobalDatabaseService.mockReset();
    });

    it('constructs orchestrator and global database services with provided manager', () => {
        expect(MockPromptOrchestrator).toHaveBeenCalledWith(mockDrizzleDb);
        expect(MockGlobalDatabaseService).toHaveBeenCalledWith(mockDrizzleDb);
        expect(tool).toBeInstanceOf(UpdateResourcesTool);
    });

    describe('execute', () => {
        it('returns orchestrated prompt when workspace exists', async () => {
            vi.useFakeTimers();
            const fixedDate = new Date('2025-01-02T03:04:05.000Z');
            vi.setSystemTime(fixedDate);

            const workspace = { id: 'ws-123', name: 'Specly Workspace' };
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(workspace);
            mockOrchestrator.orchestratePrompt.mockResolvedValue({ prompt_text: 'Generated instructions' });

            const input = {
                workspace_path: '/workspaces/test',
                resource_type: 'project.md' as const,
                content: 'Updated project overview',
                reason: 'Align with new requirements'
            };

            const result = await tool.execute(input);

            expect(mockGlobalDb.getWorkspaceByPath).toHaveBeenCalledWith('/workspaces/test');
            expect(mockOrchestrator.orchestratePrompt).toHaveBeenCalledWith(
                'specly_update_resources',
                'ws-123',
                expect.objectContaining({
                    workspace_path: '/workspaces/test',
                    resource_type: 'project.md',
                    content: 'Updated project overview',
                    reason: 'Align with new requirements',
                    workspace_name: 'Specly Workspace',
                    timestamp: fixedDate.toISOString(),
                    resource_file_path: '/workspaces/test/.specly/project.md',
                    update_instructions: expect.stringContaining('Create or update the project.md file')
                })
            );

            expect(result).toEqual({
                content: [{ type: 'text', text: 'Generated instructions' }]
            });
        });

        it('includes undefined reason field when omitted by caller', async () => {
            const workspace = { id: 'ws-optional', name: 'Optional Workspace' };
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(workspace);
            mockOrchestrator.orchestratePrompt.mockResolvedValue({ prompt_text: 'No reason provided' });

            const input = {
                workspace_path: '/workspace/no-reason',
                resource_type: 'design.md' as const,
                content: 'Design doc'
            };

            const result = await tool.execute(input);

            const [, , payload] = mockOrchestrator.orchestratePrompt.mock.calls[0];
            expect(Object.prototype.hasOwnProperty.call(payload, 'reason')).toBe(true);
            expect(payload.reason).toBeUndefined();
            expect(result.content[0].text).toBe('No reason provided');
        });

        it('returns informational error when workspace cannot be located', async () => {
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(null);

            const result = await tool.execute({
                workspace_path: '/missing/workspace',
                resource_type: 'design.md',
                content: 'Design content'
            });

            expect(mockGlobalDb.getWorkspaceByPath).toHaveBeenCalledWith('/missing/workspace');
            expect(mockOrchestrator.orchestratePrompt).not.toHaveBeenCalled();
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Workspace not found at path: /missing/workspace');
            expect(result.content[0].text).toContain('specly_init');
        });

        it('logs and returns error details when orchestration fails', async () => {
            const workspace = { id: 'ws-999', name: 'Broken Workspace' };
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(workspace);

            const orchestrationError = new Error('orchestration failure');
            mockOrchestrator.orchestratePrompt.mockRejectedValue(orchestrationError);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            const result = await tool.execute({
                workspace_path: '/broken/workspace',
                resource_type: 'project.md',
                content: 'content'
            });

            expect(consoleSpy).toHaveBeenCalledWith('Error in specly_update_resources:', orchestrationError);
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('Error updating resources: orchestration failure');
            consoleSpy.mockRestore();
        });

        it('maps unknown error types to generic messaging', async () => {
            const workspace = { id: 'ws-unknown', name: 'Unknown Error Workspace' };
            mockGlobalDb.getWorkspaceByPath.mockResolvedValue(workspace);
            mockOrchestrator.orchestratePrompt.mockRejectedValue('plain string error');
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            const result = await tool.execute({
                workspace_path: '/unknown/workspace',
                resource_type: 'design.md',
                content: 'Content'
            });

            expect(consoleSpy).toHaveBeenCalledWith('Error in specly_update_resources:', 'plain string error');
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('Error updating resources: Unknown error');
            consoleSpy.mockRestore();
        });
    });

    describe('getToolDefinition', () => {
        it('returns full schema definition for MCP', () => {
            const definition = UpdateResourcesTool.getToolDefinition();

            expect(definition.name).toBe('specly_update_resources');
            expect(definition.description).toContain('Update project documentation resources');
            expect(definition.inputSchema.type).toBe('object');
            expect(definition.inputSchema.required).toEqual([
                'workspace_path',
                'resource_type',
                'content'
            ]);
            expect(definition.inputSchema.properties.resource_type.enum).toEqual(['project.md', 'design.md']);
        });
    });

    describe('updateResourcesToolSchema', () => {
        it('validates correct payloads', () => {
            const parsed = updateResourcesToolSchema.parse({
                workspace_path: '/abs/path',
                resource_type: 'project.md',
                content: 'Content',
                reason: 'Justification'
            });

            expect(parsed).toEqual({
                workspace_path: '/abs/path',
                resource_type: 'project.md',
                content: 'Content',
                reason: 'Justification'
            });
        });

        it('rejects unsupported resource types with descriptive error', () => {
            const result = updateResourcesToolSchema.safeParse({
                workspace_path: '/abs/path',
                resource_type: 'README.md',
                content: 'Invalid'
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain("Expected 'project.md' | 'design.md'");
            }
        });
    });
});