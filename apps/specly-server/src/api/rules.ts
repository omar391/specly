/**
 * Workspace Rules API Controller (SP-017)
 * Handles rule creation, retrieval, and reinforcement
 */

import type { Context } from 'hono';
import { z } from 'zod';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { WorkspaceRulesRepository } from '../repositories/workspace-rules-repository.js';

// Input schemas
const createRuleSchema = z.object({
  workspace_id: z.string(),
  relation: z.enum(['always-do', 'never-do', 'is-a', 'has-a']),
  rule: z.string().min(1),
  original_text: z.string().optional(),
  source_session_id: z.string().optional()
});

const getRulesSchema = z.object({
  workspace_id: z.string().optional(),
  active_only: z.preprocess((val) => {
    if (typeof val === 'string') {
      if (val === 'false') return false;
      if (val === 'true') return true;
      // Invalid string values should cause validation to fail
      return val;
    }
    return val;
  }, z.boolean()).optional().default(true)
});

export class RulesController {
  private rulesRepo: WorkspaceRulesRepository;
  private shouldInitialize: boolean;

  constructor(private globalDb?: GlobalDatabaseService) {
    this.shouldInitialize = !this.globalDb;
    if (!this.globalDb) {
      this.globalDb = new GlobalDatabaseService();
    }
    this.rulesRepo = new WorkspaceRulesRepository(this.globalDb);
  }

  async initialize(): Promise<void> {
    if (this.shouldInitialize) {
      await this.globalDb!.initialize();
    }
  }

  /**
   * POST /api/rules
   * Create or reinforce a workspace rule
   * Returns 201 on creation, 200 on reinforcement
   */
  async createRule(c: Context) {
    try {
      const input = createRuleSchema.parse(await c.req.json());

      const result = await this.rulesRepo.addOrReinforce({
        workspaceId: input.workspace_id,
        relation: input.relation,
        rule: input.rule,
        originalText: input.original_text || null,
        sourceSessionId: input.source_session_id || null
      });

      const statusCode = result.created ? 201 : 200;
      return c.json({
        id: result.id,
        created: result.created,
        confidence: result.confidence
      }, statusCode);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.errors
          }
        }, 400);
      }

      console.error('Error in createRule:', error);
      return c.json({
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }, 500);
    }
  }

  /**
   * GET /api/rules
   * Retrieve workspace rules ordered by confidence (desc) then recency (lastReinforcedAt desc)
   * Returns all active rules by default
   */
  async getRules(c: Context) {
    try {
      const input = getRulesSchema.parse({
        workspace_id: c.req.query('workspace_id'),
        active_only: c.req.query('active_only')
      });

      if (!input.workspace_id) {
        return c.json({
          error: {
            code: 'MISSING_WORKSPACE_ID',
            message: 'workspace_id query parameter is required'
          }
        }, 400);
      }

      let rules = await this.rulesRepo.list(input.workspace_id, input.active_only);

      // Apply ordering: confidence desc, then lastReinforcedAt desc (recency)
      rules = rules.sort((a, b) => {
        const confDiff = (b.confidence || 0) - (a.confidence || 0);
        if (confDiff !== 0) return confDiff;

        const aTime = a.lastReinforcedAt || a.createdAt || '';
        const bTime = b.lastReinforcedAt || b.createdAt || '';
        return bTime.localeCompare(aTime);
      });

      return c.json({ rules }, 200);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.errors
          }
        }, 400);
      }

      console.error('Error in getRules:', error);
      return c.json({
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }, 500);
    }
  }
}
