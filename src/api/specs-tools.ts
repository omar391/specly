import { Request, Response } from 'express';
import { getGlobalDatabaseService, GlobalDatabaseService } from '../database/global-queries.js';
import { DatabaseService } from '../services/database-service.js';
import { specs, tools, toolVersions } from '../database/schema/global-schema.js';
import { hashSpec, hashToolVersion } from '../utils/hash.js';
import { validateToolGraph, GraphValidationError } from '../utils/graph-validate.js';
import { eq } from 'drizzle-orm';

// Minimal Zod-like manual validation (avoid new dep): trust shapes; rely on DB + validator for safety.

// Allow per-request override (tests can inject isolated in-memory dbService via req.app.locals.dbService)
function resolveDbService(req: Request, fallback: any): GlobalDatabaseService {
    const injected = (req.app?.locals as any)?.dbService;
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

    async createSpec(req: Request, res: Response) {
        const body = req.body || {};
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
            return res.status(400).json({ error: 'Missing required spec fields', required: ['executor_type', 'executor_version', 'intent'] });
        }
        const { hash } = hashSpec(specForHash);
        const dbService = resolveDbService(req, this.defaultDbService);
        await dbService.initialize();
        const mgr = dbService.getDrizzleManager();
        const db = mgr.getDb();
        // Check existing
        const existing = await db.select().from(specs).where(eq(specs.hash, hash)).limit(1);
        if (existing.length) {
            return res.status(200).json({ hash, created: false });
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
        return res.status(201).json({ hash, created: true });
    }
}

export class ToolsController {
    constructor(private defaultDbService: GlobalDatabaseService = getGlobalDatabaseService()) { }

    async createTool(req: Request, res: Response) {
        const { name, description, command_alias } = req.body || {};
        if (!name) return res.status(400).json({ error: 'name required' });
        const dbService = resolveDbService(req, this.defaultDbService);
        await dbService.initialize();
        const db = dbService.getDrizzleManager().getDb();
        const existing = await db.select().from(tools).where(eq(tools.name, name)).limit(1);
        if (existing.length) return res.status(409).json({ error: 'tool exists', name });
        await db.insert(tools).values({ name, description, commandAlias: command_alias } as any);
        return res.status(201).json({ name, created: true });
    }

    async createToolVersion(req: Request, res: Response) {
        const toolName = req.params.tool;
        const body = req.body || {};
        const ordered_specs = body.ordered_specs;
        const entry_spec = body.entry_spec;
        const edges = body.edges || [];
        if (!Array.isArray(ordered_specs) || !entry_spec) {
            return res.status(400).json({ error: 'ordered_specs[] and entry_spec required' });
        }
        const dbService = resolveDbService(req, this.defaultDbService);
        await dbService.initialize();
        const db = dbService.getDrizzleManager().getDb();
        // Tool existence optional? Enforce existence.
        const toolExists = await db.select().from(tools).where(eq(tools.name, toolName)).limit(1);
        if (!toolExists.length) return res.status(404).json({ error: 'tool not found', tool: toolName });

        // Validate all specs exist
        const specRows = await db.select({ hash: specs.hash }).from(specs);
        const specSet = new Set(specRows.map((r: { hash: string }) => r.hash));
        for (const h of ordered_specs) {
            if (!specSet.has(h)) return res.status(422).json({ error: 'spec missing', spec: h, code: 'GRAPH_MISSING_NODE' });
        }
        // Structural validation via existing validator (maps cycles/missing). Use try/catch.
        try {
            validateToolGraph({ ordered_specs, entry_spec, edges: edges.map((e: any) => ({ from: e.from, to: e.to, condition_type: e.condition_type || 'always', condition_value: e.condition_value, priority: e.priority })) });
        } catch (e: any) {
            if (e instanceof GraphValidationError) {
                // Map internal validator codes to public API graph codes
                // Cycle-related
                if (e.code === 'ERR_CYCLE' || e.code === 'ERR_SELF_LOOP') {
                    return res.status(422).json({ error: e.message, code: 'GRAPH_CYCLE' });
                }
                // Missing / undeclared spec references
                if (e.code === 'ERR_UNDECLARED_SPEC' || e.code === 'ERR_ENTRY_NOT_DECLARED') {
                    return res.status(422).json({ error: e.message, code: 'GRAPH_MISSING_NODE' });
                }
                // Duplicate spec or priority invalid etc -> generic invalid
                return res.status(422).json({ error: e.message, code: 'GRAPH_INVALID' });
            }
            return res.status(500).json({ error: 'validation failure', detail: e?.message });
        }
        const { hash } = hashToolVersion({ ordered_specs, edges, entry_spec, tool_name: toolName });
        const existing = await db.select().from(toolVersions).where(eq(toolVersions.hash, hash)).limit(1);
        if (existing.length) return res.status(200).json({ hash, tool: toolName, created: false });
        await db.insert(toolVersions).values({ hash, toolName, graphManifest: { ordered_specs, entry_spec, edges } } as any);
        return res.status(201).json({ hash, tool: toolName, created: true });
    }
}
