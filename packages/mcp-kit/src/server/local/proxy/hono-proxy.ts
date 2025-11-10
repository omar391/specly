import { Hono } from 'hono';
import { serve } from '@hono/node-server';

export interface HonoProxyOptions {
    targetPort: number;
    listenPort: number;
    metadata?: {
        mainVersion?: string;
        instanceId?: string;
        startTime?: number;
    };
}

/**
 * Creates and starts a Hono-based HTTP proxy server
 * @param options Proxy configuration options
 * @returns Promise that resolves when the server is started
 */
export async function startHonoProxy(options: HonoProxyOptions): Promise<void> {
    const { targetPort, listenPort, metadata } = options;

    const proxyApp = new Hono();

    // Proxy all requests to the target port
    proxyApp.all('*', async (c) => {
        const targetUrl = `http://127.0.0.1:${targetPort}${c.req.path}`;
        const upstreamReq = new Request(targetUrl, c.req.raw);

        // Add proxy metadata headers for debugging/tracing
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
    });
}