import { z } from 'zod';

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

export function createToolHandlers(tools: ToolSpec[]): MCPToolHandlers {
  const toolMap = new Map<string, ToolSpec>();
  for (const t of tools) toolMap.set(t.name, t);

  return {
    async listTools() {
      return {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.schema as any,
        })),
      };
    },

    async handleToolCall(name: string, args: Record<string, unknown>) {
      const t = toolMap.get(name);
      if (!t) throw new Error(`Unknown tool: ${name}`);
      const input = t.schema.parse(args);
      return await t.exec(input as any);
    },
  };
}

export type { z };
