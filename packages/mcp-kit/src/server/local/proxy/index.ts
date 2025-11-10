import * as http from 'http';
import type { Server as HttpServer } from 'http';

export interface ProxyMetadata {
    mainVersion?: string;
    mainPort: number;
    instanceId?: string;
    startTime?: number;
}

export class ProxyManager {
    private server: HttpServer | null = null;
    private metadata: ProxyMetadata | null = null;

    async start(targetPort: number, metadata?: ProxyMetadata): Promise<HttpServer> {
        // Dynamic import for http-proxy (CommonJS module)
        const httpProxyModule = await import('http-proxy');
        const proxy = (httpProxyModule as any).createProxyServer({
            target: `http://127.0.0.1:${targetPort}`,
            ws: true,
            changeOrigin: true,
            autoRewrite: true,
        });

        const server = http.createServer((req, res) => {
            // Add proxy metadata headers for debugging/tracing
            if (this.metadata) {
                if (this.metadata.mainVersion) {
                    res.setHeader('X-Proxy-Main-Version', this.metadata.mainVersion);
                }
                if (this.metadata.instanceId) {
                    res.setHeader('X-Proxy-Instance-Id', this.metadata.instanceId);
                }
                if (this.metadata.startTime) {
                    res.setHeader('X-Proxy-Start-Time', this.metadata.startTime.toString());
                }
                res.setHeader('X-Proxy-Main-Port', this.metadata.mainPort.toString());
            }

            proxy.web(req, res, {}, (err: Error & { code?: string }) => {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('Proxy error: ' + err?.message);
            });
        });

        server.on('upgrade', (req, socket, head) => {
            proxy.ws(req, socket as any, head);
        });

        await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => resolve()); });
        this.server = server;
        this.metadata = metadata ?? { mainPort: targetPort };
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

// Re-export Hono-based proxy for modern usage
export { startHonoProxy, type HonoProxyOptions } from './hono-proxy.js';