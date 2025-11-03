/**
 * Express Server Integration
 * 
 * Backend server that provides MCP + REST API with CORS support for separate UI
 */

import express, { Request, Response, NextFunction } from 'express';
import { Server as HttpServer } from 'http';
import { Server as MCPServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import existing API router
import { createApiRouter } from '../api/router.js';
import type { DatabaseService } from '../services/database-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ExpressServerOptions {
  port: number;
  dev: boolean;
}

export interface MCPToolHandlers {
  listTools: () => Promise<any>;
  handleToolCall: (name: string, args: any) => Promise<any>;
}

interface MCPSession {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

export class ExpressServer {
  private app: express.Application;
  private httpServer: HttpServer | null = null;
  private mcpServer: MCPServer | null = null;
  private sessions: Map<string, MCPSession> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor(private options: ExpressServerOptions) {
    this.app = express();
    this.setupMiddleware();
  }


  // Allow registration of custom endpoints (for multi-instance/proxy logic)
  public registerCustomEndpoints(fn: (app: express.Application) => void): void {
    fn(this.app);
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Enable CORS for development and localhost access
    this.app.use((req, res, next) => {
      // Allow localhost origins for development
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173', // Default Vite/Rsbuild port
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:8080'
      ];

      const origin = req.headers.origin;
      if (this.options.dev && origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      } else if (this.options.dev) {
      // For development, allow any localhost
        res.header('Access-Control-Allow-Origin', '*');
      }

      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Credentials', 'true');

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging in dev mode
    if (this.options.dev) {
      this.app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
        next();
      });
    }
  }

  /**
   * Setup MCP HTTP endpoint with streamable transport
   */
  private cleanupSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.SESSION_TIMEOUT) {
        session.transport.close().catch(console.error);
        this.sessions.delete(sessionId);
      }
    }
  }

  private generateSessionId(): string {
    return `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private getOrCreateTransport(sessionId?: string): { transport: StreamableHTTPServerTransport; isNew: boolean; sessionId: string } {
    // Clean up old sessions first
    this.cleanupSessions();

    // If no session ID provided or invalid, generate a new one
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      const newSessionId = this.generateSessionId();
      console.log(`Generating new session ID: ${newSessionId}`);
      const newTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });
      return { transport: newTransport, isNew: true, sessionId: newSessionId };
    }

    // Try to find existing session
    const existingSession = this.sessions.get(sessionId);
    if (existingSession) {
      console.log(`Reusing existing session: ${sessionId}`);
      existingSession.lastActivity = Date.now();
      return { transport: existingSession.transport, isNew: false, sessionId };
    }

    // Create new session with provided ID
    console.log(`Creating new session with provided ID: ${sessionId}`);
    const newTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });
    return { transport: newTransport, isNew: true, sessionId };
  }

  private setupMCPSSE(req: Request, res: Response, sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Mcp-Session-Id': sessionId
    });

    // Handle client disconnection
    req.on('close', () => {
      console.log(`SSE connection closed for session: ${sessionId}`);
    });

    // Keep the connection alive
    const keepAlive = setInterval(() => {
      res.write('\n');
    }, 30000);

    // Clean up on connection close
    res.on('close', () => {
      clearInterval(keepAlive);
    });
  }

  private handleDeleteSession(sessionId: string, res: Response): void {
    console.log(`Received DELETE request for session: ${sessionId}`);
    
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`Session not found: ${sessionId}`);
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      // Close the transport
      session.transport.close().catch(console.error);
      
      // Remove the session
      this.sessions.delete(sessionId);
      console.log(`Successfully terminated session: ${sessionId}`);
      
      res.status(200).json({ message: 'Session terminated' });
    } catch (error) {
      console.error(`Error terminating session ${sessionId}:`, error);
      res.status(500).json({ error: 'Failed to terminate session' });
    }
  }

  setupMCPEndpoint(toolHandlers: MCPToolHandlers): void {
    // Initialize MCP server if not already done
    if (!this.mcpServer) {
      this.mcpServer = new MCPServer(
        {
          name: "specly",
          version: "0.1.0",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      // Setup MCP handlers
      this.mcpServer.setRequestHandler(ListToolsRequestSchema, toolHandlers.listTools);
      this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        return await toolHandlers.handleToolCall(name, args);
      });
    }

    // MCP HTTP endpoint with streamable transport
    this.app.post('/mcp', (req: Request, res: Response) => {
      if (!this.mcpServer) {
        res.status(500).json({ error: 'MCP server not initialized' });
        return;
      }

      const handleRequest = async () => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        console.log(`Processing MCP POST request for session: ${sessionId || 'new session'}`);
        
        try {
          const { transport, isNew, sessionId: resolvedSessionId } = this.getOrCreateTransport(sessionId);
          
          if (!resolvedSessionId) {
            throw new Error('Failed to generate or validate session ID');
          }
          
          console.log(`Transport created: sessionId=${resolvedSessionId}, isNew=${isNew}`);
        
          // If this is a new transport, connect it to the MCP server
          if (isNew) {
            console.log('Connecting new transport to MCP server');
            try {
              await this.mcpServer!.connect(transport);
              console.log('Successfully connected transport to MCP server');
            } catch (connectError) {
              console.error('Failed to connect transport to MCP server:', connectError);
              throw new Error(`Failed to connect transport: ${connectError}`);
            }
          
            // Store the session
            this.sessions.set(resolvedSessionId, {
              transport,
              lastActivity: Date.now()
            });

            // Set the session ID in the response headers
            res.setHeader('Mcp-Session-Id', resolvedSessionId);
            console.log(`Set Mcp-Session-Id header: ${resolvedSessionId}`);
          }
        
          console.log('Handling MCP request with transport');
          // Handle the request with the transport
          await transport.handleRequest(req, res, req.body);
          console.log('Successfully handled MCP request');
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorStack = error instanceof Error ? error.stack : undefined;
          const errorName = error instanceof Error ? error.name : 'Error';
          
          console.error('MCP endpoint error:', errorMessage);
          console.error('Error details:', {
            message: errorMessage,
            stack: errorStack,
            name: errorName
          });
          
          if (!res.headersSent) {
            try {
              res.status(500).json({ 
                error: 'Failed to process MCP request',
                details: this.options.dev ? errorMessage : undefined,
                stack: this.options.dev ? errorStack : undefined
              });
            } catch (responseError) {
              console.error('Failed to send error response:', responseError);
            }
          }
        }
      };

      // Start handling the request
      handleRequest().catch(console.error);
    });

    // SSE endpoint for server-to-client messages
    this.app.get('/mcp', (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: 'Mcp-Session-Id header is required' });
        return;
      }

      console.log(`Setting up SSE for session: ${sessionId}`);
      this.setupMCPSSE(req, res, sessionId);
    });

    // Session termination endpoint
    this.app.delete('/mcp', (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: 'Mcp-Session-Id header is required' });
        return;
      }

      this.handleDeleteSession(sessionId, res);
    });
  }

  /**
   * Setup REST API routes
   */
  async setupAPIEndpoints(databaseService: DatabaseService): Promise<void> {
    try {
      const apiRouter = await createApiRouter(databaseService);
      this.app.use('/api', apiRouter);
      console.log('REST API endpoints configured');
    } catch (error) {
      console.warn('REST API setup failed, continuing without API endpoints:', error);
    }
  }

  /**
   * Setup health check and root endpoints
   */
  setupHealthCheck(metricsCollector?: any): void {
    this.app.get('/health', (req, res) => {
      const baseHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        mode: this.options.dev ? 'development' : 'production',
        port: this.options.port,
        endpoints: {
          api: '/api',
          mcp_sse: '/sse',
          health: '/health'
        }
      };

      // Include metrics snapshot if collector provided (SP-012)
      if (metricsCollector && typeof metricsCollector.snapshot === 'function') {
        const metrics = metricsCollector.snapshot();
        res.json({ ...baseHealth, metrics });
      } else {
        res.json(baseHealth);
      }
    });

    // Root endpoint for API discovery
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Specly Backend API',
        version: '0.1.0',
        mode: this.options.dev ? 'development' : 'production',
        endpoints: {
          api: '/api',
          mcp: '/mcp',
          health: '/health'
        },
        cors: this.options.dev ? 'enabled for localhost development' : 'disabled',
        note: this.options.dev ? 'UI should be running separately on http://localhost:5173' : 'Backend API only'
      });
    });

    // In production, also try to serve static UI files if they exist
    if (!this.options.dev) {
      this.setupProductionStaticUI();
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = this.app.listen(this.options.port, () => {
        console.log(`Specly backend server running on http://localhost:${this.options.port}`);
        console.log(`  API: http://localhost:${this.options.port}/api`);
        console.log(`  MCP: http://localhost:${this.options.port}/mcp`);
        console.log(`  Health: http://localhost:${this.options.port}/health`);
        if (this.options.dev) {
          console.log(`  CORS: Enabled for localhost development`);
          console.log(`  Note: UI should run separately on http://localhost:5173`);
        }
        resolve();
      });

      this.httpServer?.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.options.port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Close all active sessions
    for (const session of this.sessions.values()) {
      try {
        await session.transport.close();
      } catch (error) {
        console.error('Error closing session:', error);
      }
    }
    this.sessions.clear();

    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('Specly backend server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the Express app instance
   */
  getApp(): express.Application {
    return this.app;
  }

  /**
   * Setup production static UI serving (optional)
   */
  private setupProductionStaticUI(): void {
    try {
      const uiDistPath = path.resolve(__dirname, '../../ui/dist');

      // Serve static files from UI dist directory
      this.app.use(express.static(uiDistPath));

      // SPA fallback - serve index.html for non-API routes
      this.app.use((req, res, next) => {
        // Skip if this is an API route, SSE, health check, or static file
        if (req.path.startsWith('/api') ||
          req.path.startsWith('/mcp') ||
          req.path.startsWith('/health') ||
          req.path.includes('.') || // Skip requests for files with extensions
          req.method !== 'GET') {   // Only handle GET requests
          return next();
        }

        const indexPath = path.join(uiDistPath, 'index.html');
        res.sendFile(indexPath, (err) => {
          if (err) {
            // Silently fail - API info already served by root endpoint
            next();
          }
        });
      });

      console.log(`Production static UI configured to serve from ${uiDistPath}`);
    } catch (error) {
      console.warn('Production static UI setup failed, API-only mode:', error);
    }
  }
}
