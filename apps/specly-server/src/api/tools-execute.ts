import { Request, Response } from 'express';
import { SpecEngine, ToolGraph, SerializedPausedState, SpecEngineErrorCode } from '../services/spec-engine.js';
import { PausedStateStore, InMemoryPausedStateStore } from '../services/paused-state-store.js';
import { z } from 'zod';
import { DatabaseService } from '../services/database-service.js';
import { getGlobalDatabaseService } from '../database/global-queries.js';

// Default store (can be overridden for tests / future persistence)
const defaultPausedStateStore = new InMemoryPausedStateStore();

export class ToolsExecuteController {
  constructor(
    private engineFactory: () => SpecEngine = () => new SpecEngine(),
    private pausedStore: PausedStateStore = defaultPausedStateStore,
    private db: DatabaseService | null = null
  ) { }

  async execute(req: Request, res: Response) {
    // Reject deprecated query param early if present
    if (req.query.mode) {
      return res.status(400).json({ error: { message: 'mode query param deprecated; omit it (auto-detect run vs resume)' } });
    }
    try {
      const parseResult = unifiedRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: { message: 'Invalid request', details: parseResult.error.flatten() } });
      }
      const data = parseResult.data;

      // Resolve graph from tool_version_id if provided and graph omitted (run or resume)
      let resolvedGraph: ToolGraph | undefined;
      if (!data.graph && data.tool_version_id) {
        try {
          // Use injected DatabaseService if available, else fallback singleton (tests may stub)
          const globalDb = this.db ? this.db.getGlobal() : getGlobalDatabaseService();
          const toolVersion = await globalDb.getToolVersion(data.tool_version_id);
          if (!toolVersion) {
            return res.status(404).json({ error: { message: 'tool_version_id not found' } });
          }
          const manifest: any = toolVersion.graphManifest;
          // manifest shape expected: { ordered_specs: string[], entry_spec: string, edges: {from,to,priority?}[] }
          if (!manifest || !manifest.ordered_specs || !manifest.entry_spec || !Array.isArray(manifest.edges)) {
            return res.status(500).json({ error: { message: 'Stored tool version manifest invalid' } });
          }
          // Fetch spec intents for nodes (fallback to autonomous if missing) – specs may not all exist if seed incomplete
          const specMap = await globalDb.getSpecsByHashes(manifest.ordered_specs);
          const nodes: Record<string, any> = {};
          for (const h of manifest.ordered_specs) {
            const spec = (specMap as any)[h];
            nodes[h] = { hash: h, intent: spec?.intent || 'autonomous', sideEffect: spec?.sideEffect || false };
          }
          resolvedGraph = {
            entry: manifest.entry_spec,
            nodes,
            edges: manifest.edges.map((e: any) => ({ from: e.from, to: e.to, priority: e.priority }))
          };
        } catch (err: any) {
          return res.status(500).json({ error: { message: err?.message || 'Failed to resolve tool_version_id' } });
        }
      }

      const engine = this.engineFactory();
      const sessionCtx = data.session?.id && data.session?.client_id ? { sessionId: data.session.id, clientId: data.session.client_id, force: data.session.force } : undefined;

      // Resume path
      if (data.resumeToken) {
        const paused = await this.pausedStore.get(data.resumeToken);
        if (!paused) return res.status(404).json({ error: { message: 'resumeToken not found' } });
        const graph = (data.graph || resolvedGraph) as unknown as ToolGraph;
        if (!graph) return res.status(400).json({ error: { message: 'graph or tool_version_id required for resume' } });
        const ctx = await engine.resume(graph, paused, { specHash: data.human_input!.specHash, humanOutput: data.human_input!.output }, sessionCtx);
        if (ctx.status !== 'awaiting_input') {
          await this.pausedStore.delete(data.resumeToken);
        }
        return res.status(mapHttpStatus(ctx.errorCode)).json(serializeContext(ctx));
      }

      // Run path
      const graph = (data.graph || resolvedGraph) as unknown as ToolGraph;
      if (!graph) return res.status(400).json({ error: { message: 'graph or tool_version_id required' } });
      const ctx = await engine.run(graph, sessionCtx);
      if (ctx.status === 'awaiting_input' && ctx.resumeToken) {
        const paused: SerializedPausedState = {
          plan: { steps: graphToSteps(graph), warnings: ctx.warnings },
          currentIndex: findIndexOfSpec(graph, ctx.awaitingSpec!),
          executed: ctx.executed,
          results: ctx.results,
          warnings: ctx.warnings,
          awaitingSpec: ctx.awaitingSpec!,
          sessionContext: {}
        };
        await this.pausedStore.save(ctx.resumeToken, paused);
      }
      return res.status(mapHttpStatus(ctx.errorCode)).json(serializeContext(ctx));
    } catch (e: any) {
      return res.status(500).json({ error: { message: e?.message || 'Internal error' } });
    }
  }
}

function serializeContext(ctx: any) {
  return {
    status: ctx.status,
    executed: ctx.executed,
    results: ctx.results,
    awaitingSpec: ctx.awaitingSpec,
    resumeToken: ctx.resumeToken,
    warnings: ctx.warnings,
    error: ctx.error ? { message: ctx.error.message, code: ctx.errorCode } : undefined
  };
}

function mapHttpStatus(code?: SpecEngineErrorCode): number {
  if (!code) return 200;
  switch (code) {
    case SpecEngineErrorCode.GRAPH_CYCLE:
    case SpecEngineErrorCode.GRAPH_MISSING_NODE:
      return 422;
    case SpecEngineErrorCode.LEASE_ACQUIRE_FAILED:
    case SpecEngineErrorCode.LEASE_RENEW_FAILED:
      return 409;
    case SpecEngineErrorCode.RESUME_TOKEN_INVALID:
      return 404;
    case SpecEngineErrorCode.ROUTE_DEAD_END:
      return 500; // treated as server runtime failure (routing gap)
    default:
      return 500;
  }
}

function graphToSteps(graph: ToolGraph) {
  return Object.keys(graph.nodes).map(specHash => ({ specHash, awaitingHuman: graph.nodes[specHash].intent === 'human' }));
}

function findIndexOfSpec(graph: ToolGraph, specHash: string) {
  return graphToSteps(graph).findIndex(s => s.specHash === specHash);
}

// --- Schemas ---
const graphNodeSchema = z.object({
  intent: z.string(),
  // Additional future fields pass-through allowed
}).passthrough();

// We validate a structural subset; full SpecNode fields are provided by caller but we only check presence.
const graphSchema = z.object({
  entry: z.string().min(1),
  nodes: z.record(graphNodeSchema),
  edges: z.array(z.object({ from: z.string(), to: z.string() }))
}).refine(g => g.nodes[g.entry] !== undefined, { message: 'entry must exist in nodes', path: ['entry'] });

const sessionSchema = z.object({
  id: z.string().optional(),
  client_id: z.string().optional(),
  force: z.boolean().optional()
}).optional();

// Unified schema (run or resume inferred by presence of resumeToken)
const unifiedRequestSchema = z.object({
  resumeToken: z.string().min(1).optional(),
  human_input: z.object({
    specHash: z.string().min(1),
    output: z.any().optional()
  }).optional(),
  graph: graphSchema.optional(),
  tool_version_id: z.string().uuid().optional(),
  session: sessionSchema
}).superRefine((val, ctx) => {
  const isResume = !!val.resumeToken;
  if (isResume) {
    if (!val.human_input) ctx.addIssue({ code: 'custom', path: ['human_input'], message: 'human_input required when resumeToken provided' });
  } else {
    if (!val.graph && !val.tool_version_id) ctx.addIssue({ code: 'custom', path: ['graph'], message: 'graph or tool_version_id required' });
  }
});
