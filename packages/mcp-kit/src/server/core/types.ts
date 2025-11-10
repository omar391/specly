import { z } from 'zod';

/**
 * Universal MCP server types that work across all JavaScript runtimes
 */

export interface ToolSpec<T extends z.ZodTypeAny = z.ZodTypeAny, R = any> {
  name: string;
  description: string;
  schema: T;
  exec: (input: z.infer<T>) => Promise<R> | R;
}

export interface MCPToolHandlers {
  listTools: () => Promise<{ tools: Array<{ name: string; description: string; inputSchema: any }> } | { tools: Array<{ name: string; description: string; inputSchema: any }> }>;
  handleToolCall: (name: string, args: Record<string, unknown>) => Promise<any>;
}

export interface UniversalServerOptions {
  toolHandlers: MCPToolHandlers;
  serverName?: string;
  serverVersion?: string;
  cors?: boolean;
  healthEndpoint?: string;
  mcpEndpoint?: string;
}

export interface RuntimeInfo {
  name: string;
  version?: string;
  isNode: boolean;
  isBun: boolean;
  isDeno: boolean;
  isCloudflare: boolean;
  isVercel: boolean;
  isNetlify: boolean;
  hasFetch: boolean;
  hasWebCrypto: boolean;
}

export type { z };