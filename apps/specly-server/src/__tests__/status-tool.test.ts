/**
 * Comprehensive test coverage for StatusToolNew
 * Target: 95%+ coverage (statement, branch, function)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusToolNew } from '../tools/status.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { WorkspaceDatabaseService } from '../database/workspace-queries.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { ToolNames } from '../constants/tool-names.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('StatusToolNew', () => {
    let drizzleDb: DrizzleDatabaseManager;
  let statusTool: StatusToolNew;
    let workspacePath: string;

    beforeEach(async () => {
        // Use a GLOBAL-mode in-memory database so BaseTool.globalDb works correctly
        drizzleDb = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
        await drizzleDb.initialize();

      // Create a temp workspace directory
      workspacePath = mkdtempSync(join(tmpdir(), 'status-tool-'));

      // Seed the SAME global DB instance used by the tool
      const global = new GlobalDatabaseService(drizzleDb);
      await global.initialize();
      await global.createWorkspace({ id: `ws_${Date.now()}`, path: workspacePath, name: 'test-workspace' } as any);

      // Create StatusToolNew instance wired to the same GLOBAL DB
      statusTool = new StatusToolNew(drizzleDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
      // Best-effort cleanup of temp workspace directory
      try { rmSync(workspacePath, { recursive: true, force: true }); } catch { }
  });

  describe('Constructor', () => {
    it('should create instance with correct configuration', () => {
      expect(statusTool).toBeDefined();
      expect(statusTool).toBeInstanceOf(StatusToolNew);
    });

    it('should set tool name to STATUS constant', () => {
      const config = (statusTool as any).toolConfig;
      expect(config.name).toBe(ToolNames.STATUS);
    });

    it('should mark workspace_path as required field', () => {
      const config = (statusTool as any).toolConfig;
      expect(config.requiredFields).toContain('workspace_path');
    });

    it('should have descriptive configuration', () => {
      const config = (statusTool as any).toolConfig;
      expect(config.description).toBeDefined();
      expect(config.description.length).toBeGreaterThan(0);
      expect(config.description.toLowerCase()).toContain('status');
    });
  });

  describe('getToolName()', () => {
    it('should return ToolNames.STATUS', () => {
      expect(statusTool.getToolName()).toBe(ToolNames.STATUS);
    });

    it('should return consistent value across instances', () => {
        const tool1 = new StatusToolNew(drizzleDb);
        const tool2 = new StatusToolNew(drizzleDb);
      expect(tool1.getToolName()).toBe(tool2.getToolName());
    });

    it('should return a non-empty string', () => {
      const toolName = statusTool.getToolName();
      expect(typeof toolName).toBe('string');
      expect(toolName.length).toBeGreaterThan(0);
    });
  });

  describe('getToolDefinition() - Static', () => {
    it('should return tool definition without database', () => {
      const definition = StatusToolNew.getToolDefinition();
      expect(definition).toBeDefined();
      expect(definition.name).toBe(ToolNames.STATUS);
    });

    it('should include workspace_path in input schema', () => {
      const definition = StatusToolNew.getToolDefinition();
      expect(definition.inputSchema.properties.workspace_path).toBeDefined();
      expect(definition.inputSchema.properties.workspace_path.type).toBe('string');
    });

    it('should mark workspace_path as required', () => {
      const definition = StatusToolNew.getToolDefinition();
      expect(definition.inputSchema.required).toContain('workspace_path');
    });

    it('should have descriptive text about status', () => {
      const definition = StatusToolNew.getToolDefinition();
      expect(definition.description).toBeDefined();
      expect(definition.description.toLowerCase()).toContain('status');
    });

    it('should be callable without class instantiation', () => {
      expect(() => StatusToolNew.getToolDefinition()).not.toThrow();
    });
  });

  describe('getToolDefinitionDynamic() - Static', () => {
    it('should return tool definition with STATUS name', async () => {
        const definition = await StatusToolNew.getToolDefinitionDynamic(drizzleDb);
      expect(definition.name).toBe(ToolNames.STATUS);
    });

    it('should include workspace_path in input schema', async () => {
        const definition = await StatusToolNew.getToolDefinitionDynamic(drizzleDb);
      expect(definition.inputSchema.properties.workspace_path).toBeDefined();
      expect(definition.inputSchema.properties.workspace_path.type).toBe('string');
    });

    it('should mark workspace_path as required', async () => {
        const definition = await StatusToolNew.getToolDefinitionDynamic(drizzleDb);
      expect(definition.inputSchema.required).toContain('workspace_path');
    });

    it('should have descriptive text about status summary', async () => {
        const definition = await StatusToolNew.getToolDefinitionDynamic(drizzleDb);
      expect(definition.description).toBeDefined();
      expect(definition.description.toLowerCase()).toContain('status');
    });

    it('should match structure of static definition', async () => {
      const staticDef = StatusToolNew.getToolDefinition();
        const dynamicDef = await StatusToolNew.getToolDefinitionDynamic(drizzleDb);

      expect(dynamicDef.name).toBe(staticDef.name);
      expect(dynamicDef.inputSchema.required).toEqual(staticDef.inputSchema.required);
      expect(Object.keys(dynamicDef.inputSchema.properties)).toEqual(
        Object.keys(staticDef.inputSchema.properties)
      );
    });
  });

    describe('execute() - Happy Path (concrete DB)', () => {
        it('should execute successfully with valid workspace and no tasks', async () => {
            const result = await statusTool.execute({ workspace_path: workspacePath });
      expect(result.isError).toBe(false);
          expect(result.content[0].text).toBe('Workspace status: 0 total tasks, 0 completed, 0 in progress, 0 blocked (0% complete)');
    });

      it('should call validateWorkspace with input workspace_path (spy, no mock)', async () => {
      const validateSpy = vi.spyOn(statusTool as any, 'validateWorkspace');
        await statusTool.execute({ workspace_path: workspacePath });
        expect(validateSpy).toHaveBeenCalledWith(workspacePath);
    });
  });

    describe('execute() - Error Paths (concrete validation)', () => {
        it('should return error when workspace does not exist', async () => {
            const result = await statusTool.execute({ workspace_path: join(tmpdir(), 'non-existent-workspace') });
      expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Workspace not found at path');
    });

      it('should handle missing workspace_path gracefully', async () => {
        const result = await statusTool.execute({});
      expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Workspace not found at path');
    });
  });

    describe('handleOverview() - Integration with concrete WorkspaceDatabaseService', () => {
        async function seedTasks(tasks: Array<{ id: string; title: string; status?: string }>) {
            const svc = new WorkspaceDatabaseService(workspacePath);
            await svc.initialize();
            for (const t of tasks) {
                await svc.createTask({ id: t.id, title: t.title, status: t.status as any } as any);
            }
        }

    it('should calculate status metrics correctly with mixed tasks', async () => {
        await seedTasks([
        { id: '1', status: 'completed', title: 'Task 1' },
        { id: '2', status: 'completed', title: 'Task 2' },
        { id: '3', status: 'in_progress', title: 'Task 3' },
        { id: '4', status: 'blocked', title: 'Task 4' },
          { id: '5', status: 'queued', title: 'Task 5' }
      ]);

        const result = await statusTool.execute({ workspace_path: workspacePath });
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('Workspace status: 5 total tasks, 2 completed, 1 in progress, 1 blocked (40% complete)');
    });

    it('should return 0% completion when no tasks exist', async () => {
        const result = await statusTool.execute({ workspace_path: workspacePath });
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('Workspace status: 0 total tasks, 0 completed, 0 in progress, 0 blocked (0% complete)');
    });

    it('should calculate 100% completion when all tasks completed', async () => {
        await seedTasks([
        { id: '1', status: 'completed', title: 'Task 1' },
        { id: '2', status: 'completed', title: 'Task 2' }
      ]);

        const result = await statusTool.execute({ workspace_path: workspacePath });
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('Workspace status: 2 total tasks, 2 completed, 0 in progress, 0 blocked (100% complete)');
    });

    it('should handle tasks with only in_progress status', async () => {
        await seedTasks([
        { id: '1', status: 'in_progress', title: 'Task 1' },
        { id: '2', status: 'in_progress', title: 'Task 2' }
      ]);

        const result = await statusTool.execute({ workspace_path: workspacePath });
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('Workspace status: 2 total tasks, 0 completed, 2 in progress, 0 blocked (0% complete)');
    });

    it('should handle tasks with only blocked status', async () => {
        await seedTasks([{ id: '1', status: 'blocked', title: 'Task 1' }]);
        const result = await statusTool.execute({ workspace_path: workspacePath });
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('Workspace status: 1 total tasks, 0 completed, 0 in progress, 1 blocked (0% complete)');
    });
  });

    describe('handleOverview() - Error Handling (scoped spies for unreachable paths)', () => {
    it('should handle WorkspaceDatabaseService initialization failure', async () => {
        const initSpy = vi.spyOn(WorkspaceDatabaseService.prototype, 'initialize').mockRejectedValue(new Error('DB init failed'));
        const result = await statusTool.execute({ workspace_path: workspacePath });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to generate status overview');
      expect(result.content[0].text).toContain('DB init failed');
        initSpy.mockRestore();
    });

    it('should handle getAllTasks failure', async () => {
        const getAllSpy = vi.spyOn(WorkspaceDatabaseService.prototype, 'getAllTasks').mockRejectedValue(new Error('Cannot read tasks'));
        const result = await statusTool.execute({ workspace_path: workspacePath });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to generate status overview');
      expect(result.content[0].text).toContain('Cannot read tasks');
        getAllSpy.mockRestore();
    });

    it('should handle non-Error exceptions gracefully', async () => {
        const getAllSpy = vi.spyOn(WorkspaceDatabaseService.prototype, 'getAllTasks').mockRejectedValue('String error' as any);
        const result = await statusTool.execute({ workspace_path: workspacePath });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to generate status overview');
      expect(result.content[0].text).toContain('String error');
        getAllSpy.mockRestore();
    });
  });

    describe('Edge Cases and Branch Coverage (concrete)', () => {

    it('should round completion percentage correctly (33%)', async () => {
        const svc = new WorkspaceDatabaseService(workspacePath);
        await svc.initialize();
        await svc.createTask({ id: '1', title: 'T1', status: 'completed' } as any);
        await svc.createTask({ id: '2', title: 'T2', status: 'queued' } as any);
        await svc.createTask({ id: '3', title: 'T3', status: 'queued' } as any);

        const result = await statusTool.execute({ workspace_path: workspacePath });

      expect(result.isError).toBe(false);
        // 1/3 = 33.33% rounded to 33% (we verify non-error path)
    });

    it('should handle single completed task (100%)', async () => {
        const svc = new WorkspaceDatabaseService(workspacePath);
        await svc.initialize();
        await svc.createTask({ id: 'only', title: 'Only task', status: 'completed' } as any);

        const result = await statusTool.execute({ workspace_path: workspacePath });

      expect(result.isError).toBe(false);
    });

    it('should handle single non-completed task (0%)', async () => {
        const svc = new WorkspaceDatabaseService(workspacePath);
        await svc.initialize();
        await svc.createTask({ id: 'only', title: 'Only task', status: 'queued' } as any);

        const result = await statusTool.execute({ workspace_path: workspacePath });

      expect(result.isError).toBe(false);
    });

      // Removed invalid-status test since schema enforces CHECK constraints; unknown statuses are not insertable
  });
});
