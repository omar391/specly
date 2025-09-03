import { GlobalDatabaseService } from "../database/global-queries.js";
import { specs, toolVersions, tools } from "../database/schema/global-schema.js";
import { eq } from "drizzle-orm";
import { hashSpec, hashToolVersion } from "../utils/hash.js";

export interface CreateSpecInput {
  executorType: string;
  executorVersion: string;
  intent: 'human' | 'autonomous';
  sideEffect?: boolean;
  contentTemplate?: string;
  staticParams?: any;
  inputSchema?: any;
  outputSchema?: any;
  idempotencyKeyTemplate?: string;
  retryPolicy?: any;
  showOutput?: boolean;
  security?: any;
  metadata?: any;
}

export interface CreateToolVersionInput {
  toolName: string;
  ordered_specs: string[]; // array of spec hashes
  edges: Array<{ from: string; to: string; priority?: number }>;
  entry_spec: string; // spec hash that is entry point
}

export interface SpecRepository {
  createOrGet(input: CreateSpecInput): Promise<{ hash: string; created: boolean }>; 
  get(hash: string): Promise<any | null>;
}

export interface ToolVersionRepository {
  create(input: CreateToolVersionInput): Promise<{ hash: string; created: boolean }>;
  get(hash: string): Promise<any | null>;
  listByTool(toolName: string): Promise<any[]>;
}

export class SpecRepositoryImpl implements SpecRepository {
  constructor(private globalDb: GlobalDatabaseService) {}

  async createOrGet(input: CreateSpecInput): Promise<{ hash: string; created: boolean }> {
    const { hash, canonical } = hashSpec({
      executor_type: input.executorType,
      executor_version: input.executorVersion,
      intent: input.intent,
      side_effect: !!input.sideEffect,
      content_template: input.contentTemplate ?? null,
      static_params: input.staticParams ?? {},
      input_schema: input.inputSchema ?? null,
      output_schema: input.outputSchema ?? null,
      idempotency_key_template: input.idempotencyKeyTemplate ?? null,
      retry_policy: input.retryPolicy ?? null,
      show_output: input.showOutput !== false,
      security: input.security ?? null,
      metadata: input.metadata ?? {}
    });

    const db = this.globalDb.getDrizzleManager().getDb();
    const existing = await db.select().from(specs).where(eq(specs.hash, hash)).limit(1);
    if (existing.length > 0) {
      return { hash, created: false };
    }
    await db.insert(specs).values({
      hash,
      executorType: input.executorType,
      executorVersion: input.executorVersion,
      intent: input.intent,
      sideEffect: input.sideEffect ? 1 : 0,
      contentTemplate: input.contentTemplate ?? null,
      staticParams: JSON.stringify(input.staticParams ?? {}),
      inputSchema: input.inputSchema ? JSON.stringify(input.inputSchema) : null,
      outputSchema: input.outputSchema ? JSON.stringify(input.outputSchema) : null,
      idempotencyKeyTemplate: input.idempotencyKeyTemplate ?? null,
      retryPolicy: input.retryPolicy ? JSON.stringify(input.retryPolicy) : null,
      showOutput: input.showOutput === false ? 0 : 1,
      security: input.security ? JSON.stringify(input.security) : null,
      metadata: JSON.stringify(input.metadata ?? {})
    } as any);
    return { hash, created: true };
  }

  async get(hash: string): Promise<any | null> {
    const db = this.globalDb.getDrizzleManager().getDb();
    const [row] = await db.select().from(specs).where(eq(specs.hash, hash)).limit(1);
    return row || null;
  }
}

export class ToolVersionRepositoryImpl implements ToolVersionRepository {
  constructor(private globalDb: GlobalDatabaseService) {}

  async create(input: CreateToolVersionInput): Promise<{ hash: string; created: boolean }> {
    // Hash includes ordered_specs + edges + entry_spec
    const { hash } = hashToolVersion({
      ordered_specs: input.ordered_specs,
      edges: input.edges,
      entry_spec: input.entry_spec,
      tool_name: input.toolName
    });
    const db = this.globalDb.getDrizzleManager().getDb();
    const existing = await db.select().from(toolVersions).where(eq(toolVersions.hash, hash)).limit(1);
    if (existing.length > 0) {
      return { hash, created: false };
    }
    // Ensure tool exists (create if missing minimal row)
    const existingTool = await db.select().from(tools).where(eq(tools.name, input.toolName)).limit(1);
    if (existingTool.length === 0) {
      await db.insert(tools).values({ name: input.toolName, description: null } as any);
    }
    await db.insert(toolVersions).values({
      hash,
      toolName: input.toolName,
      graphManifest: JSON.stringify({
        ordered_specs: input.ordered_specs,
        edges: input.edges,
        entry_spec: input.entry_spec
      })
    } as any);
    return { hash, created: true };
  }

  async get(hash: string): Promise<any | null> {
    const db = this.globalDb.getDrizzleManager().getDb();
    const [row] = await db.select().from(toolVersions).where(eq(toolVersions.hash, hash)).limit(1);
    return row || null;
  }

  async listByTool(toolName: string): Promise<any[]> {
    const db = this.globalDb.getDrizzleManager().getDb();
    return db.select().from(toolVersions).where(eq(toolVersions.toolName, toolName));
  }
}
