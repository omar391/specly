// Universal exports (work everywhere)
export { createFetchHandler, createUniversalMcpServer } from './core/hono-mcp.js';
export { startMcpServer, type ExtendedCliOptions } from './server-starter.js';
export type { UniversalServerOptions, RuntimeInfo } from './core/types.js';
export { cors, logger, jsonResponse, errorResponse } from './core/middleware.js';
export { detectRuntime, isNodeLike, isEdgeRuntime, getRuntimeInfo } from './core/runtime.js';
export { createToolHandlers, type ToolSpec, type MCPToolHandlers } from './handlers.js';

// Local runtime exports (Node.js/Bun only)
// These will throw an error if imported in edge environments
export { InstanceManager, type IInstanceManager } from './local/node-instance/index.js';
export { startHonoProxy, type HonoProxyOptions } from './local/proxy/index.js';
