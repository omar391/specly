import { Request, Response } from 'express';
import { SpecEngine, ToolGraph, SerializedPausedState, SpecEngineErrorCode } from '../services/spec-engine.js';
import { PausedStateStore, InMemoryPausedStateStore } from '../services/paused-state-store.js';
import { z } from 'zod';

// Default store (can be overridden for tests / future persistence)
const defaultPausedStateStore = new InMemoryPausedStateStore();

export class ToolsExecuteController {
  constructor(
    private engineFactory: () => SpecEngine = () => new SpecEngine(),
    private pausedStore: PausedStateStore = defaultPausedStateStore
  ) {}

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

      // tool_version_id future path
      if (!data.graph && data.tool_version_id && !data.resumeToken) {
        return res.status(501).json({ error: { message: 'tool_version_id resolution not implemented yet; provide graph' } });
      }

      const engine = this.engineFactory();
      const sessionCtx = data.session?.id && data.session?.client_id ? { sessionId: data.session.id, clientId: data.session.client_id, force: data.session.force } : undefined;

      // Resume path
      if (data.resumeToken) {
        const paused = await this.pausedStore.get(data.resumeToken);
        if (!paused) return res.status(404).json({ error: { message: 'resumeToken not found' } });
        if (!data.graph) return res.status(400).json({ error: { message: 'graph required for resume until persistence implemented' } });
        const graph = data.graph as unknown as ToolGraph;
        const ctx = await engine.resume(graph, paused, { specHash: data.human_input!.specHash, humanOutput: data.human_input!.output }, sessionCtx);
        if (ctx.status !== 'awaiting_input') {
          await this.pausedStore.delete(data.resumeToken);
        }
        return res.status(mapHttpStatus(ctx.errorCode)).json(serializeContext(ctx));
      }

      // Run path
      if (!data.graph) return res.status(400).json({ error: { message: 'graph required (no tool_version_id path yet)' } });
      const graph = data.graph as unknown as ToolGraph;
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
      return 409;
    default:
      return 500; // runtime failures for now
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
