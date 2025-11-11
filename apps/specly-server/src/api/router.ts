/**
 * Main API Router
 * Combines all API controllers and sets up routes
 */

import { Hono } from 'hono';
import type { DatabaseService } from '../services/database-service.js';
import { WorkspacesController } from './workspaces.js';
import { TasksController } from './tasks.js';
import { ToolsExecuteController } from './tools-execute.js';
import { SpecsController, ToolsController } from './specs-tools.js';
import { ProfilesController } from './profiles.js';
import { SessionsController } from './sessions.js';
import { RulesController } from './rules.js';
// Legacy ToolFlowsController & FeedbackStepsController removed (drastic migration)
import { 
  createErrorResponse,
  createSuccessResponse,
  rateLimit,
  validateWorkspaceId,
  validateTaskId,
  BadRequestError,
  ValidationError,
  NotFoundError
} from './middleware.js';

/**
 * Create API Hono app with all endpoints
 */
export async function createApiRouter(databaseService: DatabaseService): Promise<Hono> {
  const app = new Hono();

  // Initialize controllers
  const workspacesController = new WorkspacesController(databaseService);
  const tasksController = new TasksController(databaseService, workspacesController);
  const toolsExecuteController = new ToolsExecuteController(undefined, undefined, databaseService);
  const specsController = new SpecsController(databaseService.getGlobal());
  const toolsController = new ToolsController(databaseService.getGlobal());
  const profilesController = new ProfilesController(databaseService.getGlobal());
  const sessionsController = new SessionsController(databaseService);
  const rulesController = new RulesController(databaseService.getGlobal());
  await rulesController.initialize();

  // Apply middleware
  // app.use(cors()); // TODO: add CORS if needed
  // app.use(logger()); // TODO: add logger if needed

  // Rate limiting - different limits for read vs write operations
  const readRateLimit = rateLimit(100, 60 * 1000); // 100 requests per minute
  const writeRateLimit = rateLimit(30, 60 * 1000); // 30 requests per minute

  // API Routes (register specific routes first)
  // Spec & Tool Management (SP-014)
  app.post('/specs', writeRateLimit, async (c) => { return await specsController.createSpec(c); });
  app.post('/tools', writeRateLimit, async (c) => { return await toolsController.createTool(c); });
  app.post('/tools/:tool/versions', writeRateLimit, async (c) => { return await toolsController.createToolVersion(c); });

  // Profile & Workspace Binding (SP-015)
  app.post('/profiles', writeRateLimit, async (c) => { return await profilesController.createProfile(c); });
  app.post('/profiles/:profile/versions', writeRateLimit, async (c) => { return await profilesController.createProfileVersion(c); });
  app.post('/profiles/:profile/versions/:version/publish', writeRateLimit, async (c) => { return await profilesController.publishProfileVersion(c); });
  app.post('/profiles/:profile/versions/:version/attachments', writeRateLimit, async (c) => { return await profilesController.attachTools(c); });
  app.get('/profiles/:profile/versions/:version/attachments', readRateLimit, async (c) => { return await profilesController.getAttachments(c); });
  app.post('/workspaces/:workspaceId/profile/upgrade', writeRateLimit, validateWorkspaceId, async (c) => { return await profilesController.upgradeWorkspaceProfile(c); });
  app.get('/workspaces/:workspaceId/profile', readRateLimit, validateWorkspaceId, async (c) => { return await profilesController.getWorkspaceProfile(c); });

  // POST /api/tools/:tool/execute (unified run/resume)
  app.post('/tools/:tool/execute', writeRateLimit, async (c) => {
    return await toolsExecuteController.execute(c);
  });

  // 1. GET /api/workspaces - List all workspaces
  app.get('/workspaces', readRateLimit, async (c) => {
    try {
      return await workspacesController.getWorkspaces(c);
    } catch (error) {
      throw error;
    }
  });

  // Sessions listing (global; filter by workspace_id)
  app.get('/sessions', readRateLimit, async (c) => {
    try {
      return await sessionsController.getSessions(c);
    } catch (error) {
      throw error;
    }
  });

  // Workspace Rules (SP-017)
  app.post('/rules', writeRateLimit, async (c) => {
    try {
      return await rulesController.createRule(c);
    } catch (error) {
      throw error;
    }
  });
  app.get('/rules', readRateLimit, async (c) => {
    try {
      return await rulesController.getRules(c);
    } catch (error) {
      throw error;
    }
  });

  // 2. GET /api/workspaces/{id}/tasks - Get tasks for workspace
  app.get('/workspaces/:workspaceId/tasks', readRateLimit, validateWorkspaceId, async (c) => {
    try {
      return await tasksController.getTasks(c);
    } catch (error) {
      throw error;
    }
  });
  // 2a. GET /api/workspaces/{id}/tasks/{taskId} - Get a single task
  app.get('/workspaces/:workspaceId/tasks/:taskId', readRateLimit, validateWorkspaceId, validateTaskId, async (c) => {
    try {
      return await tasksController.getTask(c);
    } catch (error) {
      throw error;
    }
  });
  // 3. POST /api/workspaces/{id}/tasks - Create new task
  app.post('/workspaces/:workspaceId/tasks', writeRateLimit, validateWorkspaceId, async (c) => {
    try {
      return await tasksController.createTask(c);
    } catch (error) {
      throw error;
    }
  });

  // 4. PUT /api/workspaces/{id}/tasks/{taskId} - Update task
  app.put('/workspaces/:workspaceId/tasks/:taskId', writeRateLimit, validateWorkspaceId, validateTaskId, async (c) => {
    try {
      return await tasksController.updateTask(c);
    } catch (error) {
      throw error;
    }
  });
  // 4a. PATCH /api/workspaces/{id}/tasks/{taskId}/status - Update task status
  app.patch('/workspaces/:workspaceId/tasks/:taskId/status', writeRateLimit, validateWorkspaceId, validateTaskId, async (c) => {
    try {
      return await tasksController.patchTaskStatus(c);
    } catch (error) {
      throw error;
    }
  });

  // 4b. Task dependency endpoints
  // POST add dependency
  app.post('/workspaces/:workspaceId/tasks/:taskId/dependencies', writeRateLimit, validateWorkspaceId, validateTaskId, async (c) => {
    try {
      return await tasksController.addDependency(c);
    } catch (error) {
      throw error;
    }
  });
  // DELETE remove dependency
  app.delete('/workspaces/:workspaceId/tasks/:taskId/dependencies/:dependsOn', writeRateLimit, validateWorkspaceId, validateTaskId, async (c) => {
    try {
      return await tasksController.removeDependency(c);
    } catch (error) {
      throw error;
    }
  });
  // GET list dependencies
  app.get('/workspaces/:workspaceId/tasks/:taskId/dependencies', readRateLimit, validateWorkspaceId, validateTaskId, async (c) => {
    try {
      return await tasksController.listDependencies(c);
    } catch (error) {
      throw error;
    }
  });

  // Error handling
  app.onError((err, c) => {
    if (err instanceof BadRequestError) {
      return c.json(createErrorResponse('BAD_REQUEST', err.message), 400);
    }
    if (err instanceof ValidationError) {
      return c.json(createErrorResponse('VALIDATION_ERROR', err.message), 422);
    }
    if (err instanceof NotFoundError) {
      return c.json(createErrorResponse('NOT_FOUND', err.message), 404);
    }
    console.error('Unhandled error:', err);
    return c.json(createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred'), 500);
  });

  return app;
}

/**
 * SSE Event Manager
 * Manages Server-Sent Events for real-time updates
 */
export class SSEEventManager {
  private clients: Map<string, ReadableStreamDefaultController> = new Map();

  /**
   * Add SSE client
   */
  addClient(clientId: string, c: any): void {
    // Use Hono's streamSSE
    c.streamSSE(async (stream: any) => {
      this.clients.set(clientId, stream.controller);

  // Send initial connection event
      await stream.writeln(`data: ${JSON.stringify({
        type: 'connection.established',
        data: { clientId, timestamp: new Date().toISOString() }
      })}\n\n`);

      // Clean up on disconnect
      stream.onAbort(() => {
        this.clients.delete(clientId);
        console.log(`SSE client disconnected: ${clientId}`);
      });
    });
  }

  /**
   * Send event to specific client
   */
  sendToClient(clientId: string, event: any): void {
    const controller = this.clients.get(clientId);
    if (controller) {
      try {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      } catch (error) {
        console.error(`Error sending SSE event to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Broadcast event to all clients
   */
  broadcast(event: any): void {
    const clientsToRemove: string[] = [];
    
    for (const [clientId, controller] of this.clients.entries()) {
      try {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      } catch (error) {
        console.error(`Error broadcasting SSE event to client ${clientId}:`, error);
        clientsToRemove.push(clientId);
      }
    }
    
    // Clean up disconnected clients
    clientsToRemove.forEach(clientId => this.clients.delete(clientId));
  }

  /**
   * Send workspace status change event
   */
  sendWorkspaceStatusChanged(workspaceId: string, status: string, lastActivity: string): void {
    this.broadcast({
      type: 'workspace.status_changed',
      data: {
        workspace_id: workspaceId,
        status,
        last_activity: lastActivity
      }
    });
  }

  /**
   * Send task updated event
   */
  sendTaskUpdated(workspaceId: string, task: any): void {
    this.broadcast({
      type: 'task.updated',
      data: {
        workspace_id: workspaceId,
        task: {
          id: task.id,
          status: task.status,
          progress: task.progress,
          updated_at: task.updated_at
        }
      }
    });
  }

  /**
   * Send task created event
   */
  sendTaskCreated(workspaceId: string, task: any): void {
    this.broadcast({
      type: 'task.created',
      data: {
        workspace_id: workspaceId,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          created_at: task.created_at
        }
      }
    });
  }

  /**
   * Get active client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    for (const controller of this.clients.values()) {
      try {
        controller.close();
      } catch (error) {
        console.error('Error closing SSE client:', error);
      }
    }
    this.clients.clear();
  }
}
