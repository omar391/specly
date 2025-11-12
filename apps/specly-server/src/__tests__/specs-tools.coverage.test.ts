import { describe, it, expect, vi } from 'vitest';

// Small, focused tests for specs-tools controller behaviors
describe('SpecsController and ToolsController (focused)', () => {
  it('createSpec returns 400 when missing required fields', async () => {
    const { SpecsController } = await import('../api/specs-tools.js');

    // Fake Global DB service minimal
    const fakeDbService: any = {
      async initialize() {},
      getDrizzleManager: () => ({ getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }), insert: async () => {} }) })
    };

    const controller = new SpecsController(fakeDbService as any);

    const req = { json: async () => ({}) };
    let sent: any = null;
    const ctx: any = { req, json: (payload: any, status?: number) => { sent = { payload, status: status ?? 200 }; return sent; } };

    const res = await controller.createSpec(ctx as any);
    // Our fake ctx.json returns the sent object; ensure 400
    expect(sent.status).toBe(400);
    expect(sent.payload).toHaveProperty('error');
  });

  it('createSpec inserts new spec and returns 201 when not existing', async () => {
    // stub validators and hashing to deterministic behavior before importing controller
    vi.mock('../utils/hash.js', async () => ({ hashSpec: (s:any) => ({ hash: 'h-1' }) }));
    vi.mock('../utils/security-validators.js', async () => ({ validateSpecSecurity: (s:any) => null }));
    const { SpecsController } = await import('../api/specs-tools.js');

    // Fake DB that records inserts and returns no existing rows
    const inserts: any[] = [];
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: (tbl: any) => ({ values: async (v: any) => { inserts.push(v); } }),
    } as any;

    const fakeDbService: any = {
      async initialize() {},
      getDrizzleManager: () => ({ getDb: () => fakeDb })
    };

    const controller = new SpecsController(fakeDbService as any);

    const req = { json: async () => ({ executor_type: 'shell', executor_version: '1', intent: 'do', side_effect: false }) };
    let sent: any = null;
    const ctx: any = { req, json: (payload: any, status?: number) => { sent = { payload, status: status ?? 200 }; return sent; } };

    const res = await controller.createSpec(ctx as any);
    expect(sent.status).toBe(201);
    expect(sent.payload).toHaveProperty('hash');
    expect(sent.payload.created).toBe(true);
  });

  it('createTool returns 400 when name missing and 409 when exists', async () => {
    const { ToolsController } = await import('../api/specs-tools.js');

    // Fake DB for tools: existing case
    const fakeDbExists = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ name: 't' }] }) }) }),
      insert: { values: async () => {} }
    } as any;

    const fakeDbServiceExists: any = { async initialize() {}, getDrizzleManager: () => ({ getDb: () => fakeDbExists }) };
    const controllerExists = new ToolsController(fakeDbServiceExists as any);

    // Missing name
    const reqMissing = { json: async () => ({}) };
    let sent1: any = null;
    const ctx1: any = { req: reqMissing, json: (payload: any, status?: number) => { sent1 = { payload, status: status ?? 200 }; return sent1; } };
    const res1 = await controllerExists.createTool(ctx1 as any);
    expect(sent1.status).toBe(400);

    // Duplicate exists -> 409
    const reqDup = { json: async () => ({ name: 't', description: 'd' }) };
    let sent2: any = null;
    const ctx2: any = { req: reqDup, json: (payload: any, status?: number) => { sent2 = { payload, status: status ?? 200 }; return sent2; } };
    const res2 = await controllerExists.createTool(ctx2 as any);
    expect(sent2.status).toBe(409);
  });

});
