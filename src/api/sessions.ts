import { Request, Response } from 'express';
import { DatabaseService } from '../services/database-service.js';
import { createSuccessResponse, BadRequestError } from './middleware.js';
import type { SessionsResponse, SessionSummary } from './types.js';

/**
 * Sessions API Routes
 * GET /api/sessions?workspace_id=&task_id?
 * Lists global sessions, optionally filtered by workspace.
 */
export class SessionsController {
    constructor(private databaseService: DatabaseService) { }

    async getSessions(req: Request, res: Response): Promise<void> {
        const { workspace_id, task_id } = (req.query || {}) as { workspace_id?: string; task_id?: string };

        // Validate trivial shape
        if (task_id && typeof task_id !== 'string') {
            throw new BadRequestError('task_id must be a string when provided');
        }
        if (workspace_id && typeof workspace_id !== 'string') {
            throw new BadRequestError('workspace_id must be a string when provided');
        }

        const globalDb = this.databaseService.getGlobal();
        await globalDb.initialize();
        const sessions = await globalDb.getAllSessions({ workspaceId: workspace_id || undefined });

        const payload: SessionSummary[] = (sessions || []).map((s: any) => ({
            id: s.id,
            workspace_id: s.workspaceId,
            is_active: !!s.isActive,
            last_activity: s.lastActivity,
            created_at: s.createdAt
        }));

        const response: SessionsResponse = { sessions: payload };
        res.json(createSuccessResponse(response));
    }
}
