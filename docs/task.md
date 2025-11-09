# Active Tasks

## Task ID: TP-205
- **Title**: Design pluggable MCP server bootstrap API
- **Description**: Replace `startMcpNodeServer` with a transport-agnostic `startMcpServer` entry point that supports Express and edge runtimes via a discriminated union, keeps sensible defaults, and preserves coordination hooks.
- **Priority**: High
- **Dependencies**: None
- **Status**: Done
- **Progress**: 100%
- **Notes**: Captured current orchestrator responsibilities and invariants in `.task/project.md §21`. Replaced the adapter registry with a discriminated union (`kind: 'express' | 'edge'`) plus overloads, removed `startMcpNodeServer`, updated README usage docs, expanded orchestrator tests to cover the new shapes via `pnpm --filter @omar391/mcp-kit test -- --runTestsByPath packages/mcp-kit/src/server/__tests__/start-node-server.test.ts --reporter basic`, documented migration steps in `packages/mcp-kit/CHANGELOG.md`, and re-ran the targeted bootstrap suite (99 tests passing on 2025-11-09). Exposed `McpEdgeHandler`/`CreateEdgeHandlerOptions`, aligned the express transport to import `MCPToolHandlers` from the adapter source, tightened the overload guard test to require `kind`, and re-ran the targeted suite at 17:26 UTC after the TypeScript fixes (still green).
- **Connected File List**: packages/mcp-kit/src/server/index.ts, packages/mcp-kit/src/server/express/index.ts, packages/mcp-kit/src/server/express/transport.ts, packages/mcp-kit/src/server/express/server.ts, packages/mcp-kit/src/server/edge/index.ts, packages/mcp-kit/src/server/__tests__/start-node-server.test.ts, apps/specly-server/src/index.ts

## Task ID: TP-206
- **Title**: Adopt new MCP server bootstrap in Specly
- **Description**: Update `apps/specly-server/src/index.ts` and related hooks to consume the new pluggable bootstrap defaults, ensuring Specly keeps Express behavior while enabling future edge deployment.
- **Priority**: High
- **Dependencies**: TP-205
- **Status**: Done
- **Progress**: 100%
- **Notes**: Swapped Specly entrypoint to `startMcpServer({ kind: 'express', ... })`, removed the custom `InstanceManager.port` getter so tests can assign the port, re-ran the targeted Specly suites (`pnpm --filter specly-server test -- --runTestsByPath apps/specly-server/src/__tests__/express-server.test.ts apps/specly-server/src/__tests__/instance-manager.integration.test.ts --reporter basic`) with all checks passing, reviewed Specly-specific hooks/background jobs against the new bootstrap seams (no code changes needed), added a dedicated stdio-mode regression test (`apps/specly-server/src/__tests__/cli-stdio-bootstrap.test.ts`) to confirm `autoProxy: false` still launches the stdio proxy (validated via `pnpm --filter specly-server test -- --runTestsByPath apps/specly-server/src/__tests__/cli-stdio-bootstrap.test.ts --reporter basic`), and extended the CLI adoption to honor `--dev`/`--no-kill` while updating docs plus rerunning the CLI suites (`pnpm --filter specly-server test -- --runTestsByPath apps/specly-server/src/__tests__/cli-stdio-bootstrap.test.ts apps/specly-server/src/__tests__/cli-parser.test.ts`). Patched the CLI stdio bootstrap test to type the `process.exit` spy correctly and revalidated the full Specly suite (1578 tests passing at 17:26 UTC).
- **Connected File List**: apps/specly-server/src/index.ts, apps/specly-server/src/server/specly-express-hooks.ts, apps/specly-server/src/__tests__/cli-stdio-bootstrap.test.ts, README.md, docs/specly-architecture.md, packages/mcp-kit
