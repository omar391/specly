import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { AddToolNew } from '../tools/add.js';
import { ToolNames } from '../constants/tool-names.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';

/**
 * Tests for AddToolNew
 *
 * Concrete-first: real in-memory GLOBAL DB and real file-backed workspace DB
 * Only scoped spies for error-path coverage.
 */
describe('AddToolNew', () => {
    let globalDb: DrizzleDatabaseManager;
    let globalService: GlobalDatabaseService;
    let workspacePath: string;
    let addTool: AddToolNew;

    beforeEach(async () => {
        // Fresh in-memory GLOBAL DB
        globalDb = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        await globalDb.initialize();
        globalService = new GlobalDatabaseService(globalDb);

        // Fresh temp workspace directory
        workspacePath = mkdtempSync(join(tmpdir(), 'specly-add-tool-'));

        // Seed workspace into GLOBAL DB for BaseTool.validateWorkspace
        await globalService.createWorkspace({
            id: 'ws-1',
            path: workspacePath,
            name: 'add-tool-ws',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            taskCount: 0,
            activeTask: null
        } as any);

        addTool = new AddToolNew(globalDb);
    });

    afterEach(() => {
        try { rmSync(workspacePath, { recursive: true, force: true }); } catch { }
        vi.restoreAllMocks();
    });

    describe('constructor and definitions', () => {
        it('creates instance with correct config', () => {
            expect(addTool).toBeDefined();
            expect((addTool as any).toolConfig.name).toBe(ToolNames.ADD);
            const cfg = (addTool as any).toolConfig;
            expect(cfg.requiredFields).toEqual(['task_description', 'workspace_path']);
        });

        it('getToolDefinition static contains required schema', () => {
            const def = AddToolNew.getToolDefinition();
            expect(def.name).toBe(ToolNames.ADD);
            expect(def.inputSchema.required).toEqual(['task_description', 'workspace_path']);
            const props = def.inputSchema.properties;
            expect(props.task_description).toBeDefined();
            expect(props.workspace_path).toBeDefined();
            expect(props.priority.enum).toEqual(['High', 'Medium', 'Low']);
        });

        it('getToolDefinitionDynamic matches static (ignoring stepId) and may include extra props', async () => {
            const staticDef = AddToolNew.getToolDefinition();
            const dynamicDef = await AddToolNew.getToolDefinitionDynamic(globalDb);
            expect(dynamicDef.name).toBe(staticDef.name);
            const staticKeys = Object.keys(staticDef.inputSchema.properties).filter(k => k !== 'stepId');
            const dynamicKeys = Object.keys(dynamicDef.inputSchema.properties);
            // dynamic should contain at least all static keys (minus stepId)
            for (const k of staticKeys) {
                expect(dynamicKeys).toContain(k);
            }
            // and include title from toolConfig.additionalProperties
            expect(dynamicKeys).toContain('title');
            expect(dynamicDef.inputSchema.required).toEqual(staticDef.inputSchema.required);
        });
    });

    describe('execute - happy path', () => {
        it('creates a task with generated id and title from description', async () => {
            // Freeze time for deterministic task id
            vi.spyOn(Date, 'now').mockReturnValue(1762194000000); // ... -> last six = 000000

            const result = await addTool.execute({
                workspace_path: workspacePath,
                task_description: 'Implement add tool unit tests. Ensure coverage.',
                // no title provided -> should be generated from first sentence
                priority: 'High'
            });

            expect(result.isError).toBe(false);
            const text = result.content[0]?.text || '';
            expect(text).toContain('Task TP-000000 created successfully');

            // Verify persisted record
            const wsDb = new WorkspaceDatabaseService(workspacePath);
            await wsDb.initialize();
            const task = await wsDb.getTask('TP-000000');
            expect(task).toBeTruthy();
            expect(task?.priority).toBe('high'); // priority is lowercased
            // Title should be first sentence because it is short
            expect(task?.title).toBe('Implement add tool unit tests');
            expect(task?.status).toBe('queued');
            expect(task?.progress).toBe(0);
        });

        it('respects provided title and normalizes priority (mixed case)', async () => {
            vi.spyOn(Date, 'now').mockReturnValue(1762194666666); // last six = 666666

            const result = await addTool.execute({
                workspace_path: workspacePath,
                task_description: 'A long description that should not be used for title',
                title: 'Explicit Title',
                priority: 'mEdIuM'
            });

            expect(result.isError).toBe(false);
            const wsDb = new WorkspaceDatabaseService(workspacePath);
            await wsDb.initialize();
            const task = await wsDb.getTask('TP-666666');
            expect(task?.title).toBe('Explicit Title');
            expect(task?.priority).toBe('medium');
        });
        it('defaults priority to medium when not provided', async () => {
            vi.spyOn(Date, 'now').mockReturnValue(1762194999999); // 999999

            const result = await addTool.execute({
                workspace_path: workspacePath,
                task_description: 'Task without priority'
                // no priority provided
            });

            expect(result.isError).toBe(false);
            const wsDb = new WorkspaceDatabaseService(workspacePath);
            await wsDb.initialize();
            const task = await wsDb.getTask('TP-999999');
            expect(task?.priority).toBe('medium');
        });
        it('generates short title from long description (>60 chars)', async () => {
            vi.spyOn(Date, 'now').mockReturnValue(1762194555555); // 555555
            const longDesc = 'This is a very long description that definitely exceeds sixty characters so it should be truncated and ended with ellipsis.';

            await addTool.execute({
                workspace_path: workspacePath,
                task_description: longDesc
            });

            const wsDb = new WorkspaceDatabaseService(workspacePath);
            await wsDb.initialize();
            const task = await wsDb.getTask('TP-555555');
            expect(task).toBeTruthy();
            expect(task?.title.endsWith('...')).toBe(true);
            expect(task?.title.length).toBeGreaterThan(3);
        });

        it('generates title from description without sentence endings', async () => {
            vi.spyOn(Date, 'now').mockReturnValue(1762194777777); // 777777
            const descWithoutSentences = 'This description has no period or question mark or exclamation point';

            await addTool.execute({
                workspace_path: workspacePath,
                task_description: descWithoutSentences
            });

            const wsDb = new WorkspaceDatabaseService(workspacePath);
            await wsDb.initialize();
            const task = await wsDb.getTask('TP-777777');
            expect(task).toBeTruthy();
            expect(task?.title).toBe('This description has no period or question mark or...');
        });

        it('generates title from short description without ellipsis', async () => {
            vi.spyOn(Date, 'now').mockReturnValue(1762194888888); // 888888
            const shortDesc = 'Short description under 50 chars';

            await addTool.execute({
                workspace_path: workspacePath,
                task_description: shortDesc
            });

            const wsDb = new WorkspaceDatabaseService(workspacePath);
            await wsDb.initialize();
            const task = await wsDb.getTask('TP-888888');
            expect(task).toBeTruthy();
            expect(task?.title).toBe('Short description under 50 chars');
            expect(task?.title.endsWith('...')).toBe(false);
        });
    });

    describe('execute - validation and errors', () => {
        it('returns error when workspace is not registered in GLOBAL DB', async () => {
            const notRegisteredPath = mkdtempSync(join(tmpdir(), 'specly-add-tool-missing-'));
            const localTool = new AddToolNew(globalDb);
            const res = await localTool.execute({
                workspace_path: notRegisteredPath,
                task_description: 'Should fail'
            });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain('Workspace not found at path');
            try { rmSync(notRegisteredPath, { recursive: true, force: true }); } catch { }
        });

        it('handles createTask throwing error (scoped spy for error path)', async () => {
            vi.spyOn(Date, 'now').mockReturnValue(1762194333333); // 333333

            // Spy only on createTask to simulate write failure
            const spy = vi.spyOn(WorkspaceDatabaseService.prototype, 'createTask').mockRejectedValueOnce(new Error('Write failure'));

            const res = await addTool.execute({
                workspace_path: workspacePath,
                task_description: 'Trigger failure path'
            });

            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain('Failed to create task');
            expect(res.content[0].text).toContain('Write failure');
            spy.mockRestore();
        });

        it('handles createTask throwing non-Error object', async () => {
            vi.spyOn(Date, 'now').mockReturnValue(1762194222222); // 222222

            // Spy to simulate throwing a string
            const spy = vi.spyOn(WorkspaceDatabaseService.prototype, 'createTask').mockRejectedValueOnce('String error');

            const res = await addTool.execute({
                workspace_path: workspacePath,
                task_description: 'Trigger string error'
            });

            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain('Failed to create task');
            expect(res.content[0].text).toContain('String error');
            spy.mockRestore();
        });
    });
});
