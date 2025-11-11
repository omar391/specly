import { describe, it, expect } from 'vitest';
import { createApiRouter } from '../api/router.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { workspaces } from '../database/schema/global-schema.js';

async function makeApp() {
  const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
  const globalDbService = new GlobalDatabaseService(globalMgr as any);
  const dbServiceWrapper = new DatabaseService(globalMgr as any);
  const app = await createApiRouter(dbServiceWrapper);
  return { app, globalDbService };
}

describe('Task Dependency Endpoints (SP-016)', () => {
  it('adds/removes/lists dependencies and enforces transition guard', async () => {
    const { app, globalDbService } = await makeApp();
    await globalDbService.initialize();
    const db = globalDbService.getDrizzleManager().getDb();
    // Seed workspace
    await db.insert(workspaces).values({ id: 'wdep', path: '/tmp/wdep', name: 'WDEP', status: 'active' } as any);

    // Create three tasks: A, B, C
    const create = async (title: string) => {
      const res = await app.request('/workspaces/wdep/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: title, priority: 'medium' })
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      return body.data.task.id as string;
    };
    const A = await create('A');
    const B = await create('B');
    const C = await create('C');

    // Add deps: A depends on B, B depends on C
    let r = await app.request(`/workspaces/wdep/tasks/${A}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depends_on: B })
    });
    expect(r.status).toBe(201);
    r = await app.request(`/workspaces/wdep/tasks/${B}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depends_on: C })
    });
    expect(r.status).toBe(201);

    // Self-dependency rejected
    r = await app.request(`/workspaces/wdep/tasks/${A}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depends_on: A })
    });
    expect(r.status).toBe(422);

    // Cycle detection: C cannot depend on A
    r = await app.request(`/workspaces/wdep/tasks/${C}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depends_on: A })
    });
    expect(r.status).toBe(422);

    // List A deps => [B]
    r = await app.request(`/workspaces/wdep/tasks/${A}/dependencies`);
    expect(r.status).toBe(200);
    const listBody = await r.json();
    expect(Array.isArray(listBody.data.dependencies)).toBe(true);
    expect(listBody.data.dependencies.find((d: any) => d.depends_on_task_id === B)).toBeTruthy();

    // Guard: A cannot move to in_progress while B incomplete
    let s = await app.request(`/workspaces/wdep/tasks/${A}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' })
    });
    expect(s.status).toBe(422);

    // Complete C then B then A should be allowed progressively
    s = await app.request(`/workspaces/wdep/tasks/${C}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' })
    });
    expect(s.status).toBe(200);
    s = await app.request(`/workspaces/wdep/tasks/${C}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    expect(s.status).toBe(200);

    // B still blocked by C? Now should be unblocked
    s = await app.request(`/workspaces/wdep/tasks/${B}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' })
    });
    expect(s.status).toBe(200);
    s = await app.request(`/workspaces/wdep/tasks/${B}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    expect(s.status).toBe(200);

    // Now A can start
    s = await app.request(`/workspaces/wdep/tasks/${A}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' })
    });
    expect(s.status).toBe(200);

    // Remove dependency and list
    r = await app.request(`/workspaces/wdep/tasks/${A}/dependencies/${B}`, {
      method: 'DELETE'
    });
    expect(r.status).toBe(204);
    r = await app.request(`/workspaces/wdep/tasks/${A}/dependencies`);
    expect(r.status).toBe(200);
  });
});
