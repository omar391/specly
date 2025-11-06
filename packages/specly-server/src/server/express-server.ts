/**
 * Express Server Integration
 * 
 * Backend server that provides MCP + REST API with CORS support for separate UI
 */

import express, { Request, Response, NextFunction } from 'express';
import { Server as HttpServer } from 'http';
import { attachMcpExpress, type MCPToolHandlers } from '@omar391/mcp-kit/server/express';
export type { MCPToolHandlers } from '@omar391/mcp-kit/server/express';
import path from 'path';
import { fileURLToPath } from 'url';
// MCP types handled by mcp-kit adapter

// Import existing API router
import { createApiRouter } from '../api/router.js';
import type { DatabaseService } from '../services/database-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ExpressServerOptions {
  port: number;
  dev: boolean;
}

// MCPToolHandlers imported from mcp-kit

export class ExpressServer {
  private app: express.Application;
  private httpServer: HttpServer | null = null;
  // MCP endpoints are attached via mcp-kit adapter

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
  setupMCPEndpoint(toolHandlers: MCPToolHandlers): void {
    // Delegate MCP endpoints to mcp-kit adapter
    attachMcpExpress(this.app, { dev: this.options.dev, serverName: 'specly', serverVersion: '0.1.0' }, toolHandlers);
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
      // In monorepo: server is in packages/specly-server, UI is in packages/specly-ui
      const uiDistPath = path.resolve(__dirname, '../../../specly-ui/dist');

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
