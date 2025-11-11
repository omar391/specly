import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';

export interface ProxyMetadata {
    mainVersion?: string;
    mainPort: number;
    instanceId?: string;
    startTime?: number;
}

export class ProxyManager {
    private server: ServerType | null = null;
    private metadata: ProxyMetadata | null = null;

    async start(targetPort: number, metadata?: ProxyMetadata): Promise<ServerType> {
        const proxyApp = new Hono();

        // Store metadata for later access
        this.metadata = metadata ?? { mainPort: targetPort };

        // Proxy all requests to the target port
        proxyApp.all('*', async (c) => {
            const targetUrl = `http://127.0.0.1:${targetPort}${c.req.path}`;
            const upstreamReq = new Request(targetUrl, c.req.raw);

            // Add proxy metadata headers for debugging/tracing
            if (this.metadata) {
                if (this.metadata.mainVersion) {
                    upstreamReq.headers.set('X-Proxy-Main-Version', this.metadata.mainVersion);
                }
                if (this.metadata.instanceId) {
                    upstreamReq.headers.set('X-Proxy-Instance-Id', this.metadata.instanceId);
                }
                if (this.metadata.startTime) {
                    upstreamReq.headers.set('X-Proxy-Start-Time', this.metadata.startTime.toString());
                }
                upstreamReq.headers.set('X-Proxy-Main-Port', this.metadata.mainPort.toString());
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

        // Start the Hono server and get the underlying HttpServer
        const server = serve({
            fetch: proxyApp.fetch,
            port: 0, // Let the system assign a port
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

export async function startHonoProxy(options: HonoProxyOptions): Promise<void> {
    const { targetPort, listenPort, metadata } = options;

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
            upstreamReq.headers.set('X-Proxy-Main-Port', targetPort.toString());
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

    serve({
        fetch: proxyApp.fetch,
        port: listenPort,
        hostname: '127.0.0.1'
    });
}