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
    const toolName = req.params.tool; // reserved for future persisted lookup / tool_version resolution
    const { mode = 'run' } = req.query as { mode?: 'run' | 'resume' };
    try {
      if (mode === 'resume') return await this.handleResume(req, res);
      return await this.handleRun(req, res, toolName);
    } catch (e: any) {
      res.status(500).json({ error: { message: e?.message || 'Internal error' } });
    }
  }

  private async handleRun(req: Request, res: Response, toolName: string) {
    const parseResult = runRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: { message: 'Invalid request', details: parseResult.error.flatten() } });
    }
    const data = parseResult.data;

    // For now we require graph (tool_version_id future path). If only tool_version_id is provided return 501 to signal unimplemented feature path.
    if (!data.graph && data.tool_version_id) {
      return res.status(501).json({ error: { message: 'tool_version_id resolution not implemented yet; provide graph' } });
    }
  // Cast via unknown because schema only validates a structural subset of SpecNode
  const graph = data.graph as unknown as ToolGraph; // validated shape minimal

    const engine = this.engineFactory();
    const sessionCtx = data.session?.id && data.session?.client_id ? { sessionId: data.session.id, clientId: data.session.client_id, force: data.session.force } : undefined;
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
  }

  private async handleResume(req: Request, res: Response) {
    const parseResult = resumeRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: { message: 'Invalid request', details: parseResult.error.flatten() } });
    }
    const data = parseResult.data;
  const paused = await this.pausedStore.get(data.resumeToken);
    if (!paused) return res.status(404).json({ error: { message: 'resumeToken not found' } });

    if (!data.graph && data.tool_version_id) {
      return res.status(501).json({ error: { message: 'tool_version_id resolution not implemented yet; provide graph' } });
    }
    if (!data.graph) {
      return res.status(400).json({ error: { message: 'graph required for resume (no persistence yet)' } });
    }
  const graph = data.graph as unknown as ToolGraph;
    const engine = this.engineFactory();
    const sessionCtx = data.session?.id && data.session?.client_id ? { sessionId: data.session.id, clientId: data.session.client_id, force: data.session.force } : undefined;
    const ctx = await engine.resume(graph, paused, { specHash: data.human_input.specHash, humanOutput: data.human_input.output }, sessionCtx);
    if (ctx.status !== 'awaiting_input' && data.resumeToken) {
      // Clean up consumed resume token once execution advances
      await this.pausedStore.delete(data.resumeToken);
    }
    return res.status(mapHttpStatus(ctx.errorCode)).json(serializeContext(ctx));
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

const runRequestSchema = z.object({
  graph: graphSchema.optional(),
  tool_version_id: z.string().uuid().optional(),
  session: sessionSchema
}).refine(d => !!d.graph || !!d.tool_version_id, { message: 'graph or tool_version_id required', path: ['graph'] });

const resumeRequestSchema = z.object({
  resumeToken: z.string().min(1),
  human_input: z.object({
    specHash: z.string().min(1),
    output: z.any().optional()
  }),
  graph: graphSchema.optional(),
  tool_version_id: z.string().uuid().optional(),
  session: sessionSchema
});
