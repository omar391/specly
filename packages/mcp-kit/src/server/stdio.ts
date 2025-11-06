import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export interface StdioServerConfig {
  serverName: string;
  serverVersion: string;
  handlers: {
    listTools: () => Promise<any> | any;
    handleToolCall: (name: string, args: Record<string, unknown>) => Promise<any>;
  };
  debug?: boolean;
}

export async function startStdioServer(config: StdioServerConfig): Promise<void> {
  const { serverName, serverVersion, handlers, debug } = config;

  if (debug) {
    const originalError = console.error;
    console.log = (...args) => originalError('[DEBUG]', ...args);
    console.error = (...args) => originalError('[DEBUG]', ...args);
    console.error(`[DEBUG] Starting ${serverName} MCP server in STDIO mode (stderr logging)`);
  }

  const server = new Server(
    { name: serverName, version: serverVersion },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, handlers.listTools);
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await handlers.handleToolCall(name, (args ?? {}) as Record<string, unknown>);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (debug) {
    console.error(`[DEBUG] ${serverName} MCP server connected to stdio`);
  }
}
