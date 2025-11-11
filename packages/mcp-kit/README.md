# @omar391/mcp-kit

**Universal MCP (Model Context Protocol) toolkit** for building MCP servers that work across all JavaScript runtimes.

## Features

- 🌍 **Universal Runtime Support**: Single codebase works in Node.js, Bun, Cloudflare Workers, Vercel Edge, Netlify Edge, and other JavaScript environments
- ⚡ **Hono Framework**: Ultra-fast, lightweight HTTP framework with zero cold starts
- 🔄 **Cross-Runtime Compatibility**: Automatic runtime detection and conditional feature loading
- 🧰 **Type-Safe Tool Handlers**: Strongly typed MCP tool definitions with validation
- 📦 **Multi-Target Builds**: Separate optimized builds for different runtime environments
- 🛠️ **Framework Agnostic**: No external dependencies in universal builds

## Installation

```bash
npm install @omar391/mcp-kit
# or
pnpm add @omar391/mcp-kit
```

## Quick Start

### Universal MCP Server

Create an MCP server that works everywhere:

```typescript
import { createHonoMcpServer } from '@omar391/mcp-kit/server/core/hono-mcp';
import { createToolHandlers } from '@omar391/mcp-kit/server/handlers';

const toolHandlers = createToolHandlers([
  {
    name: 'greet',
    description: 'Greet someone by name',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    },
    handler: async ({ name }) => ({
      content: [{ type: 'text', text: `Hello, ${name}!` }]
    })
  }
]);

const app = createHonoMcpServer({
  serverInfo: { name: 'my-mcp-server', version: '1.0.0' },
  toolHandlers
});

// Deploy anywhere:
// - Node.js: app.listen(3000)
// - Cloudflare Workers: export default { fetch: app.fetch }
// - Vercel Edge: export default app
```

### Runtime-Specific Features

Access Node.js-specific features when available:

```typescript
import { detectRuntime, isNodeLike } from '@omar391/mcp-kit/server/core/runtime';

if (isNodeLike()) {
  // Node.js/Bun specific features available
  const { startMcpServer } = await import('@omar391/mcp-kit/server');

  const result = await startMcpServer({
    serverName: 'my-server',
    serverVersion: '1.0.0',
    toolHandlers,
    defaultPort: 3000
  });
} else {
  // Universal deployment
  export default { fetch: app.fetch };
}
```

## Architecture

The new universal architecture is built around Hono and provides:

### Universal Core (`server/core/`)
- **`hono-mcp.ts`**: Universal MCP server implementation using Hono
- **`handlers.ts`**: Type-safe tool handler creation and validation
- **`middleware.ts`**: MCP protocol middleware and error handling
- **`runtime.ts`**: Runtime detection and environment-specific utilities
- **`types.ts`**: Shared TypeScript types and interfaces

### Local Features (`server/local/`)
- **`node-instance/`**: Multi-instance coordination and process management
- **`port-manager.ts`**: Port allocation and conflict resolution
- **`process-manager.ts`**: Process lifecycle and signal handling

### Client & Utilities
- **`client.ts`**: MCP client for connecting to MCP servers
- **`utils/cli-parser.ts`**: Command-line argument parsing utilities

## Runtime Compatibility

| Runtime | Universal Core | Local Features | Notes |
|---------|----------------|----------------|-------|
| Node.js | ✅ | ✅ | Full feature support |
| Bun | ✅ | ✅ | Full feature support |
| Cloudflare Workers | ✅ | ❌ | Universal only |
| Vercel Edge | ✅ | ❌ | Universal only |
| Netlify Edge | ✅ | ❌ | Universal only |
| Deno | ✅ | ❌ | Universal only |
| Browser | ✅ | ❌ | Universal only |

## API Reference

### Universal Core

#### `createHonoMcpServer(options)`

Creates a universal MCP server using Hono.

```typescript
interface HonoMcpOptions {
  serverInfo: { name: string; version: string };
  toolHandlers: MCPToolHandlers;
}

const app = createHonoMcpServer(options);
```

#### `createToolHandlers(tools)`

Creates type-safe MCP tool handlers.

```typescript
const handlers = createToolHandlers([
  {
    name: 'my-tool',
    description: 'Tool description',
    inputSchema: { /* JSON Schema */ },
    handler: async (args) => ({ content: [{ type: 'text', text: 'result' }] })
  }
]);
```

### Runtime Detection

#### `detectRuntime()`

Returns detailed runtime information.

```typescript
const runtime = detectRuntime();
// { name: 'node', version: '18.17.0', isNodeLike: true, ... }
```

#### `isNodeLike()`

Returns true for Node.js and Bun environments.

### Local Features (Node.js/Bun only)

#### `startMcpServer(options)`

Starts an MCP server with multi-instance coordination and local features.

## Breaking Changes

### v0.1.0 → v1.0.0

**🚨 MAJOR BREAKING CHANGE**: Complete architecture rewrite with zero backward compatibility.

The previous Express/Edge specific APIs have been replaced with a universal Hono-based core. There is **no migration path** - existing code must be rewritten.

#### What Changed

- **Removed**: All Express and Edge specific modules
- **Removed**: Multi-instance coordination from core
- **Added**: Universal Hono-based MCP server
- **Added**: Runtime detection and conditional features
- **Added**: Cross-runtime compatibility

#### Migration Required

**There is no automated migration.** You must rewrite your MCP server implementation:

```typescript
// OLD (v0.1.0) - NO LONGER WORKS
import { startMcpServer } from '@omar391/mcp-kit/server';
const result = await startMcpServer({
  kind: 'express',
  toolHandlers,
  // ... other options
});

// NEW (v1.0.0) - REQUIRED
import { createHonoMcpServer } from '@omar391/mcp-kit/server/core/hono-mcp';
import { createToolHandlers } from '@omar391/mcp-kit/server/handlers';

const toolHandlers = createToolHandlers([/* your tools */]);
const app = createHonoMcpServer({
  serverInfo: { name: 'my-server', version: '1.0.0' },
  toolHandlers
});

// For Node.js deployment
if (typeof process !== 'undefined') {
  const { startMcpServer } = await import('@omar391/mcp-kit/server');
  await startMcpServer({
    serverName: 'my-server',
    serverVersion: '1.0.0',
    toolHandlers,
    defaultPort: 3000
  });
} else {
  // Universal deployment
  export default { fetch: app.fetch };
}
```

#### Key Differences

1. **Tool Handlers**: Now created with `createToolHandlers()` instead of plain objects
2. **Server Creation**: `createHonoMcpServer()` instead of `startMcpServer()`
3. **Runtime Detection**: Check runtime before using Node.js-specific features
4. **Deployment**: Single universal build works everywhere

### Recommended Upgrade Path

1. **Audit**: Identify all usage of old APIs
2. **Rewrite**: Implement new universal server pattern
3. **Test**: Verify functionality across target runtimes
4. **Deploy**: Use appropriate build target for your environment

## Deployment Examples

### Node.js / Bun

```typescript
import { startMcpServer } from '@omar391/mcp-kit/server';

const result = await startMcpServer({
  serverName: 'my-server',
  serverVersion: '1.0.0',
  toolHandlers,
  defaultPort: 3000
});

console.log(`Server running`);
```

### Cloudflare Workers

```typescript
import { createHonoMcpServer } from '@omar391/mcp-kit/server/core/hono-mcp';

const app = createHonoMcpServer({ /* options */ });

export default {
  fetch: app.fetch
};
```

### Vercel Edge Functions

```typescript
import { createHonoMcpServer } from '@omar391/mcp-kit/server/core/hono-mcp';

const app = createHonoMcpServer({ /* options */ });

export const config = { runtime: 'edge' };
export default app;
```

## Build Targets

The package provides multiple build targets for optimal deployment:

- **`universal`**: Works everywhere, no Node.js APIs (default)
- **`node`**: Includes Node.js-specific features and APIs
- **`browser`**: Minimal build for browser environments

Use conditional exports to automatically get the right build:

```json
{
  "imports": {
    "@omar391/mcp-kit": {
      "node": "@omar391/mcp-kit/dist/node/index.js",
      "default": "@omar391/mcp-kit/dist/index.js"
    }
  }
}
```

## License

MIT

## Related

- [MCP Specification](https://modelcontextprotocol.io)
- [Hono Framework](https://hono.dev)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)
