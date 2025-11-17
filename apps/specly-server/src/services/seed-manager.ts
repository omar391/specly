import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { mcpServerMappings, type NewMcpServerMapping, workspaces, specs, toolVersions, tools, profileVersionTools, workspaceProfileVersions } from '../database/schema/global-schema.js';
import { MCP_SERVER_MAPPINGS_SEED, SPECLY_SEED_SPECS, SPECLY_SEED_TOOLS, SPECLY_ROOT_PROFILE } from '../data/embedded-seed-data.js';
import { SpecRepositoryImpl, ToolVersionRepositoryImpl } from '../repositories/spec-repository.js';
import { ProfileRepository } from '../repositories/profile-repository.js';
import { isStdioMode } from '@omar391/mcp-kit/utils/cli-parser';
import { hashSpec, hashToolVersion } from '../utils/hash.js';
import { eq } from 'drizzle-orm';
/**
 * Pure TypeScript/Drizzle ORM seed manager
 * Eliminates custom SQL and JSON, uses type-safe Drizzle operations
 */
export class SeedManager {
  private drizzleDb: ReturnType<DrizzleDatabaseManager['getDb']>;

  constructor(private dbManager: DrizzleDatabaseManager, private profileRepo?: ProfileRepository, private specRepo?: SpecRepositoryImpl, private toolVersionRepo?: ToolVersionRepositoryImpl) {
    this.drizzleDb = this.dbManager.getDb();
  }

  /**
   * Create default spec repository when not provided
   */
  private createDefaultSpecRepo(): SpecRepositoryImpl {
    const globalDbService = new GlobalDatabaseService(this.dbManager);
    return new SpecRepositoryImpl(globalDbService);
  }

  /**
   * Create default tool version repository when not provided
   */
  private createDefaultToolVersionRepo(): ToolVersionRepositoryImpl {
    const globalDbService = new GlobalDatabaseService(this.dbManager);
    return new ToolVersionRepositoryImpl(globalDbService);
  }

  /**
   * Initialize global seed data using pure Drizzle ORM operations
   */
  async initializeGlobalData(): Promise<void> {
    try {
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
   * Optimized with batch operations for better performance.
   */
  async seedSpecly(): Promise<{
    specsCreated: number; toolVersionsCreated: number; profileCreated: boolean; profileVersionsCreated: number; toolsAttached: number; workspaceBindings: number; createdSpecHashes: string[]; createdToolVersionHashes: string[];
  }> {
    const specRepo = this.specRepo || this.createDefaultSpecRepo();
    const toolVersionRepo = this.toolVersionRepo || this.createDefaultToolVersionRepo();
    const globalDbService = new GlobalDatabaseService(this.dbManager);
    await globalDbService.initialize();
    const profileRepo = this.profileRepo || new ProfileRepository(globalDbService);

    // 1. Batch create specs
    const specHashMap = new Map<string, string>();
    let specsCreated = 0;
    const createdSpecHashes: string[] = [];

    // First, check which specs already exist to avoid duplicates
    const existingSpecs = await this.drizzleDb.select().from(specs);
    const existingSpecHashes = new Set(existingSpecs.map(s => s.hash));

    // Create specs that don't exist
    const specsToCreate = [];
    for (const specDef of SPECLY_SEED_SPECS) {
      const { hash } = hashSpec({
        executor_type: specDef.spec.executorType,
        executor_version: specDef.spec.executorVersion,
        intent: specDef.spec.intent,
        side_effect: !!specDef.spec.sideEffect,
        content_template: specDef.spec.contentTemplate ?? null,
        static_params: specDef.spec.staticParams ?? {},
        input_schema: specDef.spec.inputSchema ?? null,
        output_schema: specDef.spec.outputSchema ?? null,
        idempotency_key_template: specDef.spec.idempotencyKeyTemplate ?? null,
        retry_policy: specDef.spec.retryPolicy ?? null,
        show_output: specDef.spec.showOutput !== false,
        security: specDef.spec.security ?? null,
        metadata: specDef.spec.metadata ?? {}
      });
      if (!existingSpecHashes.has(hash)) {
        specsToCreate.push({ ...specDef.spec, hash });
      }
      specHashMap.set(specDef.key, hash);
    }

    // 2. Batch create tool versions
    let toolVersionsCreated = 0;
    const createdToolVersionHashes: string[] = [];

    // First, ensure tools exist
    const toolNames = new Set(SPECLY_SEED_TOOLS.map(t => t.toolName));
    const existingTools = await this.drizzleDb.select().from(tools);
    const existingToolNames = new Set(existingTools.map(t => t.name));
    const toolsToCreate = Array.from(toolNames).filter(name => !existingToolNames.has(name)).map(name => ({ name, commandAlias: null as string | null }));
    if (toolsToCreate.length > 0) {
      await this.drizzleDb.insert(tools).values(toolsToCreate);
    }

    // Check existing tool versions
    const existingToolVersions = await this.drizzleDb.select().from(toolVersions);
    const existingToolVersionHashes = new Set(existingToolVersions.map(tv => tv.hash));

    // Prepare tool versions to create
    const toolVersionsToCreate = [];
    for (const tool of SPECLY_SEED_TOOLS) {
      const ordered_specs = tool.specKeys.map(k => specHashMap.get(k)!);
      const entry_spec = specHashMap.get(tool.entrySpecKey)!;
      const graphManifest = {
        ordered_specs: ordered_specs,
        edges: tool.edges ?? [],
        entry_spec
      };

      // Check if this tool version already exists by computing hash
      const hashInput = {
        ordered_specs: ordered_specs,
        edges: tool.edges ?? []
      };
      const { hash } = hashToolVersion(hashInput);
      if (!existingToolVersionHashes.has(hash)) {
        toolVersionsToCreate.push({
          hash,
          toolName: tool.toolName,
          graphManifest: JSON.stringify(graphManifest)
        });
      }
    }

    // Batch insert new tool versions
    if (toolVersionsToCreate.length > 0) {
      await this.drizzleDb.insert(toolVersions).values(toolVersionsToCreate);
      toolVersionsCreated = toolVersionsToCreate.length;
      createdToolVersionHashes.push(...toolVersionsToCreate.map(tv => tv.hash));
    }

    // Update specsCreated
    specsCreated = specsToCreate.length;

    // Batch insert new specs
    if (specsToCreate.length > 0) {
      await this.drizzleDb.insert(specs).values(specsToCreate);
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

      // Batch attach tools to profile version
      const toolAttachments = [];
      for (const toolName of SPECLY_ROOT_PROFILE.toolNames) {
        const versions = await toolVersionRepo.listByTool(toolName);
        if (versions.length === 0) continue;
        const latest = versions[versions.length - 1];
        toolAttachments.push({
          profileVersionId: v.id,
          toolName: toolName,
          toolVersionHash: latest.hash
        });
      }

      if (toolAttachments.length > 0) {
        // Check existing attachments to avoid duplicates
        const existingAttachments = await this.drizzleDb
          .select()
          .from(profileVersionTools)
          .where(eq(profileVersionTools.profileVersionId, v.id));

        const existingKeys = new Set(
          existingAttachments.map(att => `${att.toolName}:${att.toolVersionHash}`)
        );

        const newAttachments = toolAttachments.filter(att =>
          !existingKeys.has(`${att.toolName}:${att.toolVersionHash}`)
        );

        if (newAttachments.length > 0) {
          const attachmentsWithIds = newAttachments.map(att => ({
            id: crypto.randomUUID(),
            ...att
          }));
          await this.drizzleDb.insert(profileVersionTools).values(attachmentsWithIds);
          toolsAttached = newAttachments.length;
        }
      }
    } else {
      // Fetch latest existing profile version id to support binding new workspaces
      const existingProfile = await profileRepo.getProfileByName(SPECLY_ROOT_PROFILE.profileName);
      if (existingProfile) {
        const versions = await profileRepo.listProfileVersions(existingProfile.id);
        if (versions.length > 0) targetProfileVersionId = versions[0].id; // listProfileVersions returns desc order
      }
    }

    // 4. Batch bind workspaces to profile version
    let workspaceBindings = 0;
    if (targetProfileVersionId) {
      const existingWorkspaces = await this.drizzleDb.select().from(workspaces);

      // Check existing bindings
      const existingBindings = await this.drizzleDb
        .select()
        .from(workspaceProfileVersions)
        .where(eq(workspaceProfileVersions.profileVersionId, targetProfileVersionId));

      const boundWorkspaceIds = new Set(existingBindings.map(b => b.workspaceId));

      // Create bindings for workspaces not already bound
      const newBindings = existingWorkspaces
        .filter(ws => !boundWorkspaceIds.has(ws.id))
        .map(ws => ({
          workspaceId: ws.id,
          profileVersionId: targetProfileVersionId!
        }));

      if (newBindings.length > 0) {
        await this.drizzleDb.insert(workspaceProfileVersions).values(newBindings);
        workspaceBindings = newBindings.length;
      }
    }

    return { specsCreated, toolVersionsCreated, profileCreated: profileRes.created, profileVersionsCreated, toolsAttached, workspaceBindings, createdSpecHashes, createdToolVersionHashes };
  }
}