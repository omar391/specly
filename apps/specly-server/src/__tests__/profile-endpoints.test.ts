import { describe, it, expect } from 'vitest';
import { createApiRouter } from '../api/router.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { DrizzleDatabaseManager, DatabaseType } from '../database/drizzle-connection.js';
import { workspaces } from '../database/schema/global-schema.js';

async function makeApp() {
  const globalMgr = new DrizzleDatabaseManager(':memory:', DatabaseType.GLOBAL);
  const globalDbService = new GlobalDatabaseService(globalMgr as any);
  await globalDbService.initialize();

  // Create test workspace to satisfy foreign key constraints
  await globalDbService.createWorkspace({ id: 'w1', path: '/tmp/w1', name: 'W1', status: 'active' });

  const dbServiceWrapper = new DatabaseService(globalMgr as any);
  // Override the globalDb in the wrapper to use our initialized instance
  (dbServiceWrapper as any).globalDb = globalDbService;
  const app = await createApiRouter(dbServiceWrapper);
  return { app, globalDbService, dbServiceWrapper };
}

describe('Profile & Workspace Binding Endpoints (SP-015)', () => {
  it('creates a profile and rejects duplicate name (409)', async () => {
    const { app } = await makeApp();
    const res1 = await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'dev', description: 'Dev Profile' })
    });
    expect([200, 201]).toContain(res1.status);
    const res2 = await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'dev' })
    });
    expect(res2.status).toBe(409);
  });

  it('increments profile version on creation', async () => {
    const { app } = await makeApp();
    await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'verprof' })
    });
    const v1 = await app.request('/profiles/verprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(v1.status).toBe(201);
    const body1 = await v1.json();
    expect(body1.version).toBe(1);
    const v2 = await app.request('/profiles/verprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(v2.status).toBe(201);
    const body2 = await v2.json();
    expect(body2.version).toBe(2);
  });

  it('upgrades workspace binding to latest version and GET returns it', async () => {
    const { app, globalDbService } = await makeApp();

    await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bindprof' })
    });
    await app.request('/profiles/bindprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    await app.request('/profiles/bindprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }); // latest is version 2

    const up = await app.request('/workspaces/w1/profile/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'bindprof' })
    });
    expect(up.status).toBe(200);
    const upBody = await up.json();
    expect(upBody.workspace_id).toBe('w1');
    expect(upBody.profile_version_id).toBeTruthy();

    const getb = await app.request('/workspaces/w1/profile');
    expect(getb.status).toBe(200);
    const getbBody = await getb.json();
    expect(getbBody.workspace_id).toBe('w1');
    expect(getbBody.profile_version_id).toBe(upBody.profile_version_id);
    // Enriched fields present
    expect(getbBody.profile_name).toBe('bindprof');
    expect(getbBody.version).toBe(2);
  });

  it('attaches tool versions to a profile version and handles duplicates', async () => {
    const { app } = await makeApp();
    // Create tool + spec + version
    const specBody = {
      executor_type: 'node',
      executor_version: '1',
      intent: 'autonomous',
      side_effect: false,
      content_template: 'run',
      static_params: {},
      input_schema: null,
      output_schema: null,
      idempotency_key_template: null,
      retry_policy: null,
      show_output: true,
      security: null,
      metadata: {}
    };
    const spec = await app.request('/specs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(specBody)
    });
    expect([200,201]).toContain(spec.status);
    const specResBody = await spec.json();
    const specHash = specResBody.hash;
    const toolMake = await app.request('/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'echo', description: 'Echo tool' })
    });
    expect([200,201,409]).toContain(toolMake.status);
    const tv = await app.request('/tools/echo/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_specs: [specHash], entry_spec: specHash, edges: [] })
    });
    expect([200,201]).toContain(tv.status);
    const tvBody = await tv.json();
    const toolVersionHash = tvBody.hash;

    // Create profile + version
    await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'pubprof' })
    });
    const v1 = await app.request('/profiles/pubprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(v1.status).toBe(201);
    const v1Body = await v1.json();
    expect(v1Body.version).toBe(1);

    // Attach tool version
    const attach1 = await app.request('/profiles/pubprof/versions/1/attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachments: [{ tool_name: 'echo', tool_version_hash: toolVersionHash }] })
    });
    expect(attach1.status).toBe(201);
    const attach1Body = await attach1.json();
    expect(attach1Body.attachments.length).toBe(1);
    expect(attach1Body.attachments[0].toolName).toBe('echo');

    // Duplicate attach is a no-op and returns created=false in per-item
    const attach2 = await app.request('/profiles/pubprof/versions/1/attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachments: [{ tool_name: 'echo', tool_version_hash: toolVersionHash }] })
    });
    expect(attach2.status).toBe(201);
    const attach2Body = await attach2.json();
    const createdFlags = attach2Body.attached.map((a: any) => a.created);
    expect(createdFlags).toEqual([false]);
    // GET attachments
    const getAtt = await app.request('/profiles/pubprof/versions/1/attachments');
    expect(getAtt.status).toBe(200);
    const getAttBody = await getAtt.json();
    expect(Array.isArray(getAttBody.attachments)).toBe(true);
    expect(getAttBody.attachments.length).toBe(1);
    expect(getAttBody.attachments[0].toolName).toBe('echo');
  });

  it('rejects creating a profile version with missing parent_profile_version_id', async () => {
    const { app } = await makeApp();
    await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'p1' })
    });
    const v1 = await app.request('/profiles/p1/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(v1.status).toBe(201);
    const bad = await app.request('/profiles/p1/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_profile_version_id: 'does-not-exist' })
    });
    expect(bad.status).toBe(422);
  });

  it('rejects parent_profile_version_id from a different profile', async () => {
    const { app } = await makeApp();
    await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'a' })
    });
    await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'b' })
    });
    const a1 = await app.request('/profiles/a/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(a1.status).toBe(201);
    const a1Body = await a1.json();
    const bad = await app.request('/profiles/b/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_profile_version_id: a1Body.id })
    });
    expect(bad.status).toBe(422);
  });

    it('publishes a profile version (validation-only) and 404s on missing version', async () => {
        const { app } = await makeApp();
      await app.request('/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'pub' })
      });
      const v1 = await app.request('/profiles/pub/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
        expect(v1.status).toBe(201);
      const ok = await app.request('/profiles/pub/versions/1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
        expect(ok.status).toBe(200);
      const okBody = await ok.json();
      expect(okBody.published).toBe(true);
      const missing = await app.request('/profiles/pub/versions/99/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
        expect(missing.status).toBe(404);
    });

  it('returns 404 for non-existent profile in createProfileVersion', async () => {
    const { app } = await makeApp();
    const res = await app.request('/profiles/nonexistent/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('profile not found');
  });

  it('returns 404 for non-existent profile in attachTools', async () => {
    const { app } = await makeApp();
    const res = await app.request('/profiles/nonexistent/versions/1/attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachments: [{ tool_name: 'test', tool_version_hash: 'hash' }] })
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('profile not found');
  });

  it('returns 404 for non-existent profile in upgradeWorkspaceProfile', async () => {
    const { app } = await makeApp();
    const res = await app.request('/workspaces/w1/profile/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'nonexistent' })
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('profile not found');
  });

  it('returns 404 for non-existent profile in getAttachments', async () => {
    const { app } = await makeApp();
    const res = await app.request('/profiles/nonexistent/versions/1/attachments', {
      method: 'GET'
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('profile not found');
  });

  it('returns 404 for non-existent profile in publishProfileVersion', async () => {
    const { app } = await makeApp();
    const res = await app.request('/profiles/nonexistent/versions/1/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('profile not found');
  });

  it('returns 404 for non-existent version in upgradeWorkspaceProfile', async () => {
    const { app } = await makeApp();
    // Create profile with version 1
    await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'testprof' })
    });
    await app.request('/profiles/testprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    // Try to upgrade to version 99 (doesn't exist)
    const res = await app.request('/workspaces/w1/profile/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'testprof', version: 99 })
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('profile version not found');
  });

  it('upgrades to specific existing version in upgradeWorkspaceProfile', async () => {
    const { app } = await makeApp();
    // Create profile with versions 1 and 2
    await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'testprof' })
    });
    await app.request('/profiles/testprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    await app.request('/profiles/testprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    // Upgrade to version 1 specifically
    const res = await app.request('/workspaces/w1/profile/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'testprof', version: 1 })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('workspace_id', 'w1');
    expect(body).toHaveProperty('profile_version_id');
    expect(body).toHaveProperty('pinned_at');
  });

  it('upgrades to latest version when no version specified in upgradeWorkspaceProfile', async () => {
    const { app } = await makeApp();
    // Create profile with versions 1 and 2
    await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'testprof' })
    });
    await app.request('/profiles/testprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    await app.request('/profiles/testprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    // Upgrade without specifying version (should use latest)
    const res = await app.request('/workspaces/w1/profile/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'testprof' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('workspace_id', 'w1');
    expect(body).toHaveProperty('profile_version_id');
    expect(body).toHaveProperty('pinned_at');
  });

  it('returns 400 for missing tool_name in attachTools', async () => {
    const { app } = await makeApp();
    // Create profile and version
    await app.request('/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'testprof' })
    });
    await app.request('/profiles/testprof/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    // Try to attach tool without tool_name
    const res = await app.request('/profiles/testprof/versions/1/attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachments: [{ tool_version_hash: 'hash123' }] })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('tool_name and tool_version_hash required for each attachment');
  });
});
