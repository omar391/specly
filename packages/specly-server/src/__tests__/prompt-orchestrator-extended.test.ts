import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromptOrchestrator } from '../services/prompt-orchestrator.js';
import { ToolNames } from '../constants/tool-names.js';

describe('PromptOrchestrator – extended coverage', () => {
    let orchestrator: PromptOrchestrator;

    beforeEach(() => {
        // Pass a minimal fake drizzle manager (unused by orchestrator)
        orchestrator = new PromptOrchestrator({} as any);
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-02T03:04:05.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('orchestrates prompts for all known tools (happy paths)', async () => {
        const workspaceId = 'ws-123';

        const toolCases: Array<[string, Record<string, any>, string]> = [
            [ToolNames.START, { workspace_path: '/tmp' }, '# Specly Session Started'],
            [ToolNames.INIT, { project_name: 'Demo', tech_stack: 'TS', workspace_path: '/app', project_requirements: 'Reqs' }, '# Specly Project Initialization'],
            [ToolNames.ADD, { description: 'Write tests' }, '# Task Creation Workflow'],
            ['specly_create_task', {}, 'Task creation executed. Task details processed and stored.'],
            [ToolNames.STATUS, {}, '# Project Status Analysis'],
            [ToolNames.UPDATE, { target: 'task-1', updates: 'progress=50' }, '# Task Update Request'],
            [ToolNames.FOCUS, { task_id: 'task-1' }, '# Task Focus Mode'],
            [ToolNames.AUDIT, {}, '# Project Audit Workflow'],
            [ToolNames.GITHUB, { action: 'sync' }, '# GitHub Integration Workflow'],
            [ToolNames.RULE_UPDATE, { user_feedback: 'tighten rules' }, '# Workspace Rules Update'],
        ];

        for (const [tool, args, expectedStart] of toolCases) {
            const res = await orchestrator.orchestratePrompt(tool, workspaceId, args);
            expect(res.prompt_text.startsWith(expectedStart)).toBe(true);
            expect(res.session_data).toMatchObject({ current_tool: tool, workspace_id: workspaceId });
        }

        // Default case
        const custom = await orchestrator.orchestratePrompt('custom_tool', workspaceId, {});
        expect(custom.prompt_text).toBe('Execute system function: custom_tool');
        expect(custom.session_data.workspace_id).toBe(workspaceId);
    });

    it('propagates errors from prompt generation and logs them', async () => {
        const err = new Error('boom');
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        // Force generateBasicPrompt to throw (access private via any)
        vi.spyOn(orchestrator as any, 'generateBasicPrompt').mockRejectedValue(err);

        await expect(orchestrator.orchestratePrompt(ToolNames.START, 'ws-x', {})).rejects.toThrow('boom');
        expect(spy).toHaveBeenCalled();
    });

    it('replaceContextVariables fills placeholders using built context', () => {
        const text = 'Workspace {{context.workspace_id}} – Task {{context.task_id}} at {{context.timestamp}}';
        const ctx = (orchestrator as any).buildContext({ task_id: 'T-1' }, 'WS-9');
        const out = (orchestrator as any).replaceContextVariables(text, ctx);
        expect(out).toContain('Workspace WS-9');
        expect(out).toContain('Task T-1');
        expect(out).toContain('2024-01-02T03:04:05.000Z');
    });

    it('generateNextStepInstructions returns a helpful hint', async () => {
        const hint = await orchestrator.generateNextStepInstructions(ToolNames.ADD);
        expect(hint).toContain(ToolNames.ADD);
    });
});
