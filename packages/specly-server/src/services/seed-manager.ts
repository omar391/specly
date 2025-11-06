import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { mcpServerMappings, type NewMcpServerMapping, workspaces } from '../database/schema/global-schema.js';
import { MCP_SERVER_MAPPINGS_SEED, SPECLY_SEED_SPECS, SPECLY_SEED_TOOLS, SPECLY_ROOT_PROFILE } from '../data/embedded-seed-data.js';
import { SpecRepositoryImpl, ToolVersionRepositoryImpl } from '../repositories/spec-repository.js';
import { ProfileRepository } from '../repositories/profile-repository.js';
import { isStdioMode } from '@omar391/mcp-kit/utils/cli-parser';
/**
 * Pure TypeScript/Drizzle ORM seed manager
 * Eliminates custom SQL and JSON, uses type-safe Drizzle operations
 */
export class SeedManager {
  private drizzleDb: ReturnType<DrizzleDatabaseManager['getDb']>;

  constructor(private dbManager: DrizzleDatabaseManager) {
    this.drizzleDb = this.dbManager.getDb();
  }

  /**
   * Initialize global seed data using pure Drizzle ORM operations
   */
  async initializeGlobalData(): Promise<void> {
    try {
      // Clear only mappings we still support; legacy tool flow constructs removed.
      await this.drizzleDb.delete(mcpServerMappings);
      await this.drizzleDb.insert(mcpServerMappings).values(MCP_SERVER_MAPPINGS_SEED as NewMcpServerMapping[]);
      if (!isStdioMode()) {
        console.log('Global MCP server mappings seeded (Specly mode)');
      }
    } catch (error) {
      console.error('Error initializing global data:', error);
      throw error;
    }
  }

  /**
   * Seed Specly specs, tool versions, root profile, and workspace bindings (idempotent).
   */
  async seedSpecly(): Promise<{
    specsCreated: number; toolVersionsCreated: number; profileCreated: boolean; profileVersionsCreated: number; toolsAttached: number; workspaceBindings: number; createdSpecHashes: string[]; createdToolVersionHashes: string[];
  }> {
    const specRepo = new SpecRepositoryImpl({ getDrizzleManager: () => ({ getDb: () => this.drizzleDb }) } as any);
    const toolVersionRepo = new ToolVersionRepositoryImpl({ getDrizzleManager: () => ({ getDb: () => this.drizzleDb }) } as any);
    const profileRepo = new ProfileRepository({ getDrizzleManager: () => ({ getDb: () => this.drizzleDb }) } as any);

    // 1. Specs
    const specHashMap = new Map<string, string>();
    let specsCreated = 0;
    // Deterministic ordering by key to keep logs stable
    for (const def of [...SPECLY_SEED_SPECS].sort((a, b) => a.key.localeCompare(b.key))) {
      const res = await specRepo.createOrGet(def.spec);
      if (res.created) specsCreated++;
      specHashMap.set(def.key, res.hash);
    }
    const createdSpecHashes: string[] = specsCreated > 0 ? [...specHashMap.values()] : [];

    // 2. Tool Versions
    let toolVersionsCreated = 0;
    const createdToolVersionHashes: string[] = [];
    for (const tool of [...SPECLY_SEED_TOOLS].sort((a, b) => a.toolName.localeCompare(b.toolName))) {
      const ordered_specs = tool.specKeys.map(k => specHashMap.get(k)!);
      const entry_spec = specHashMap.get(tool.entrySpecKey)!;
      const res = await toolVersionRepo.create({ toolName: tool.toolName, ordered_specs, entry_spec, edges: tool.edges ?? [] });
      if (res.created) toolVersionsCreated++;
      if (res.created) createdToolVersionHashes.push(res.hash);
    }

    // 3. Root Profile + version
    const profileRes = await profileRepo.createProfile({ name: SPECLY_ROOT_PROFILE.profileName, description: SPECLY_ROOT_PROFILE.description });
    let profileVersionsCreated = 0;
    let toolsAttached = 0;
    let targetProfileVersionId: string | null = null;
    if (profileRes.created) {
      const v = await profileRepo.createProfileVersion({ profileId: profileRes.profile.id });
      targetProfileVersionId = v.id;
      profileVersionsCreated++;
      for (const toolName of SPECLY_ROOT_PROFILE.toolNames) {
        const versions = await toolVersionRepo.listByTool(toolName);
        if (versions.length === 0) continue;
        const latest = versions[versions.length - 1];
        const attach = await profileRepo.attachToolToProfileVersion({ profileVersionId: v.id, toolName, toolVersionHash: latest.hash });
        if (attach.created) toolsAttached++;
      }
    } else {
      // Fetch latest existing profile version id to support binding new workspaces
      const existingProfile = await profileRepo.getProfileByName(SPECLY_ROOT_PROFILE.profileName);
      if (existingProfile) {
        const versions = await profileRepo.listProfileVersions(existingProfile.id);
        if (versions.length > 0) targetProfileVersionId = versions[0].id; // listProfileVersions returns desc order
      }
    }

    // Always bind all workspaces to latest profile version if we have one
    const existingWorkspaces = await this.drizzleDb.select().from(workspaces);
    if (targetProfileVersionId) {
      for (const ws of existingWorkspaces) {
        await profileRepo.bindWorkspaceProfile(ws.id, targetProfileVersionId);
      }
    }
    const workspaceBindings = targetProfileVersionId ? existingWorkspaces.length : 0;

    // Logging responsibility lifted to caller (server startup or script) to avoid duplication.

    return { specsCreated, toolVersionsCreated, profileCreated: profileRes.created, profileVersionsCreated, toolsAttached, workspaceBindings, createdSpecHashes, createdToolVersionHashes };
  }
}