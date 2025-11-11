# Tasks

## Task ID: SP-043
- **Title**: Unify HTTP proxy implementation in mcp-kit
- **Description**: Deduplicate the logic between `ProxyManager.start` and `startHonoProxy` by introducing a single proxy abstraction that supports both start and stop semantics with metadata injection. Update `InstanceManager` and `startMcpServer` to consume the unified implementation, and refresh related tests.
- **Priority**: High
- **Dependencies**: None
- **Status**: Backlog
- **Progress**: 0
- **Notes**: Existing duplication lives in `packages/mcp-kit/src/server/local/proxy/index.ts`. `InstanceManager` still instantiates `ProxyManager`, while `startMcpServer` invokes `startHonoProxy`, leading to divergent behaviour.
- **Connected File List**: packages/mcp-kit/src/server/local/proxy/index.ts, packages/mcp-kit/src/server/local/node-instance/index.ts, packages/mcp-kit/src/server/server-starter.ts

## Task ID: SP-044
- **Title**: Replace custom build.js pipeline in mcp-kit
- **Description**: Retire the bespoke `build.js` script and adopt a standard Rsbuild (or equivalent) configuration to produce the multi-target bundles. Ensure TypeScript declaration generation flows through the native toolchain without shell copy hacks, and align package scripts.
- **Priority**: Medium
- **Dependencies**: None
- **Status**: Done
- **Progress**: 100
- **Notes**: `packages/mcp-kit/build.js` orchestrates multiple esbuild calls plus shell `find|cp` commands despite `rsbuild.config.ts` defining similar bundles. The current `build` script also invokes `tsc` twice.
- **Connected File List**: packages/mcp-kit/build.js, packages/mcp-kit/rsbuild.config.ts, packages/mcp-kit/package.json

## Task ID: SP-045
- **Title**: Remove deprecated dev flag from BaseCliOptions
- **Description**: Drop the `dev` property from `BaseCliOptions`, stop toggling it in `parseCliArgs`, and refactor consumers to rely solely on the `local` flag. Update downstream types, runtime checks, and tests.
- **Priority**: High
- **Dependencies**: None
- **Status**: Backlog
- **Progress**: 0
- **Notes**: The CLI parser currently sets both `local` and `dev` when `--local/--dev` is passed, and Specly still reads `options.dev`. Tests assert the property, reintroducing the deprecated flag.
- **Connected File List**: packages/mcp-kit/src/utils/cli-parser.ts, packages/mcp-kit/src/server/server-starter.ts, apps/specly-server/src/index.ts, apps/specly-server/src/__tests__/cli-parser.test.ts

## Task ID: SP-046
- **Title**: Localize force-seed flag handling to Specly server
- **Description**: Remove the built-in `--force-seed` handling from mcp-kit CLI parsing and type definitions so that only Specly injects the flag via its custom parser. Update Specly typings and tests accordingly.
- **Priority**: High
- **Dependencies**: SP-045
- **Status**: Done
- **Progress**: 100
- **Notes**: `parseCliArgs` currently recognizes `--force-seed` globally, and `ExtendedCliOptions` exposes the field. The toolkit should remain agnostic while Specly's `cliConfig.customOptionsParser` derives the value.
- **Connected File List**: packages/mcp-kit/src/utils/cli-parser.ts, packages/mcp-kit/src/server/server-starter.ts, apps/specly-server/src/index.ts, apps/specly-server/src/__tests__/cli-parser.test.ts

## Task ID: SP-047
- **Title**: Restrict direct access to Hono MCP server constructors
- **Description**: Stop exporting `startHonoMcpServer` and `createHonoMcpServer` from the public `@omar391/mcp-kit/server` entry point. Ensure external callers only use `startMcpServer`, providing internal seams for tests where necessary.
- **Priority**: Medium
- **Dependencies**: None
- **Status**: Backlog
- **Progress**: 0
- **Notes**: Specly’s tests mock the lower-level APIs because they remain publicly exported. Product direction requires `startMcpServer` to be the sole external surface.
- **Connected File List**: packages/mcp-kit/src/server/index.ts, packages/mcp-kit/src/server/hono-starter.ts, apps/specly-server/src/__tests__/cli-stdio-bootstrap.test.ts

## Task ID: SP-048
- **Title**: Prune unused dependencies and scripts
- **Description**: Audit all package manifests to remove stale Express/http-proxy dependencies and redundant scripts. Update build configs to drop unused externals and regenerate the lockfile if required.
- **Priority**: High
- **Dependencies**: None
- **Status**: Done
- **Progress**: 100
- **Notes**: Root and Specly server `package.json` files still list `express`, `http-proxy`, and related `@types` despite no runtime usage. Rsbuild externals reference them as well.
- **Connected File List**: package.json, apps/specly-server/package.json, packages/mcp-kit/package.json, apps/specly-server/rsbuild.config.ts

## Task ID: SP-049
- **Title**: Remove unused SpeclyInstanceManager wrapper
- **Description**: Delete `SpeclyInstanceManager` and migrate any remaining lifecycle tests to rely on `SpeclyServer` plus the shared `InstanceManager`. Ensure background job start/stop flows remain covered.
- **Priority**: Medium
- **Dependencies**: SP-043
- **Status**: Backlog
- **Progress**: 0
- **Notes**: `apps/specly-server/src/index.ts` now wires background jobs directly, yet the wrapper class and integration tests persist, increasing maintenance overhead.
- **Connected File List**: apps/specly-server/src/server/instance-manager.ts, apps/specly-server/src/__tests__/instance-manager.integration.test.ts, apps/specly-server/src/server/__tests__/instance-manager.integration.test.ts
