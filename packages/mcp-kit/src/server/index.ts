import {
    startMcpExpressServer,
    isHandlersFactory,
    type McpExpressServerOptions,
    type StartNodeServerResult,
    type StartNodeServerMainContext,
    type StartNodeServerProxyContext,
} from './express/transport.js';
import { createMcpEdgeHandler, type CreateEdgeHandlerOptions } from './edge/index.js';
import { BaseInstanceManager } from '../node-instance/index.js';

export type {
    McpExpressServerOptions,
    StartNodeServerResult,
    StartNodeServerMainContext,
    StartNodeServerProxyContext,
} from './express/transport.js';
export { startMcpExpressServer } from './express/transport.js';

export type McpEdgeHandler = ReturnType<typeof createMcpEdgeHandler>;
export type { CreateEdgeHandlerOptions } from './edge/index.js';

export interface StartMcpServerEdgeContext {
    transport: 'edge';
    handler: McpEdgeHandler;
    serverName: string;
    serverVersion: string;
}

type ToolHandlerInput = McpExpressServerOptions['toolHandlers'];

export interface McpServerBaseOptions {
    toolHandlers: ToolHandlerInput;
    serverName?: string;
    serverVersion?: string;
}

export type McpServerExpressOptions = {
    kind: 'express';
} & McpServerBaseOptions &
    Omit<McpExpressServerOptions, 'toolHandlers' | 'serverName' | 'serverVersion'>;

export interface McpServerEdgeOptions extends McpServerBaseOptions {
    kind: 'edge';
    edge?: CreateEdgeHandlerOptions;
}

export type McpServerOptions = McpServerExpressOptions | McpServerEdgeOptions;

export type StartMcpServerResult = StartNodeServerResult | StartMcpServerEdgeContext;

export async function startMcpServer(opts: McpServerExpressOptions): Promise<StartNodeServerResult>;
export async function startMcpServer(opts: McpServerEdgeOptions): Promise<StartMcpServerEdgeContext>;
export async function startMcpServer(opts: McpServerOptions): Promise<StartMcpServerResult> {
    const kind = (opts as { kind?: string }).kind;
    if (kind !== 'express' && kind !== 'edge') {
        throw new Error("[mcp-kit] startMcpServer requires a 'kind' of 'express' or 'edge'.");
    }

    if (opts.kind === 'express') {
        const { kind: _kind, serverName, serverVersion, toolHandlers, ...rest } = opts;
        const expressOptions: McpExpressServerOptions = {
            ...rest,
            toolHandlers,
            serverName,
            serverVersion,
        };
        return await startMcpExpressServer(expressOptions);
    }

    const toolHandlers = isHandlersFactory(opts.toolHandlers)
        ? await opts.toolHandlers()
        : opts.toolHandlers;

    const edgeOverrides = opts.edge ?? {};
    const serverName = edgeOverrides.serverName
        ?? opts.serverName
        ?? 'mcp-kit-edge';

    const serverVersion = edgeOverrides.serverVersion
        ?? opts.serverVersion
        ?? BaseInstanceManager.defaultVersion;

    const handler = createMcpEdgeHandler({
        ...edgeOverrides,
        serverName,
        serverVersion,
    }, toolHandlers);

    return {
        transport: 'edge',
        handler,
        serverName,
        serverVersion,
    } satisfies StartMcpServerEdgeContext;
}
