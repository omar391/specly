import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ToolsExecuteController (coverage)', () => {
  beforeEach(() => vi.resetModules());

  it('rejects deprecated mode query param', async () => {
    const { ToolsExecuteController } = await import('../../api/tools-execute.js');
    const ctrl = new ToolsExecuteController(() => ({}) as any, undefined as any, null as any);
    const ctx: any = { req: { query: (_k: string) => '1', json: async () => ({}) }, json: (b: any, s?: number) => ({ body: b, status: s }) };
    const res = await ctrl.execute(ctx as any);
    expect(res.status).toBe(400);
    expect(String(res.body.error.message)).toContain('deprecated');
  });

  it('returns 404 when tool_version_id not found', async () => {
    vi.doMock('../../database/global-queries.js', () => ({ getGlobalDatabaseService: () => ({ getToolVersion: async (id: any) => null, getSpecsByHashes: async () => ({}) }) }));
    const { ToolsExecuteController } = await import('../../api/tools-execute.js');
    const ctrl = new ToolsExecuteController(()=>({}) as any, undefined as any, null as any);
    const ctx: any = { req: { query: (_: string) => undefined, json: async () => ({ tool_version_id: '00000000-0000-4000-8000-000000000000' }) }, json: (b: any, s?: number) => ({ body: b, status: s }) };
    const res = await ctrl.execute(ctx as any);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('tool_version_id not found');
  });
});
