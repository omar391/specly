// Universal exports (work everywhere)
export { createHonoMcpServer, createFetchHandler, createUniversalMcpServer } from './core/hono-mcp.js';
export { startHonoMcpServer } from './hono-starter.js';
export { startMcpServer } from './server-starter.js';
export type { UniversalServerOptions, RuntimeInfo } from './core/types.js';
export { cors, logger, jsonResponse, errorResponse } from './core/middleware.js';
export { detectRuntime, isNodeLike, isEdgeRuntime, getRuntimeInfo } from './core/runtime.js';

// Local runtime exports (Node.js/Bun only)
// These will throw an error if imported in edge environments
export { InstanceManager, type IInstanceManager } from './local/node-instance/index.js';
export { startHonoProxy, type HonoProxyOptions } from './local/proxy/index.js';
