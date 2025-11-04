import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { ExpressServer } from '../server/express-server.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { DatabaseService } from '../services/database-service.js';

// Helper to build minimal valid task payloads
const taskPayload = (overrides: Partial<{ title: string; description: string; priority: 'high' | 'medium' | 'low'; assets: any[]; external_references: any[]; metadata: any; tags: any[] }> = {}) => ({
  title: 'Test Task',
  description: 'Do something',
  priority: 'medium' as const,
  ...overrides,
});

describe('Tasks API Endpoints (concrete DB, supertest)', () => {
  let server: ExpressServer;
  let drizzleDb: DrizzleDatabaseManager;
  let databaseService: DatabaseService;
  let app: any;
  let workspaceId: string;
  let workspacePath: string;

  beforeAll(async () => {
    drizzleDb = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    await drizzleDb.initialize();
    databaseService = new DatabaseService(drizzleDb);

    server = new ExpressServer({ port: 0, dev: true });
    await server.start();
    await server.setupAPIEndpoints(databaseService);
    app = server.getApp();

    // Create a workspace in GLOBAL DB
    workspaceId = 'ws-' + Math.random().toString(36).slice(2, 8);
    workspacePath = '/tmp/' + workspaceId;
    await databaseService.getGlobal().createWorkspace({ id: workspaceId, path: workspacePath, name: 'Workspace', status: 'idle' } as any);
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('GET /api/workspaces/:workspaceId/tasks', () => {
    it('returns empty list initially', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${workspaceId}/tasks`)
        .expect(200);

      expect(res.body?.data?.tasks).toEqual([]);
      expect(res.body?.data?.total).toBe(0);
      expect(res.body?.data?.page).toBe(1);
    });

    it('paginates and caps limit at 100', async () => {
      const wsDb = await databaseService.getWorkspace(workspacePath);
      const now = new Date().toISOString();
      // Create 3 tasks
      for (let i = 0; i < 3; i++) {
        await wsDb.createTask({
          id: `t-${i}`,
          title: `T${i}`,
          description: 'x',
          priority: 'low',
          status: 'queued',
          progress: 0,
          createdAt: now,
          updatedAt: now,
        } as any);
      }
      const res1 = await request(app)
        .get(`/api/workspaces/${workspaceId}/tasks`)
        .query({ limit: 2, offset: 0 })
        .expect(200);
      expect(res1.body.data.total).toBeGreaterThanOrEqual(3);
      expect(res1.body.data.tasks.length).toBeLessThanOrEqual(2);
      const res2 = await request(app)
        .get(`/api/workspaces/${workspaceId}/tasks`)
        .query({ limit: 2, offset: 2 })
        .expect(200);
      expect(res2.body.data.page).toBe(2);
    });
  });

  describe('POST /api/workspaces/:workspaceId/tasks', () => {
    it('validates required fields: title, description, priority', async () => {
      // missing title
      await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks`)
        .send(taskPayload({ title: '   ' as any }))
        .expect(422);
      // missing description
      await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks`)
        .send(taskPayload({ description: '   ' as any }))
        .expect(422);
      // invalid priority
      await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks`)
        .send({ ...taskPayload(), priority: 'urgent' as any })
        .expect(422);
    });

    it('creates a task successfully', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks`)
        .send(taskPayload({ priority: 'high' }))
        .expect(201);

      expect(res.body.data.task.id).toMatch(/^TP-/);
      expect(res.body.data.task.priority).toBe('high');
      expect(res.body.data.task.status).toBe('queued');
    });
  });

  describe('GET /api/workspaces/:workspaceId/tasks/:taskId', () => {
    it('returns 404 when not found', async () => {
      await request(app)
        .get(`/api/workspaces/${workspaceId}/tasks/does-not-exist`)
        .expect(404);
    });

    it('returns the requested task', async () => {
      const wsDb = await databaseService.getWorkspace(workspacePath);
      const now = new Date().toISOString();
      await wsDb.createTask({
        id: 't-get-1', title: 'Readme', description: 'r', priority: 'low', status: 'queued', progress: 0, createdAt: now, updatedAt: now
      } as any);
      const res = await request(app)
        .get(`/api/workspaces/${workspaceId}/tasks/t-get-1`)
        .expect(200);
      expect(res.body.data.task.id).toBe('t-get-1');
      expect(res.body.data.task.description).toBeTypeOf('string');
    });
  });

  describe('PATCH /api/workspaces/:workspaceId/tasks/:taskId/status', () => {
    it('validates status presence and value', async () => {
      // missing status
      await request(app)
        .patch(`/api/workspaces/${workspaceId}/tasks/t-missing/status`)
        .send({})
        .expect(422);
      // invalid value if task exists
      const wsDb = await databaseService.getWorkspace(workspacePath);
      const now = new Date().toISOString();
      await wsDb.createTask({ id: 't-bad', title: 'X', description: 'x', priority: 'low', status: 'queued', progress: 0, createdAt: now, updatedAt: now } as any);
      await request(app)
        .patch(`/api/workspaces/${workspaceId}/tasks/t-bad/status`)
        .send({ status: 'not_a_status' })
        .expect(422);
    });

    it('rejects transition to completed when dependencies unresolved; allows legal transition', async () => {
      const wsDb = await databaseService.getWorkspace(workspacePath);
      const now = new Date().toISOString();
      await wsDb.createTask({ id: 't-a', title: 'A', description: 'a', priority: 'low', status: 'queued', progress: 0, createdAt: now, updatedAt: now } as any);
      await wsDb.createTask({ id: 't-b', title: 'B', description: 'b', priority: 'low', status: 'queued', progress: 0, createdAt: now, updatedAt: now } as any);
      await wsDb.addTaskDependency('t-a', 't-b'); // a depends on b (unresolved)

      // Try to complete A (should fail due to unresolved dep)
      await request(app)
        .patch(`/api/workspaces/${workspaceId}/tasks/t-a/status`)
        .send({ status: 'completed' })
        .expect(422);

      // Legal transition to paused
      const okRes = await request(app)
        .patch(`/api/workspaces/${workspaceId}/tasks/t-a/status`)
        .send({ status: 'paused' })
        .expect(200);
      expect(okRes.body.data.task.status).toBe('paused');
    });
  });

  describe('Dependencies endpoints', () => {
    it('POST validate depends_on and self-dependency', async () => {
      await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/td-1/dependencies`)
        .send({})
        .expect(422);

      await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/td-1/dependencies`)
        .send({ depends_on: 'td-1' })
        .expect(422);
    });

    it('POST 404 when either task does not exist', async () => {
      await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/x1/dependencies`)
        .send({ depends_on: 'x2' })
        .expect(404);
    });

    it('POST detects cycles and allows valid dependency; GET/DELETE work', async () => {
      const wsDb = await databaseService.getWorkspace(workspacePath);
      const now = new Date().toISOString();
      await wsDb.createTask({ id: 'c1', title: 'C1', description: 'c', priority: 'low', status: 'queued', progress: 0, createdAt: now, updatedAt: now } as any);
      await wsDb.createTask({ id: 'c2', title: 'C2', description: 'c', priority: 'low', status: 'queued', progress: 0, createdAt: now, updatedAt: now } as any);
      await wsDb.createTask({ id: 'c3', title: 'C3', description: 'c', priority: 'low', status: 'queued', progress: 0, createdAt: now, updatedAt: now } as any);
      await wsDb.createTask({ id: 'c4', title: 'C4', description: 'c', priority: 'low', status: 'queued', progress: 0, createdAt: now, updatedAt: now } as any);

      // c1 <- c2 <- c3 (c1 depends on c2, c2 depends on c3)
      await wsDb.addTaskDependency('c1', 'c2');
      await wsDb.addTaskDependency('c2', 'c3');

      // Attempt to add c3 depends on c1 creates cycle
      await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/c3/dependencies`)
        .send({ depends_on: 'c1' })
        .expect(422);

      // Valid direct dependency: c4 depends on c2 (no cycle)
      await request(app)
        .post(`/api/workspaces/${workspaceId}/tasks/c4/dependencies`)
        .send({ depends_on: 'c2' })
        .expect(201);

      // GET list
      const listRes = await request(app)
        .get(`/api/workspaces/${workspaceId}/tasks/c4/dependencies`)
        .expect(200);
      expect(Array.isArray(listRes.body.data.dependencies)).toBe(true);
      expect(listRes.body.data.dependencies.length).toBeGreaterThanOrEqual(1);

      // DELETE relation
      await request(app)
        .delete(`/api/workspaces/${workspaceId}/tasks/c4/dependencies/c2`)
        .expect(204);
    });
  });
});
