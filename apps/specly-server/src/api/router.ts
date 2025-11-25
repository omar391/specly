/**
 * Main API Router
 * Combines all API controllers and sets up routes
 */

import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { DatabaseService } from '../services/database-service.js';
import { WorkspacesController } from './workspaces.js';
import { TasksController } from './tasks.js';
import { ToolsExecuteController } from './tools-execute.js';
import { SpecsController, ToolsController } from './specs-tools.js';
import { ProfilesController } from './profiles.js';
import { SessionsController } from './sessions.js';
import { RulesController } from './rules.js';
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
export async function createApiRouter(databaseService: DatabaseService, sseManager: SSEEventManager): Promise<Hono> {
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
  app.post('/specs', writeRateLimit, async (c) => await specsController.createSpec(c));
  app.post('/tools', writeRateLimit, async (c) => await toolsController.createTool(c));
  app.post('/tools/:tool/versions', writeRateLimit, async (c) => await toolsController.createToolVersion(c));
  app.get('/tools', readRateLimit, async (c) => await toolsController.getTools(c));
  app.get('/tools/:tool', readRateLimit, async (c) => await toolsController.getTool(c));
  app.get('/tools/:tool/versions', readRateLimit, async (c) => await toolsController.getToolVersions(c));

  // Profile & Workspace Binding (SP-015)
  app.post('/profiles', writeRateLimit, async (c) => await profilesController.createProfile(c));
  app.get('/profiles', readRateLimit, async (c) => await profilesController.getProfiles(c));
  app.post('/profiles/:profile/versions', writeRateLimit, async (c) => await profilesController.createProfileVersion(c));
  app.post('/profiles/:profile/versions/:version/publish', writeRateLimit, async (c) => await profilesController.publishProfileVersion(c));
  app.post('/profiles/:profile/versions/:version/attachments', writeRateLimit, async (c) => await profilesController.attachTools(c));
  app.get('/profiles/:profile/versions/:version/attachments', readRateLimit, async (c) => await profilesController.getAttachments(c));
  app.post('/workspaces/:workspaceId/profile/upgrade', writeRateLimit, validateWorkspaceId, async (c) => await profilesController.upgradeWorkspaceProfile(c));
  app.get('/workspaces/:workspaceId/profile', readRateLimit, validateWorkspaceId, async (c) => await profilesController.getWorkspaceProfile(c));

  // POST /api/tools/:tool/execute (unified run/resume)
  app.post('/tools/:tool/execute', writeRateLimit, async (c) => await toolsExecuteController.execute(c));

  // 1. GET /api/workspaces - List all workspaces
  app.get('/workspaces', readRateLimit, async (c) => await workspacesController.getWorkspaces(c));

  // Sessions listing (global; filter by workspace_id)
  app.get('/sessions', readRateLimit, async (c) => await sessionsController.getSessions(c));

  // Workspace Rules (SP-017)
  app.post('/rules', writeRateLimit, async (c) => await rulesController.createRule(c));
  app.get('/rules', readRateLimit, async (c) => await rulesController.getRules(c));

  // 2. GET /api/workspaces/{id}/tasks - Get tasks for workspace
  app.get('/workspaces/:workspaceId/tasks', readRateLimit, validateWorkspaceId, async (c) => await tasksController.getTasks(c));
  // 2a. GET /api/workspaces/{id}/tasks/{taskId} - Get a single task
  app.get('/workspaces/:workspaceId/tasks/:taskId', readRateLimit, validateWorkspaceId, validateTaskId, async (c) => await tasksController.getTask(c));
  // 3. POST /api/workspaces/{id}/tasks - Create new task
  app.post('/workspaces/:workspaceId/tasks', writeRateLimit, validateWorkspaceId, async (c) => await tasksController.createTask(c));

  // 4. PUT /api/workspaces/{id}/tasks/{taskId} - Update task
  app.put('/workspaces/:workspaceId/tasks/:taskId', writeRateLimit, validateWorkspaceId, validateTaskId, async (c) => await tasksController.updateTask(c));
  // 4a. PATCH /api/workspaces/{id}/tasks/{taskId}/status - Update task status
  app.patch('/workspaces/:workspaceId/tasks/:taskId/status', writeRateLimit, validateWorkspaceId, validateTaskId, async (c) => await tasksController.patchTaskStatus(c));

  // 4b. Task dependency endpoints
  // POST add dependency
  app.post('/workspaces/:workspaceId/tasks/:taskId/dependencies', writeRateLimit, validateWorkspaceId, validateTaskId, async (c) => await tasksController.addDependency(c));
  // DELETE remove dependency
  app.delete('/workspaces/:workspaceId/tasks/:taskId/dependencies/:dependsOn', writeRateLimit, validateWorkspaceId, validateTaskId, async (c) => await tasksController.removeDependency(c));
  // GET list dependencies
  app.get('/workspaces/:workspaceId/tasks/:taskId/dependencies', readRateLimit, validateWorkspaceId, validateTaskId, async (c) => await tasksController.listDependencies(c));

  // GET /api/sse - Server-Sent Events endpoint
  app.get('/sse', async (c) => {
    const clientId = crypto.randomUUID();
    return sseManager.addClient(clientId, c);
  });

  // Error handling
  app.onError((err, c) => {
    console.log('onError called with:', err.constructor.name, err.message);
    console.log('Error instanceof BadRequestError:', err instanceof BadRequestError);
    console.log('Error name:', err.name);
    if (err instanceof BadRequestError || err.name === 'BadRequestError') {
      console.log('Returning BadRequestError response');
      return c.json(createErrorResponse('BAD_REQUEST', err.message), 400);
    }
    if (err instanceof ValidationError || err.name === 'ValidationError') {
      return c.json(createErrorResponse('VALIDATION_ERROR', err.message), 422);
    }
    if (err instanceof NotFoundError || err.name === 'NotFoundError') {
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
  addClient(clientId: string, c: Context): Response {
    // Use Hono's streamSSE
    return streamSSE(c, async (stream) => {
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

      // Keep connection open
      while (true) {
        await stream.sleep(1000);
      }
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
