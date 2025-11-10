import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

/**
 * Universal middleware that works across all JavaScript runtimes
 */

export interface CorsOptions {
    origin?: string | string[] | ((origin: string) => string | null | undefined);
    allowMethods?: string[];
    allowHeaders?: string[];
    exposeHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}

/**
 * CORS middleware that works in all environments
 */
export function cors(options: CorsOptions = {}): MiddlewareHandler {
    const {
        origin = '*',
        allowMethods = ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH'],
        allowHeaders = ['*'],
        exposeHeaders = [],
        credentials = false,
        maxAge = 86400,
    } = options;

    return async (c, next) => {
        const requestOrigin = c.req.header('Origin');

        // Set CORS headers
        if (typeof origin === 'function') {
            const result = requestOrigin ? origin(requestOrigin) : null;
            if (result) {
                c.header('Access-Control-Allow-Origin', result);
            }
        } else if (Array.isArray(origin)) {
            if (requestOrigin && origin.includes(requestOrigin)) {
                c.header('Access-Control-Allow-Origin', requestOrigin);
            }
        } else {
            c.header('Access-Control-Allow-Origin', origin);
        }

        c.header('Access-Control-Allow-Methods', allowMethods.join(', '));
        c.header('Access-Control-Allow-Headers', allowHeaders.join(', '));

        if (exposeHeaders.length > 0) {
            c.header('Access-Control-Expose-Headers', exposeHeaders.join(', '));
        }

        if (credentials) {
            c.header('Access-Control-Allow-Credentials', 'true');
        }

        c.header('Access-Control-Max-Age', maxAge.toString());

        // Handle preflight requests
        if (c.req.method === 'OPTIONS') {
            return c.body(null, 204);
        }

        await next();
    };
}

/**
 * Request logging middleware
 */
export function logger(): MiddlewareHandler {
    return async (c, next) => {
        const start = Date.now();
        const method = c.req.method;
        const url = c.req.url;

        console.log(`[${new Date().toISOString()}] ${method} ${url} - Start`);

        await next();

        const duration = Date.now() - start;
        const status = c.res.status;

        console.log(`[${new Date().toISOString()}] ${method} ${url} - ${status} (${duration}ms)`);
    };
}

/**
 * JSON response helper
 */
export function jsonResponse(data: any, status = 200, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    });
}

/**
 * Error response helper
 */
export function errorResponse(message: string, status = 500, code?: string) {
    const error: any = { message };
    if (code) {
        error.code = code;
    }
    return jsonResponse({ error }, status);
}