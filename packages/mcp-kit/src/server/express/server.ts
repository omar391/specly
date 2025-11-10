import express, { type Application, type Request, type Response } from 'express';
import type { MCPToolHandlers } from './mcp-adapter.js';
import { attachMcpExpress } from './mcp-adapter.js';

export interface ExpressServerOptions {
    port: number;
    dev?: boolean;
    cors?: {
        allowedOrigins?: string[];
        allowAnyLocalhost?: boolean;
        credentials?: boolean;
    };
    info?: {
        name?: string;
        version?: string;
        uiHintUrl?: string;
    };
    endpoints?: {
        apiBase?: string | null;
        mcpBase?: string; // informational only for root/health payload
        healthPath?: string;
    };
}

export interface IExpressServer {
    readonly app: Application;
    attachMcp(toolHandlers: MCPToolHandlers): void;
    setupHealthAndRoot(metricsCollector?: { snapshot: () => any }): void;
    start(): Promise<void>;
    stop(): Promise<void>;
}

export class ExpressServer implements IExpressServer {
    readonly app: Application;
    private server: import('http').Server | null = null;

    constructor(private opts: ExpressServerOptions) {
        this.app = express();
        this.setupMiddleware();
    }

    private setupMiddleware() {
        this.app.use(express.json());

        const allowedOrigins = this.opts.cors?.allowedOrigins ?? [
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:8080',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:8080',
        ];

        this.app.use((req: Request, res: Response, next) => {
            const origin = req.headers.origin as string | undefined;
            const allowAnyLocalhost = this.opts.dev && (this.opts.cors?.allowAnyLocalhost ?? true);

            if (this.opts.dev && origin && allowedOrigins.includes(origin)) {
                res.header('Access-Control-Allow-Origin', origin);
            } else if (allowAnyLocalhost) {
                res.header('Access-Control-Allow-Origin', '*');
            }

            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Mcp-Session-Id');
            res.header('Access-Control-Allow-Credentials', this.opts.cors?.credentials ? 'true' : 'false');

            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
                return;
            }
            next();
        });

        if (this.opts.dev) {
            this.app.use((req, _res, next) => {
                // lightweight request log in dev
                console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
                next();
            });
        }
    }

    attachMcp(toolHandlers: MCPToolHandlers) {
        attachMcpExpress(
            this.app,
            { dev: this.opts.dev, serverName: this.opts.info?.name, serverVersion: this.opts.info?.version },
            toolHandlers,
        );
    }

    setupHealthAndRoot(metricsCollector?: { snapshot: () => any }) {
        const healthPath = this.opts.endpoints?.healthPath ?? '/health';
        const apiBase = this.opts.endpoints?.apiBase !== undefined ? this.opts.endpoints.apiBase : '/api';
        const mcpBase = this.opts.endpoints?.mcpBase ?? '/mcp';
        const name = this.opts.info?.name ?? 'backend';
        const version = this.opts.info?.version ?? '0.1.0';

        this.app.get(healthPath, (_req, res) => {
            const base: any = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version,
                mode: this.opts.dev ? 'development' : 'production',
                port: this.opts.port,
                endpoints: { mcp: mcpBase, health: healthPath, mcp_sse: '/sse' },
            };
            if (apiBase !== null) {
                base.endpoints.api = apiBase;
            }
            if (metricsCollector && typeof metricsCollector.snapshot === 'function') {
                res.json({ ...base, metrics: metricsCollector.snapshot() });
            } else {
                res.json(base);
            }
        });

        this.app.get('/', (_req, res) => {
            const base: any = {
                message: 'Specly Backend API',
                version,
                mode: this.opts.dev ? 'development' : 'production',
                endpoints: { mcp: mcpBase, health: healthPath },
                cors: this.opts.dev ? 'enabled for localhost development' : 'disabled',
                note: this.opts.dev ? `UI should be running separately on ${this.opts.info?.uiHintUrl ?? 'http://localhost:5173'}` : 'Backend API only',
            };
            if (apiBase !== null) {
                base.endpoints.api = apiBase;
            }
            res.json(base);
        });
    }

    async start() {
        if (this.server) return;
        await new Promise<void>((resolve, reject) => {
            const httpServer = this.app.listen(this.opts.port, () => {
                if (this.opts.dev) {
                    console.log(`Server running on http://localhost:${this.opts.port}`);
                }
                resolve();
            });
            this.server = httpServer;
            httpServer.on('error', (err: any) => {
                if (err && err.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${this.opts.port} is already in use`));
                } else {
                    reject(err);
                }
            });
        });
    }

    async stop() {
        await new Promise<void>((resolve) => {
            if (!this.server) return resolve();
            this.server.close(() => resolve());
            this.server = null;
        });
    }
}

export function createExpressServer(opts: ExpressServerOptions) {
    return new ExpressServer(opts);
}
