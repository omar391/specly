import { GlobalDatabaseService } from "../database/global-queries.js";
import { profiles, profileVersions, profileVersionTools, workspaceProfileVersions, tools, toolVersions } from "../database/schema/global-schema.js";
import { and, eq, desc } from "drizzle-orm";
import crypto from "crypto";

export interface CreateProfileInput {
  name: string;
  description?: string | null;
  parentProfileId?: string | null;
}

export interface ProfileRecord {
  id: string;
  name: string;
  description: string | null;
  parentProfileId: string | null;
  createdAt: string | null;
}

export interface CreateProfileVersionInput {
  profileId: string;
  parentProfileVersionId?: string | null;
}

export interface AttachToolToProfileVersionInput {
  profileVersionId: string;
  toolName: string;
  toolVersionHash: string;
  commandAlias?: string | null;
  inheritedFromProfileVersionId?: string | null;
}

export interface WorkspaceProfileBindingResult {
  workspaceId: string;
  profileVersionId: string;
  pinnedAt: string | null;
}

export class ProfileRepository {
  constructor(private globalDb: GlobalDatabaseService) {}

  private uuid(): string { return crypto.randomUUID(); }

  async createProfile(input: CreateProfileInput): Promise<{ profile: ProfileRecord; created: boolean }> {
    const db = this.globalDb.getDrizzleManager().getDb();
    const existing = await db.select().from(profiles).where(eq(profiles.name, input.name)).limit(1);
    if (existing.length > 0) {
      return { profile: existing[0] as any, created: false };
    }
    if (input.parentProfileId) {
      const parent = await db.select().from(profiles).where(eq(profiles.id, input.parentProfileId)).limit(1);
      if (parent.length === 0) {
        throw new Error('Parent profile not found');
      }
      // Simple cycle check: parentProfileId must not itself have parent pointing to new name's future id (can't fully check since new id not linked elsewhere)
      if (parent[0].parentProfileId === parent[0].id) {
        throw new Error('Cycle detected in profile parent chain');
      }
    }
    const id = this.uuid();
    const [row] = await db.insert(profiles).values({
      id,
      name: input.name,
      description: input.description ?? null,
      parentProfileId: input.parentProfileId ?? null
    }).returning();
    return { profile: row as any, created: true };
  }

  async getProfileByName(name: string): Promise<ProfileRecord | null> {
    const db = this.globalDb.getDrizzleManager().getDb();
    const [row] = await db.select().from(profiles).where(eq(profiles.name, name)).limit(1);
    return (row as any) || null;
  }

  async createProfileVersion(input: CreateProfileVersionInput): Promise<{ id: string; version: number; created: boolean }> {
    const db = this.globalDb.getDrizzleManager().getDb();
    // get current max version
    const rows = await db.select().from(profileVersions).where(eq(profileVersions.profileId, input.profileId)).orderBy(desc(profileVersions.version)).limit(1);
    const nextVersion = rows.length === 0 ? 1 : (rows[0].version as number) + 1;
    const id = this.uuid();
    const [row] = await db.insert(profileVersions).values({
      id,
      profileId: input.profileId,
      parentProfileVersionId: input.parentProfileVersionId ?? null,
      version: nextVersion
    }).returning();
    return { id: row.id, version: row.version, created: true };
  }

  async attachToolToProfileVersion(input: AttachToolToProfileVersionInput): Promise<{ id: string; created: boolean }> {
    const db = this.globalDb.getDrizzleManager().getDb();
    // verify tool + tool version exist
    const [tool] = await db.select().from(tools).where(eq(tools.name, input.toolName)).limit(1);
    if (!tool) throw new Error('Tool not found');
    const [tv] = await db.select().from(toolVersions).where(eq(toolVersions.hash, input.toolVersionHash)).limit(1);
    if (!tv) throw new Error('Tool version not found');
    // ensure not duplicate mapping
    const existing = await db.select().from(profileVersionTools).where(and(eq(profileVersionTools.profileVersionId, input.profileVersionId), eq(profileVersionTools.toolName, input.toolName))).limit(1);
    if (existing.length > 0) {
      return { id: existing[0].id, created: false };
    }
    const id = this.uuid();
    const [row] = await db.insert(profileVersionTools).values({
      id,
      profileVersionId: input.profileVersionId,
      toolName: input.toolName,
      toolVersionHash: input.toolVersionHash,
      commandAlias: input.commandAlias ?? null,
      inheritedFromProfileVersionId: input.inheritedFromProfileVersionId ?? null
    }).returning();
    return { id: row.id, created: true };
  }

  async bindWorkspaceProfile(workspaceId: string, profileVersionId: string): Promise<WorkspaceProfileBindingResult> {
    const db = this.globalDb.getDrizzleManager().getDb();
    // upsert semantics: delete existing then insert
    await db.delete(workspaceProfileVersions).where(eq(workspaceProfileVersions.workspaceId, workspaceId));
    const [row] = await db.insert(workspaceProfileVersions).values({
      workspaceId,
      profileVersionId
    }).returning();
    return row as any;
  }

  async getWorkspaceBinding(workspaceId: string): Promise<WorkspaceProfileBindingResult | null> {
    const db = this.globalDb.getDrizzleManager().getDb();
    const [row] = await db.select().from(workspaceProfileVersions).where(eq(workspaceProfileVersions.workspaceId, workspaceId)).limit(1);
    return (row as any) || null;
  }

  async listProfileVersions(profileId: string): Promise<any[]> {
    const db = this.globalDb.getDrizzleManager().getDb();
    return db.select().from(profileVersions).where(eq(profileVersions.profileId, profileId)).orderBy(desc(profileVersions.version));
  }

  async getProfileVersionByNumber(profileId: string, version: number): Promise<{ id: string; version: number } | null> {
    const db = this.globalDb.getDrizzleManager().getDb();
    const [row] = await db
      .select({ id: profileVersions.id, version: profileVersions.version })
      .from(profileVersions)
      .where(and(eq(profileVersions.profileId, profileId), eq(profileVersions.version, version)))
      .limit(1);
    return (row as any) || null;
  }

  async listProfileVersionAttachments(profileVersionId: string): Promise<Array<{ id: string; toolName: string; toolVersionHash: string; commandAlias: string | null; inheritedFromProfileVersionId: string | null }>> {
    const db = this.globalDb.getDrizzleManager().getDb();
    const rows = await db
      .select({
        id: profileVersionTools.id,
        toolName: profileVersionTools.toolName,
        toolVersionHash: profileVersionTools.toolVersionHash,
        commandAlias: profileVersionTools.commandAlias,
        inheritedFromProfileVersionId: profileVersionTools.inheritedFromProfileVersionId
      })
      .from(profileVersionTools)
      .where(eq(profileVersionTools.profileVersionId, profileVersionId));
    return rows as any;
  }
}
