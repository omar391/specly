import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';

export interface ProxyMetadata {
    mainVersion?: string;
    mainPort: number;
    instanceId?: string;
    startTime?: number;
}

export interface ProxyStartOptions {
    targetPort: number;
    listenPort?: number;
    metadata?: ProxyMetadata;
}

function createProxyApp(targetPort: number, metadata?: ProxyMetadata): Hono {
    const proxyApp = new Hono();

    proxyApp.all('*', async (c) => {
        const targetUrl = `http://127.0.0.1:${targetPort}${c.req.path}`;
        const upstreamReq = new Request(targetUrl, c.req.raw);

        if (metadata) {
            if (metadata.mainVersion) {
                upstreamReq.headers.set('X-Proxy-Main-Version', metadata.mainVersion);
            }
            if (metadata.instanceId) {
                upstreamReq.headers.set('X-Proxy-Instance-Id', metadata.instanceId);
            }
            if (metadata.startTime) {
                upstreamReq.headers.set('X-Proxy-Start-Time', metadata.startTime.toString());
            }
            upstreamReq.headers.set('X-Proxy-Main-Port', metadata.mainPort?.toString() ?? targetPort.toString());
        }

        try {
            const resp = await fetch(upstreamReq, {
                redirect: 'manual',
            });
            return new Response(resp.body, resp);
        } catch (error) {
            return c.json({ error: 'Proxy error', message: error instanceof Error ? error.message : 'Unknown error' }, 502);
        }
    });

    return proxyApp;
}

export class ProxyManager {
    private server: ServerType | null = null;
    private metadata: ProxyMetadata | null = null;

    async start(options: ProxyStartOptions): Promise<ServerType> {
        const { targetPort, listenPort = 0, metadata } = options;
        const proxyApp = createProxyApp(targetPort, metadata);

        // Store metadata for later access
        this.metadata = metadata ?? { mainPort: targetPort };

        // Start the Hono server and get the underlying HttpServer
        const server = serve({
            fetch: proxyApp.fetch,
            port: listenPort, // Use provided port or 0 for auto-assign
            hostname: '127.0.0.1'
        });

        // Wait for the server to be listening
        await new Promise<void>((resolve) => {
            server.on('listening', () => resolve());
        });

        this.server = server;
        return server;
    }

    async stop(): Promise<void> {
        if (this.server) {
            await new Promise<void>((resolve) => {
                this.server!.close(() => resolve());
            });
            this.server = null;
            this.metadata = null;
        }
    }

    get port(): number | null {
        if (this.server) {
            const address = this.server.address();
            if (typeof address === 'object' && address && 'port' in address) {
                return address.port as number;
            }
        }
        return null;
    }

    getMetadata(): ProxyMetadata | null {
        return this.metadata;
    }
}

export interface HonoProxyOptions {
    targetPort: number;
    listenPort: number;
    metadata?: {
        mainVersion?: string;
        instanceId?: string;
        startTime?: number;
    };
}

export async function startHonoProxy(options: HonoProxyOptions): Promise<ProxyManager> {
    const { targetPort, listenPort, metadata } = options;
    const fullMetadata: ProxyMetadata | undefined = metadata ? {
        ...metadata,
        mainPort: targetPort,
    } : undefined;
    const proxyManager = new ProxyManager();
    await proxyManager.start({ targetPort, listenPort, metadata: fullMetadata });
    return proxyManager;
}