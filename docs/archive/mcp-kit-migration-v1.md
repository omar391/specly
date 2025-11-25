# MCP-Kit Migration Guide: v0.1.0 → v1.0.0

## 🚨 Critical Notice

**This is a major breaking change with ZERO backward compatibility.** The v1.0.0 release completely rewrites the architecture from Express/Edge-specific implementations to a universal Hono-based core.

**There is no migration path.** Existing code will not work and must be rewritten from scratch.

## What Changed

### Architecture Overhaul

The previous version was built around Express.js and Edge-specific handlers. The new version uses Hono as a universal HTTP framework that works across all JavaScript runtimes.

### Removed Components

- ❌ `startMcpServer()` with `kind: 'express'` or `kind: 'edge'`
- ❌ `attachMcpExpress()`
- ❌ `createMcpEdgeHandler()`
- ❌ Express-specific server modules
- ❌ Edge-specific server modules
- ❌ Multi-instance coordination in core

### Added Components

- ✅ `createHonoMcpServer()` - Universal MCP server
- ✅ `createToolHandlers()` - Type-safe tool definitions
- ✅ Runtime detection utilities
- ✅ Cross-runtime compatibility
- ✅ Multi-target builds (universal, node, browser)

## Migration Steps

### Step 1: Update Tool Handlers

**Before (v0.1.0):**
```typescript
const toolHandlers = {
  listTools: async () => ({ tools: [...] }),
  handleToolCall: async (name, args) => ({ content: [...] })
};
```

**After (v1.0.0):**
```typescript
import { createToolHandlers } from '@omar391/mcp-kit/server/handlers';

const toolHandlers = createToolHandlers([
  {
    name: 'my-tool',
    description: 'Tool description',
    inputSchema: {
      type: 'object',
      properties: { /* JSON Schema */ },
      required: ['param']
    },
    handler: async (args) => ({
      content: [{ type: 'text', text: 'result' }]
    })
  }
]);
```

### Step 2: Replace Server Creation

**Before (Express):**
```typescript
import { startMcpServer } from '@omar391/mcp-kit/server';

const result = await startMcpServer({
  kind: 'express',
  toolHandlers,
  serverName: 'my-server',
  serverVersion: '1.0.0',
  port: 3000
});
```

**After (Universal):**
```typescript
import { createHonoMcpServer } from '@omar391/mcp-kit/server/core/hono-mcp';

const app = createHonoMcpServer({
  serverInfo: { name: 'my-server', version: '1.0.0' },
  toolHandlers
});

// For Node.js deployment
import { startMcpServer } from '@omar391/mcp-kit/server';

const result = await startMcpServer({
  serverName: 'my-server',
  serverVersion: '1.0.0',
  toolHandlers,
  defaultPort: 3000
});
```

**Before (Edge):**
```typescript
import { startMcpServer } from '@omar391/mcp-kit/server';

const { handler } = await startMcpServer({
  kind: 'edge',
  toolHandlers,
  edge: { serverName: 'my-server', serverVersion: '1.0.0' }
});

export default { fetch: handler };
```

**After (Universal):**
```typescript
import { createHonoMcpServer } from '@omar391/mcp-kit/server/core/hono-mcp';

const app = createHonoMcpServer({
  serverInfo: { name: 'my-server', version: '1.0.0' },
  toolHandlers
});

export default { fetch: app.fetch };
```

### Step 3: Update Imports

**Before:**
```typescript
import { BaseInstanceManager } from '@omar391/mcp-kit/server/express/node-instance';
import { attachMcpExpress } from '@omar391/mcp-kit/server/express';
```

**After:**
```typescript
import { createHonoMcpServer } from '@omar391/mcp-kit/server/core/hono-mcp';
import { createToolHandlers } from '@omar391/mcp-kit/server/handlers';
import { startMcpServer } from '@omar391/mcp-kit/server';
```

### Step 4: Runtime Detection

Add runtime checks for Node.js-specific features:

```typescript
import { isNodeLike } from '@omar391/mcp-kit/server/core/runtime';

if (isNodeLike()) {
  // Use Node.js features
  const { startMcpServer } = await import('@omar391/mcp-kit/server');
  // ... Node.js specific code
} else {
  // Universal deployment
  export default { fetch: app.fetch };
}
```

## Deployment Examples

### Node.js/Bun
```typescript
import { createHonoMcpServer } from '@omar391/mcp-kit/server/core/hono-mcp';
import { startMcpServer } from '@omar391/mcp-kit/server';

const app = createHonoMcpServer({ serverInfo: { name: 'my-server', version: '1.0.0' }, toolHandlers });

const result = await startMcpServer({
  serverName: 'my-server',
  serverVersion: '1.0.0',
  toolHandlers,
  defaultPort: 3000
});
```

### Cloudflare Workers
```typescript
import { createHonoMcpServer } from '@omar391/mcp-kit/server/core/hono-mcp';

const app = createHonoMcpServer({ serverInfo: { name: 'my-server', version: '1.0.0' }, toolHandlers });

export default { fetch: app.fetch };
```

### Vercel Edge
```typescript
import { createHonoMcpServer } from '@omar391/mcp-kit/server/core/hono-mcp';

const app = createHonoMcpServer({ serverInfo: { name: 'my-server', version: '1.0.0' }, toolHandlers });

export const config = { runtime: 'edge' };
export default app;
```

## Compatibility Matrix

| Feature | v0.1.0 | v1.0.0 |
|---------|--------|--------|
| Node.js | ✅ | ✅ |
| Bun | ❌ | ✅ |
| Cloudflare Workers | ✅ (Edge) | ✅ (Universal) |
| Vercel Edge | ✅ (Edge) | ✅ (Universal) |
| Netlify Edge | ❌ | ✅ (Universal) |
| Deno | ❌ | ✅ (Universal) |
| Browser | ❌ | ✅ (Universal) |

## Breaking Change Checklist

- [ ] Update all imports to new paths
- [ ] Replace `startMcpServer()` with `createHonoMcpServer()`
- [ ] Convert tool handlers to `createToolHandlers()` format
- [ ] Add runtime detection for Node.js-specific features
- [ ] Update deployment configuration for target runtime
- [ ] Test across all target environments
- [ ] Update package.json build scripts if needed

## Support

For questions about the new API:
- Check the updated README.md
- Review the examples in the repository
- Open an issue for clarification

**Remember: This is a complete rewrite. Start fresh with the new patterns rather than trying to migrate existing code.**
