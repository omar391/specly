import type { Context } from 'hono';
import { getGlobalDatabaseService, GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { specs, tools, toolVersions } from '../database/schema/global-schema.js';
import { hashSpec, hashToolVersion } from '../utils/hash.js';
import { validateToolGraph, GraphValidationError } from '../utils/graph-validate.js';
import { mapGraphValidationToPublicError } from '../utils/graph-error-map.js';
import { validateSpecSecurity, validateCommandAliasUniqueness, validateGraphSizeLimits, validateGraphDepth, SecurityValidationError } from '../utils/security-validators.js';
import { eq } from 'drizzle-orm';
import { createSuccessResponse } from './middleware.js';

// Minimal Zod-like manual validation (avoid new dep): trust shapes; rely on DB + validator for safety.

// Allow per-request override (tests can inject isolated in-memory dbService via context)
function resolveDbService(c: Context, fallback: any): GlobalDatabaseService {
    const injected = (c as any).dbService;
    // Cases:
    // 1. Already a GlobalDatabaseService -> use directly
    if (injected instanceof GlobalDatabaseService) return injected;
    // 2. DatabaseService (app-level) -> extract global
    if (injected instanceof DatabaseService) return injected.getGlobal();
    // 3. DrizzleDatabaseManager passed -> wrap
    if (injected && typeof injected.getDb === 'function') return new GlobalDatabaseService(injected);
    // Fallback controller default (already a GlobalDatabaseService)
    return fallback;
}

export class SpecsController {
    constructor(private defaultDbService: GlobalDatabaseService = getGlobalDatabaseService()) { }

    async createSpec(c: Context) {
        const body = await c.req.json() || {};
        // Extract subset used for hashing to ensure determinism (mirror spec hashing expectations)
        const specForHash = {
            executor_type: body.executor_type,
            executor_version: body.executor_version,
            intent: body.intent,
            side_effect: !!body.side_effect,
            content_template: body.content_template ?? null,
            static_params: body.static_params ?? {},
            input_schema: body.input_schema ?? null,
            output_schema: body.output_schema ?? null,
            idempotency_key_template: body.idempotency_key_template ?? null,
            retry_policy: body.retry_policy ?? null,
            show_output: body.show_output ?? true,
            security: body.security ?? null,
            metadata: body.metadata ?? {}
        };
        if (!specForHash.executor_type || !specForHash.executor_version || !specForHash.intent) {
            return c.json({ error: 'Missing required spec fields', required: ['executor_type', 'executor_version', 'intent'] }, 400);
        }

        // SP-013: Security validation
        const securityErr = validateSpecSecurity(specForHash);
        if (securityErr) {
            return c.json({ error: securityErr.message, code: securityErr.code, details: securityErr.details }, 422);
        }

        const { hash } = hashSpec(specForHash);
        const dbService = resolveDbService(c, this.defaultDbService);
        await dbService.initialize();
        const mgr = dbService.getDrizzleManager();
        const db = mgr.getDb();
        // Check existing
        const existing = await db.select().from(specs).where(eq(specs.hash, hash)).limit(1);
        if (existing.length) {
            return c.json({ hash, created: false });
        }
        await db.insert(specs).values({
            hash,
            executorType: specForHash.executor_type,
            executorVersion: specForHash.executor_version,
            intent: specForHash.intent,
            sideEffect: specForHash.side_effect ? 1 : 0,
            contentTemplate: specForHash.content_template,
            staticParams: specForHash.static_params,
            inputSchema: specForHash.input_schema,
            outputSchema: specForHash.output_schema,
            idempotencyKeyTemplate: specForHash.idempotency_key_template,
            retryPolicy: specForHash.retry_policy,
            showOutput: specForHash.show_output ? 1 : 0,
            security: specForHash.security,
            metadata: specForHash.metadata
        } as any);
        return c.json({ hash, created: true }, 201);
    }
}

export class ToolsController {
    constructor(private defaultDbService: GlobalDatabaseService = getGlobalDatabaseService()) { }

    async createTool(c: Context) {
        const { name, description, command_alias } = await c.req.json() || {};
        if (!name) {
            return c.json({ error: 'name required' }, 400);
        }
        const dbService = resolveDbService(c, this.defaultDbService);
        await dbService.initialize();

        // SP-013: Validate command_alias uniqueness
        if (command_alias) {
            const aliasErr = await validateCommandAliasUniqueness(dbService, command_alias);
            if (aliasErr) {
                return c.json({ error: aliasErr.message, code: aliasErr.code, details: aliasErr.details }, 409);
            }
        }

        const db = dbService.getDrizzleManager().getDb();
        const existing = await db.select().from(tools).where(eq(tools.name, name)).limit(1);
        if (existing.length) {
            return c.json({ error: 'tool exists', name }, 409);
        }
        await db.insert(tools).values({ name, description, commandAlias: command_alias } as any);
        return c.json({ name, created: true }, 201);
    }

    async createToolVersion(c: Context) {
        const toolName = c.req.param('tool');
        const body = await c.req.json() || {};
        const ordered_specs = body.ordered_specs;
        const entry_spec = body.entry_spec;
        const edges = body.edges || [];
        if (!Array.isArray(ordered_specs) || !entry_spec) {
            return c.json({ error: 'ordered_specs[] and entry_spec required' }, 400);
        }
        const dbService = resolveDbService(c, this.defaultDbService);
        await dbService.initialize();
        const db = dbService.getDrizzleManager().getDb();
        // Tool existence optional? Enforce existence.
        const toolExists = await db.select().from(tools).where(eq(tools.name, toolName)).limit(1);
        if (!toolExists.length) {
            return c.json({ error: 'tool not found', tool: toolName }, 404);
        }

        // Validate all specs exist
        const specRows = await db.select({ hash: specs.hash }).from(specs);
        const specSet = new Set(specRows.map((r: { hash: string }) => r.hash));
        for (const h of ordered_specs) {
            if (!specSet.has(h)) {
                return c.json({ error: 'spec missing', spec: h, code: 'GRAPH_MISSING_NODE' }, 422);
            }
        }
        // SP-013: Graph size & depth validation
        const graphManifest = {
            ordered_specs,
            entry_spec,
            edges: edges.map((e: any) => ({ from: e.from, to: e.to, condition_type: e.condition_type || 'always', condition_value: e.condition_value, priority: e.priority }))
        };

        const sizeErr = validateGraphSizeLimits(graphManifest);
        if (sizeErr) {
            return c.json({ error: sizeErr.message, code: sizeErr.code, details: sizeErr.details }, 422);
        }

        const depthErr = validateGraphDepth(graphManifest);
        if (depthErr) {
            return c.json({ error: depthErr.message, code: depthErr.code, details: depthErr.details }, 422);
        }

        // Structural validation via existing validator (maps cycles/missing). Use try/catch.
        try {
            validateToolGraph(graphManifest);
        } catch (e: any) {
            if (e instanceof GraphValidationError) {
                const pub = mapGraphValidationToPublicError(e);
                return c.json({ error: e.message, code: pub.code }, 422);
            }
            return c.json({ error: 'validation failure', detail: e?.message }, 500);
        }
        const { hash } = hashToolVersion({ ordered_specs, edges, entry_spec, tool_name: toolName });
        const existing = await db.select().from(toolVersions).where(eq(toolVersions.hash, hash)).limit(1);
        if (existing.length) {
            return c.json({ hash, tool: toolName, created: false });
        }
        await db.insert(toolVersions).values({ hash, toolName, graphManifest: { ordered_specs, entry_spec, edges } } as any);
        return c.json({ hash, tool: toolName, created: true }, 201);
    }

    async getTools(c: Context) {
        const dbService = resolveDbService(c, this.defaultDbService);
        await dbService.initialize();
        const db = dbService.getDrizzleManager().getDb();
        const allTools = await db.select().from(tools);
        return c.json({ data: { tools: allTools } });
    }

    async getTool(c: Context) {
        const toolName = c.req.param('tool');
        const dbService = resolveDbService(c, this.defaultDbService);
        await dbService.initialize();
        const db = dbService.getDrizzleManager().getDb();
        const tool = await db.select().from(tools).where(eq(tools.name, toolName)).limit(1);
        if (!tool.length) {
            return c.json({ error: 'Tool not found' }, 404);
        }
        return c.json({ data: { tool: tool[0] } });
    }

    async getToolVersions(c: Context) {
        const toolName = c.req.param('tool');
        const dbService = resolveDbService(c, this.defaultDbService);
        await dbService.initialize();
        const db = dbService.getDrizzleManager().getDb();
        // Verify tool exists
        const toolExists = await db.select().from(tools).where(eq(tools.name, toolName)).limit(1);
        if (!toolExists.length) {
            return c.json({ error: 'Tool not found' }, 404);
        }
        const versions = await db.select().from(toolVersions).where(eq(toolVersions.toolName, toolName));
        return c.json({ data: { versions } });
    }
}
