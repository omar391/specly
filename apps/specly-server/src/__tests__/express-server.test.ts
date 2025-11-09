import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createExpressServer, type IExpressServer } from '@omar391/mcp-kit/server/express';
import { setupSpeclyApi } from '../server/specly-express-hooks.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';

// Shared Express behaviors live in mcp-kit tests. This suite focusses on Specly-specific wiring.

describe('Specly express integration hooks', () => {
  let server: IExpressServer;
  let drizzleDb: DrizzleDatabaseManager;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    drizzleDb = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
    await drizzleDb.initialize();

    databaseService = new DatabaseService(drizzleDb);
    server = createExpressServer({
      port: 0,
      dev: true,
      info: { name: 'specly', version: 'test', uiHintUrl: 'http://localhost:5173' },
      endpoints: { apiBase: '/api', mcpBase: '/mcp', healthPath: '/health' },
    });
  });

  afterEach(async () => {
    await server.stop();
    await drizzleDb.close();
  });

  it('exposes Specly-specific metadata on the root endpoint', async () => {
    server.setupHealthAndRoot();

    const response = await request(server.app)
      .get('/')
      .expect(200);

    expect(response.body.message).toBe('Specly Backend API');
    expect(response.body.note).toContain('UI should be running separately');
  });

  it('mounts REST API routes when setupSpeclyApi succeeds', async () => {
    await setupSpeclyApi(server, databaseService);

    const response = await request(server.app)
      .get('/api/workspaces')
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data?.workspaces)).toBe(true);
  });

  it('continues setup when API router creation fails', async () => {
    const routerModule = await import('../api/router.js');
    const spy = vi.spyOn(routerModule, 'createApiRouter').mockRejectedValueOnce(new Error('intentional failure'));

    await expect(setupSpeclyApi(server, databaseService)).resolves.not.toThrow();

    spy.mockRestore();
  });

  it('allows registering custom endpoints directly on the app', async () => {
    server.app.get('/custom-test', (_req, res) => {
      res.json({ custom: true });
    });

    const response = await request(server.app)
      .get('/custom-test')
      .expect(200);

    expect(response.body).toEqual({ custom: true });
  });
});
