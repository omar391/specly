import type { Application, Request, Response } from 'express';
import { Server as MCPServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export interface AttachExpressOptions {
    dev?: boolean;
    serverName?: string;
    serverVersion?: string;
}

export interface MCPToolHandlers {
    listTools: () => Promise<any>;
    handleToolCall: (name: string, args: any) => Promise<any>;
}

interface MCPSession {
    transport: StreamableHTTPServerTransport;
    lastActivity: number;
}

/**
 * Express adapter for MCP server
 * Attaches MCP endpoints (POST/GET/DELETE /mcp) to an Express app with session management
 */
export function attachMcpExpress(app: Application, opts: AttachExpressOptions, toolHandlers: MCPToolHandlers) {
    const mcpServer = new MCPServer(
        { name: opts.serverName ?? 'mcp-server', version: opts.serverVersion ?? '0.1.0' },
        { capabilities: { tools: {} } }
    );

    mcpServer.setRequestHandler(ListToolsRequestSchema, toolHandlers.listTools);
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        return await toolHandlers.handleToolCall(name, args);
    });

    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const sessions: Map<string, MCPSession> = new Map();

    function cleanupSessions() {
        const now = Date.now();
        for (const [sessionId, session] of sessions.entries()) {
            if (now - session.lastActivity > SESSION_TIMEOUT) {
                session.transport.close().catch(() => { });
                sessions.delete(sessionId);
            }
        }
    }

    function generateSessionId(): string {
        return `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    function getOrCreateTransport(sessionId?: string): { transport: StreamableHTTPServerTransport; isNew: boolean; sessionId: string } {
        cleanupSessions();

        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
            const newSessionId = generateSessionId();
            const newTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => newSessionId });
            return { transport: newTransport, isNew: true, sessionId: newSessionId };
        }

        const existing = sessions.get(sessionId);
        if (existing) {
            existing.lastActivity = Date.now();
            return { transport: existing.transport, isNew: false, sessionId };
        }

        const newTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => sessionId });
        return { transport: newTransport, isNew: true, sessionId };
    }

    function setupSSE(req: Request, res: Response, sessionId: string) {
        const session = sessions.get(sessionId);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Mcp-Session-Id': sessionId,
        });

        req.on('close', () => { });
        const keepAlive = setInterval(() => { res.write('\n'); }, 30000);
        res.on('close', () => { clearInterval(keepAlive); });
    }

    function handleDelete(sessionId: string, res: Response) {
        const session = sessions.get(sessionId);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        session.transport.close().catch(() => { });
        sessions.delete(sessionId);
        res.status(200).json({ message: 'Session terminated' });
    }

    app.post('/mcp', (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        (async () => {
            try {
                const { transport, isNew, sessionId: resolved } = getOrCreateTransport(sessionId);
                if (isNew) {
                    await mcpServer.connect(transport);
                    sessions.set(resolved, { transport, lastActivity: Date.now() });
                    res.setHeader('Mcp-Session-Id', resolved);
                }
                await transport.handleRequest(req, res, req.body);
            } catch (err) {
                if (!res.headersSent) {
                    const msg = err instanceof Error ? err.message : String(err);
                    const stack = err instanceof Error ? err.stack : undefined;
                    res.status(500).json({ error: 'Failed to process MCP request', details: opts.dev ? msg : undefined, stack: opts.dev ? stack : undefined });
                }
            }
        })().catch(() => { });
    });

    app.get('/mcp', (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        if (!sessionId) {
            res.status(400).json({ error: 'Mcp-Session-Id header is required' });
            return;
        }
        setupSSE(req, res, sessionId);
    });

    app.delete('/mcp', (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        if (!sessionId) {
            res.status(400).json({ error: 'Mcp-Session-Id header is required' });
            return;
        }
        handleDelete(sessionId, res);
    });
}
