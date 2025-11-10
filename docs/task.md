# Tasks

## Task ID: SP-030
- **Title**: Replace Express middleware with Hono-native API module
- **Description**: Rebuild Specly REST API so it runs on Hono instead of Express. Port the router, middleware, controllers, rate limiter, and SSE manager to Hono primitives and mount them under `/api` from `setupSpeclyApi`. Ensure responses stay JSON-compatible, adopt `packages/mcp-kit/src/server/core/middleware.ts` helpers where possible, and remove Express-only utilities from the codebase.
- **Priority**: High
- **Dependencies**: None
- **Status**: Backlog
- **Progress**: 0
- **Notes**: Requires revisiting every controller in `apps/specly-server/src/api` as well as feature tests that instantiate Express apps.
- **Connected File List**: apps/specly-server/src/api/router.ts, apps/specly-server/src/api/middleware.ts, apps/specly-server/src/api/**/*.ts, apps/specly-server/src/index.ts, apps/specly-server/src/test-utils/**

## Task ID: SP-031
- **Title**: Update Specly API tests and SSE handling for Hono runtime
- **Description**: Adapt integration/unit tests to exercise the Hono-based API, replacing Express helper bootstraps with `@hono/node-server` or fetch-based harnesses. Update SSE streaming to use Web Streams/TextEncoder so it works with Hono responses, verify back-pressure behavior, and ensure coverage spans health, task, and rules endpoints. Remove Express dev dependency once all tests and mocks are Hono-native.
- **Priority**: High
- **Dependencies**: SP-030
- **Status**: Backlog
- **Progress**: 0
- **Notes**: Must refactor helpers under `src/__tests__/` that rely on Express app instances.
- **Connected File List**: apps/specly-server/src/__tests__/**/*.ts, apps/specly-server/src/api/router.ts, apps/specly-server/src/api/middleware.ts

## Task ID: SP-032
- **Title**: Centralize local-mode lifecycle endpoints in `mcp-kit`
- **Description**: Move the `/shutdown` and `/transition` control routes, plus common `options.local` logic, into `startMcpServer` so all consumers get consistent local-mode behavior. Provide hooks (`onShutdown`, `onTransition`) for app-specific cleanup, update Specly to consume the shared implementation, and delete duplicated route handlers from `apps/specly-server`.
- **Priority**: High
- **Dependencies**: None
- **Status**: Backlog
- **Progress**: 0
- **Notes**: Requires changes in `packages/mcp-kit/src/server/server-starter.ts` and Specly instance-manager wiring.
- **Connected File List**: packages/mcp-kit/src/server/server-starter.ts, packages/mcp-kit/src/server/local/node-instance/index.ts, apps/specly-server/src/index.ts, apps/specly-server/src/server/instance-manager.ts

## Task ID: SP-033
- **Title**: Consolidate CLI option parsing between Specly and mcp-kit
- **Description**: Remove duplicate `--force-seed` handling by extending the generic `parseCliArgs` configuration instead of re-parsing inside Specly’s wrapper. Ensure environment variables (`SPECLY_FORCE_SEED`, `STDIO_MODE`) are resolved once, expose typed hooks for app-specific flags, and update CLI help text accordingly.
- **Priority**: Medium
- **Dependencies**: SP-032
- **Status**: Backlog
- **Progress**: 0
- **Notes**: Aligns Specly CLI with other consumers and shrinks maintenance surface.
- **Connected File List**: packages/mcp-kit/src/utils/cli-parser.ts, packages/mcp-kit/src/server/server-starter.ts, apps/specly-server/src/utils/cli-parser.ts, apps/specly-server/src/index.ts

## Task ID: SP-034
- **Title**: Reduce duplication in Specly instance manager wrapper
- **Description**: Refactor `SpeclyInstanceManager` to extend or compose `InstanceManager` without re-declaring every method. Introduce typed hooks for background job lifecycle, migrate HTTP control helpers to the shared location from SP-032, and document any app-specific behaviors.
- **Priority**: Medium
- **Dependencies**: SP-032
- **Status**: Backlog
- **Progress**: 0
- **Notes**: Simplifies maintenance and ensures future `InstanceManager` changes propagate automatically.
- **Connected File List**: apps/specly-server/src/server/instance-manager.ts, packages/mcp-kit/src/server/local/node-instance/index.ts
- **Title**: Define module boundaries and ownership
