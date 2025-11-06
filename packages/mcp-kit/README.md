# @omar391/mcp-kit

**Framework-agnostic MCP (Model Context Protocol) toolkit** for building MCP servers across different runtimes.

## Features

- 🚀 **Multi-runtime support**: Node.js (Express), Edge/Serverless (fetch-based)
- 🔄 **Multi-instance coordination**: Lock-based instance management with proxy support
- 🛠️ **MCP client utilities**: Connect to and call MCP servers programmatically
- 📦 **Tree-shakeable**: Import only what you need via subpath exports

## Installation

```bash
npm install @omar391/mcp-kit
# or
pnpm add @omar391/mcp-kit
```

## Usage

### MCP Client

Connect to an existing MCP server:

```typescript
import { createMCPClient } from '@omar391/mcp-kit/client';

const { client, close } = await createMCPClient({ port: 8989 });
const tools = await client.listTools();
const result = await client.callTool({ name: 'my-tool', arguments: { foo: 'bar' } });
await close();
```

### Express Server Adapter

Attach MCP endpoints to an Express app:

```typescript
import express from 'express';
import { attachMcpExpress } from '@omar391/mcp-kit/server/express';

const app = express();

attachMcpExpress(app, 
  { dev: true, serverName: 'my-mcp', serverVersion: '1.0.0' },
  {
    listTools: async () => ({ tools: [/* ... */] }),
    handleToolCall: async (name, args) => ({ content: [/* ... */] })
  }
);

app.listen(8989);
```

### Edge/Serverless Handler

Use in Cloudflare Workers, Vercel Edge, etc.:

```typescript
import { createMcpEdgeHandler } from '@omar391/mcp-kit/server/edge';

const handler = createMcpEdgeHandler(
  { serverName: 'my-mcp', serverVersion: '1.0.0' },
  {
    listTools: async () => ({ tools: [/* ... */] }),
    handleToolCall: async (name, args) => ({ content: [/* ... */] })
  }
);

// Cloudflare Worker
export default { fetch: handler };

// Vercel Edge
export const config = { runtime: 'edge' };
export default handler;
```

### Multi-Instance Management

Coordinate multiple Node processes with lock-based instance management:

```typescript
import { BaseInstanceManager, InstanceRole } from '@omar391/mcp-kit/node-instance';

const manager = new BaseInstanceManager({ port: 8989, version: '1.0.0' });

const isMain = await manager.tryBecomeMain();
if (isMain) {
  // Start your server
} else {
  // Start as proxy or check version mismatch
  const mainVersion = await manager.fetchMainVersion();
  if (mainVersion !== manager.version) {
    await manager.requestMainTransition();
    // Take over as new main
  } else {
    await manager.startProxy();
  }
}
```

## Architecture

```
@omar391/mcp-kit/
├── client              # MCP client utilities
├── node-instance       # Multi-instance coordination
└── server/
    ├── express         # Express.js adapter (Node.js)
    └── edge            # Fetch-based handler (Edge/Serverless)
```

## API Reference

### Client

- `createMCPClient(options)` - Create and connect MCP client
- `executeMCPToolCall(options)` - One-shot tool execution

### Server Adapters

#### Express
- `attachMcpExpress(app, opts, handlers)` - Attach MCP to Express app
- Handles POST/GET/DELETE `/mcp` with session management

#### Edge
- `createMcpEdgeHandler(opts, handlers)` - Create fetch-style handler
- JSON-RPC 2.0 compatible
- Stateless, serverless-friendly

### Node Instance

- `BaseInstanceManager` - Multi-instance coordinator
  - `tryBecomeMain()` - Atomic lock acquisition
  - `fetchMainVersion()` - Check running instance version
  - `requestMainTransition()` - Graceful takeover
  - `startProxy()` - HTTP proxy to main instance

## TypeScript

Fully typed with TypeScript. All exports include `.d.ts` declarations.

## License

MIT

## Related

- [MCP Specification](https://modelcontextprotocol.io)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)
