# @omar391/mcp-kit

**Framework-agnostic MCP (Model Context Protocol) toolkit** for building MCP servers across different runtimes.

## Features

- 🚀 **Multi-runtime support**: Node.js (Express), Edge/Serverless (fetch-based)
- 🔄 **Multi-instance coordination**: Lock-based instance management with proxy support
- 🧭 **Server bootstrap seam**: `startMcpServer` (express/edge) and `startMcpExpressServer` wire MCP handlers with coordination helpers
- 🧰 **Extensible CLI parsing**: Shared argument parser with custom flag hooks
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

### CLI Parsing Helpers

Add project-specific flags while keeping the core CLI contract consistent:

```typescript
import { parseCliArgs, displayHelp, type BaseCliOptions } from '@omar391/mcp-kit/utils/cli-parser';

interface SpeclyCliOptions extends BaseCliOptions {
  forceSeed?: boolean;
}

const options = parseCliArgs<SpeclyCliOptions>(process.argv.slice(2), {
  appName: 'Specly Server',
  defaultPort: 3100,
  customFlagHandlers: {
    '--force-seed': ({ options }) => {
      options.forceSeed = true;
    },
  },
});

if (options.help) {
  displayHelp({ appName: 'Specly Server' });
  process.exit(0);
}

// Use extended options to toggle seed/background jobs
if (options.forceSeed) {
  await runSeedRoutine();
}
```

Handlers receive the full argument list and can optionally return the number of additional arguments consumed. A `customOptionsParser` hook is also available for advanced validation or derived defaults.

### MCP Server Bootstrap API

Spin up an MCP server by selecting `'express'` or `'edge'` at the call site while keeping coordination hooks and lifecycle callbacks:

```typescript
import { startMcpServer, InstanceRole } from '@omar391/mcp-kit/server';
import { toolHandlers } from './tools.js';

const result = await startMcpServer({
  kind: 'express',
  toolHandlers,
  serverName: 'specly',
  serverVersion: '2.0.0',
  coordinateInstance: {
    desiredVersion: '2.0.0',
    waitForPortTimeoutMs: 10_000,
  },
  onCoordinateDecision: (decision) => {
    if (decision.status === 'main' && decision.reason === 'version-transition') {
      console.log(`Promoted to main (was ${decision.previousVersion ?? 'unknown'})`);
    }
  },
  onBeforeStart: async ({ coordination }) => {
    if (coordination?.reason === 'initial') {
      await ensureSeedData();
    }
  },
});

if (result.transport === 'edge') {
  // Edge handler returned (see example below)
} else if (result.role === InstanceRole.PROXY) {
  console.log('Proxy mode, forwarding traffic');
}
```

Pass `kind: 'edge'` to receive a fetch-compatible handler:

```typescript
const { handler } = await startMcpServer({
  kind: 'edge',
  toolHandlers,
  edge: { serverName: 'edge-specly', serverVersion: '1.0.0' },
});

export default { fetch: handler };
```

If you prefer to call the Express bootstrap directly, use `startMcpExpressServer(options)` with the same option shape shown above (minus `kind`).

### Test Utilities

Inject and manage test-only dependencies without leaking state into production code:

```typescript
import { createTestInstanceAccessors } from '@omar391/mcp-kit/test-utils/create-test-instance-accessors';

interface Databases {
  drizzleManager: object;
  dbService: object;
}

const instances = createTestInstanceAccessors<Databases>();

instances.setInstances({ drizzleManager, dbService });
const state = instances.getInstances();
expect(state.isInitialized).toBe(true);

instances.resetInstances();
```

The helper wraps `createSharedTestInstanceHelpers` and provides consistent `setInstances`, `resetInstances`, `getInstances`, and `hasInstances` utilities that application packages can re-export under project-specific names.
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
