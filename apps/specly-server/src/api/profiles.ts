import type { Context } from 'hono';
import { GlobalDatabaseService, getGlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { ProfileRepository } from '../repositories/profile-repository.js';
import { workspaces } from '../database/schema/global-schema.js';

// Local helper mirrors specs-tools resolve logic to support test-time DB injection
function resolveDbService(c: Context, fallback: GlobalDatabaseService): GlobalDatabaseService {
  const injected = (c.env as any)?.dbService;
  if (injected instanceof GlobalDatabaseService) return injected;
  if (injected instanceof DatabaseService) return injected.getGlobal();
  if (injected && typeof injected.getGlobal === 'function') return injected.getGlobal();
  if (injected && typeof injected.getDb === 'function') return new GlobalDatabaseService(injected);
  return fallback;
}

export class ProfilesController {
  private defaultDb!: GlobalDatabaseService;

  constructor(defaultDb?: GlobalDatabaseService) {
    if (!defaultDb) {
      this.defaultDb = getGlobalDatabaseService();
    } else {
      this.defaultDb = defaultDb;
    }
  }

  /** POST /api/profiles */
  async createProfile(c: Context) {
    const { name, description, parent_profile_id } = await c.req.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return c.json({ error: 'name required' }, 400);
    }
    const db = resolveDbService(c, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    try {
      const result = await repo.createProfile({ name, description, parentProfileId: parent_profile_id ?? null });
      if (!result.created) {
        return c.json({ error: 'profile exists', name }, 409);
      }
      return c.json({ id: result.profile.id, name: result.profile.name, created: true }, 201);
    } catch (e: any) {
      return c.json({ error: e?.message || 'validation failed' }, 422);
    }
  }

  /** GET /api/profiles */
  async getProfiles(c: Context) {
    const db = resolveDbService(c, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    const profiles = await repo.listProfiles();
    return c.json({ profiles }, 200);
  }

  /** POST /api/profiles/:profile/versions */
  async createProfileVersion(c: Context) {
    const profileName = c.req.param('profile');
    if (!profileName) return c.json({ error: 'profile param required' }, 400);
    const { parent_profile_version_id } = await c.req.json();
    const db = resolveDbService(c, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    const profile = await repo.getProfileByName(profileName);
    if (!profile) return c.json({ error: 'profile not found', profile: profileName }, 404);
    try {
      const created = await repo.createProfileVersion({ profileId: profile.id, parentProfileVersionId: parent_profile_version_id ?? null });
      return c.json({ id: created.id, version: created.version, created: true }, 201);
    } catch (e: any) {
      const msg = String(e?.message || 'validation failed');
      if (/not found|different profile|Cycle detected|exceeded max depth/i.test(msg)) {
        return c.json({ error: msg }, 422);
      }
      return c.json({ error: 'failed to create profile version' }, 500);
    }
  }

  /** POST /api/workspaces/:workspaceId/profile/upgrade */
  async upgradeWorkspaceProfile(c: Context) {
    const { workspaceId } = c.req.param();
    const { profile, version } = await c.req.json();
    if (!workspaceId) return c.json({ error: 'workspaceId required' }, 400);
    const db = resolveDbService(c, this.defaultDb);
    await db.initialize();
    const drizzle = db.getDrizzleManager().getDb();
    // Ensure workspace exists
    const existingWs = await drizzle.select().from(workspaces).where((workspaces as any).id.eq?.(workspaceId) ?? undefined).limit?.(1);
    // Fallback when Drizzle typed builder doesn't expose eq in test context; use globalDb API instead
    let wsExists = false;
    if (Array.isArray(existingWs) && existingWs.length > 0) {
      wsExists = true;
    } else {
      wsExists = !!(await db.getWorkspace(workspaceId));
    }
    if (!wsExists) return c.json({ error: 'workspace not found', workspaceId }, 404);

    const repo = new ProfileRepository(db);
    if (!profile || typeof profile !== 'string') {
      return c.json({ error: 'profile name required in body' }, 400);
    }
    const p = await repo.getProfileByName(profile);
    if (!p) return c.json({ error: 'profile not found', profile }, 404);
    const versions = await repo.listProfileVersions(p.id);
    if (!versions.length) return c.json({ error: 'no profile versions to bind', profile }, 409);
    let target = versions[0]; // listProfileVersions returns desc order
    if (typeof version === 'number') {
      const found = versions.find(v => v.version === version);
      if (!found) return c.json({ error: 'profile version not found', profile, version }, 404);
      target = found as any;
    }
    const binding = await repo.bindWorkspaceProfile(workspaceId, (target as any).id);
    return c.json({ workspace_id: binding.workspaceId, profile_version_id: binding.profileVersionId, pinned_at: binding.pinnedAt }, 200);
  }

  /** GET /api/workspaces/:workspaceId/profile */
  async getWorkspaceProfile(c: Context) {
    const { workspaceId } = c.req.param();
    const db = resolveDbService(c, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    // Prefer enriched details for UI
    const binding = await repo.getWorkspaceBindingDetails(workspaceId);
    if (!binding) return c.json({ error: 'workspace profile not bound', workspaceId }, 404);
    return c.json({
      workspace_id: binding.workspaceId,
      profile_version_id: binding.profileVersionId,
      pinned_at: binding.pinnedAt,
      profile_name: (binding as any).profileName,
      version: (binding as any).profileVersion,
    }, 200);
  }

  /** POST /api/profiles/:profile/versions/:version/attachments */
  async attachTools(c: Context) {
    const profileName = c.req.param('profile');
    const versionNum = Number(c.req.param('version'));
    const { attachments } = await c.req.json();
    if (!profileName || Number.isNaN(versionNum)) return c.json({ error: 'profile and numeric version required' }, 400);
    if (!Array.isArray(attachments) || attachments.length === 0) return c.json({ error: 'attachments[] required' }, 400);
    const db = resolveDbService(c, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    const profile = await repo.getProfileByName(profileName);
    if (!profile) return c.json({ error: 'profile not found', profile: profileName }, 404);
    const pv = await repo.getProfileVersionByNumber(profile.id, versionNum);
    if (!pv) return c.json({ error: 'profile version not found', profile: profileName, version: versionNum }, 404);
    const results: Array<{ tool: string; created: boolean }> = [];
    for (const item of attachments) {
      const { tool_name, tool_version_hash, command_alias } = item || {};
      if (!tool_name || !tool_version_hash) {
        return c.json({ error: 'tool_name and tool_version_hash required for each attachment' }, 400);
      }
      try {
        const r = await repo.attachToolToProfileVersion({ profileVersionId: pv.id, toolName: tool_name, toolVersionHash: tool_version_hash, commandAlias: command_alias ?? null });
        results.push({ tool: tool_name, created: r.created });
      } catch (e: any) {
        return c.json({ error: e?.message || 'attach failed', tool_name }, 422);
      }
    }
    const list = await repo.listProfileVersionAttachments(pv.id);
    return c.json({ profile: profileName, version: versionNum, attached: results, attachments: list }, 201);
  }

  /** GET /api/profiles/:profile/versions/:version/attachments */
  async getAttachments(c: Context) {
    const profileName = c.req.param('profile');
    const versionNum = Number(c.req.param('version'));
    if (!profileName || Number.isNaN(versionNum)) return c.json({ error: 'profile and numeric version required' }, 400);
    const db = resolveDbService(c, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    const profile = await repo.getProfileByName(profileName);
    if (!profile) return c.json({ error: 'profile not found', profile: profileName }, 404);
    const pv = await repo.getProfileVersionByNumber(profile.id, versionNum);
    if (!pv) return c.json({ error: 'profile version not found', profile: profileName, version: versionNum }, 404);
    const list = await repo.listProfileVersionAttachments(pv.id);
    return c.json({ profile: profileName, version: versionNum, attachments: list }, 200);
  }

  /** POST /api/profiles/:profile/versions/:version/publish */
  async publishProfileVersion(c: Context) {
    const profileName = c.req.param('profile');
    const versionNum = Number(c.req.param('version'));
    if (!profileName || Number.isNaN(versionNum)) {
      return c.json({ error: 'profile and numeric version required' }, 400);
    }
    const db = resolveDbService(c, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    const profile = await repo.getProfileByName(profileName);
    if (!profile) return c.json({ error: 'profile not found', profile: profileName }, 404);
    const pv = await repo.getProfileVersionByNumber(profile.id, versionNum);
    if (!pv) return c.json({ error: 'profile version not found', profile: profileName, version: versionNum }, 404);
    // Current model has no additional publish state; treat as validation-only "publish".
    return c.json({ profile: profileName, version: versionNum, published: true }, 200);
  }
}
