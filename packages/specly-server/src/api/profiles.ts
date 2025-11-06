import { Request, Response } from 'express';
import { GlobalDatabaseService, getGlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { ProfileRepository } from '../repositories/profile-repository.js';
import { workspaces } from '../database/schema/global-schema.js';

// Local helper mirrors specs-tools resolve logic to support test-time DB injection
function resolveDbService(req: Request, fallback: GlobalDatabaseService): GlobalDatabaseService {
  const injected = (req.app?.locals as any)?.dbService;
  if (injected instanceof GlobalDatabaseService) return injected;
  if (injected instanceof DatabaseService) return injected.getGlobal();
  if (injected && typeof injected.getGlobal === 'function') return injected.getGlobal();
  if (injected && typeof injected.getDb === 'function') return new GlobalDatabaseService(injected);
  return fallback;
}

export class ProfilesController {
  constructor(private defaultDb: GlobalDatabaseService = getGlobalDatabaseService()) {}

  /** POST /api/profiles */
  async createProfile(req: Request, res: Response) {
    const { name, description, parent_profile_id } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name required' });
    }
    const db = resolveDbService(req, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    try {
      const result = await repo.createProfile({ name, description, parentProfileId: parent_profile_id ?? null });
      if (!result.created) {
        return res.status(409).json({ error: 'profile exists', name });
      }
      return res.status(201).json({ id: result.profile.id, name: result.profile.name, created: true });
    } catch (e: any) {
      return res.status(422).json({ error: e?.message || 'validation failed' });
    }
  }

  /** POST /api/profiles/:profile/versions */
  async createProfileVersion(req: Request, res: Response) {
    const profileName = req.params.profile;
    const { parent_profile_version_id } = req.body || {};
    if (!profileName) return res.status(400).json({ error: 'profile param required' });
    const db = resolveDbService(req, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    const profile = await repo.getProfileByName(profileName);
    if (!profile) return res.status(404).json({ error: 'profile not found', profile: profileName });
    try {
      const created = await repo.createProfileVersion({ profileId: profile.id, parentProfileVersionId: parent_profile_version_id ?? null });
      return res.status(201).json({ id: created.id, version: created.version, created: true });
    } catch (e: any) {
      const msg = String(e?.message || 'validation failed');
      if (/not found|different profile|Cycle detected|exceeded max depth/i.test(msg)) {
        return res.status(422).json({ error: msg });
      }
      return res.status(500).json({ error: 'failed to create profile version' });
    }
  }

  /** POST /api/workspaces/:workspaceId/profile/upgrade */
  async upgradeWorkspaceProfile(req: Request, res: Response) {
    const { workspaceId } = req.params as { workspaceId: string };
    const { profile, version } = req.body || {};
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    const db = resolveDbService(req, this.defaultDb);
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
    if (!wsExists) return res.status(404).json({ error: 'workspace not found', workspaceId });

    const repo = new ProfileRepository(db);
    if (!profile || typeof profile !== 'string') {
      return res.status(400).json({ error: 'profile name required in body' });
    }
    const p = await repo.getProfileByName(profile);
    if (!p) return res.status(404).json({ error: 'profile not found', profile });
    const versions = await repo.listProfileVersions(p.id);
    if (!versions.length) return res.status(409).json({ error: 'no profile versions to bind', profile });
    let target = versions[0]; // listProfileVersions returns desc order
    if (typeof version === 'number') {
      const found = versions.find(v => v.version === version);
      if (!found) return res.status(404).json({ error: 'profile version not found', profile, version });
      target = found as any;
    }
    const binding = await repo.bindWorkspaceProfile(workspaceId, (target as any).id);
    return res.status(200).json({ workspace_id: binding.workspaceId, profile_version_id: binding.profileVersionId, pinned_at: binding.pinnedAt });
  }

  /** GET /api/workspaces/:workspaceId/profile */
  async getWorkspaceProfile(req: Request, res: Response) {
    const { workspaceId } = req.params as { workspaceId: string };
    const db = resolveDbService(req, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    // Prefer enriched details for UI
    const binding = await repo.getWorkspaceBindingDetails(workspaceId);
    if (!binding) return res.status(404).json({ error: 'workspace profile not bound', workspaceId });
    return res.status(200).json({
      workspace_id: binding.workspaceId,
      profile_version_id: binding.profileVersionId,
      pinned_at: binding.pinnedAt,
      profile_name: (binding as any).profileName,
      version: (binding as any).profileVersion,
    });
  }

  /** POST /api/profiles/:profile/versions/:version/attachments */
  async attachTools(req: Request, res: Response) {
    const profileName = req.params.profile;
    const versionNum = Number(req.params.version);
    const { attachments } = req.body || {};
    if (!profileName || Number.isNaN(versionNum)) return res.status(400).json({ error: 'profile and numeric version required' });
    if (!Array.isArray(attachments) || attachments.length === 0) return res.status(400).json({ error: 'attachments[] required' });
    const db = resolveDbService(req, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    const profile = await repo.getProfileByName(profileName);
    if (!profile) return res.status(404).json({ error: 'profile not found', profile: profileName });
    const pv = await repo.getProfileVersionByNumber(profile.id, versionNum);
    if (!pv) return res.status(404).json({ error: 'profile version not found', profile: profileName, version: versionNum });
    const results: Array<{ tool: string; created: boolean } > = [];
    for (const item of attachments) {
      const { tool_name, tool_version_hash, command_alias } = item || {};
      if (!tool_name || !tool_version_hash) {
        return res.status(400).json({ error: 'tool_name and tool_version_hash required for each attachment' });
      }
      try {
        const r = await repo.attachToolToProfileVersion({ profileVersionId: pv.id, toolName: tool_name, toolVersionHash: tool_version_hash, commandAlias: command_alias ?? null });
        results.push({ tool: tool_name, created: r.created });
      } catch (e: any) {
        return res.status(422).json({ error: e?.message || 'attach failed', tool_name });
      }
    }
    const list = await repo.listProfileVersionAttachments(pv.id);
    return res.status(201).json({ profile: profileName, version: versionNum, attached: results, attachments: list });
  }

  /** GET /api/profiles/:profile/versions/:version/attachments */
  async getAttachments(req: Request, res: Response) {
    const profileName = req.params.profile;
    const versionNum = Number(req.params.version);
    if (!profileName || Number.isNaN(versionNum)) return res.status(400).json({ error: 'profile and numeric version required' });
    const db = resolveDbService(req, this.defaultDb);
    await db.initialize();
    const repo = new ProfileRepository(db);
    const profile = await repo.getProfileByName(profileName);
    if (!profile) return res.status(404).json({ error: 'profile not found', profile: profileName });
    const pv = await repo.getProfileVersionByNumber(profile.id, versionNum);
    if (!pv) return res.status(404).json({ error: 'profile version not found', profile: profileName, version: versionNum });
    const list = await repo.listProfileVersionAttachments(pv.id);
    return res.status(200).json({ profile: profileName, version: versionNum, attachments: list });
  }

    /** POST /api/profiles/:profile/versions/:version/publish */
    async publishProfileVersion(req: Request, res: Response) {
        const profileName = req.params.profile;
        const versionNum = Number(req.params.version);
        if (!profileName || Number.isNaN(versionNum)) {
            return res.status(400).json({ error: 'profile and numeric version required' });
        }
        const db = resolveDbService(req, this.defaultDb);
        await db.initialize();
        const repo = new ProfileRepository(db);
        const profile = await repo.getProfileByName(profileName);
        if (!profile) return res.status(404).json({ error: 'profile not found', profile: profileName });
        const pv = await repo.getProfileVersionByNumber(profile.id, versionNum);
        if (!pv) return res.status(404).json({ error: 'profile version not found', profile: profileName, version: versionNum });
        // Current model has no additional publish state; treat as validation-only "publish".
        return res.status(200).json({ profile: profileName, version: versionNum, published: true });
    }
}
