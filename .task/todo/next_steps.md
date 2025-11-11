# Next Steps

- **SP-033 Implementation Steps**:
  - Remove `apps/specly-server/src/utils/cli-parser.ts` (duplicate of mcp-kit's parser)
  - Extend `ExtendedCliOptions` in `packages/mcp-kit/src/server/server-starter.ts` to add `forceSeed?: boolean;`
  - Update Specly's `apps/specly-server/src/index.ts` to import `parseCliArgs` from `@omar391/mcp-kit/utils/cli-parser` instead of local
  - Configure `cliConfig.customOptionsParser` in Specly to parse `--force-seed` flag and `SPECLY_FORCE_SEED` env var
  - Update help text via `cliConfig` to include `--force-seed` description
  - Ensure all current flags/options work identically with no regressions

- **SP-032 Implementation Steps**:
  - ✅ Add `onShutdown` and `onTransition` hook signatures to `ServerConfig.localMode` in `packages/mcp-kit/src/server/server-starter.ts`
  - ✅ Implement `/shutdown` and `/transition` control routes in `startMcpServer` that call the hooks if defined
  - ✅ Update Specly's `apps/specly-server/src/index.ts` to pass `onShutdown: (im) => im.stopBackgroundJobs()` and `onTransition: (im) => { im.stopBackgroundJobs(); spawn new process }` to the config
  - ✅ Remove Specly's bespoke `/shutdown` and `/transition` handlers from `apps/specly-server/src/server/instance-manager.ts`
  - Update any related tests in `packages/mcp-kit/src/__tests__/` and `apps/specly-server/src/server/__tests__/`
  - Ensure Specly's instance-manager wiring uses the shared implementation without compatibility shims

- ✅ Design updated test harness (including SSE streaming assertions) so SP-031 changes slot in cleanly.
  - **Base Test Setup**: Replace `express()` app creation with `new Hono()`; remove `body-parser` as Hono handles JSON natively
  - **Request Testing**: Use `@hono/hono/test-utils` or create fetch-based testClient that mimics supertest API
  - **Middleware Testing**: Adapt middleware to Hono's `(c, next)` signature; test with Hono's testClient
  - **SSE Testing**: Use Hono's `c.streamSSE()`; create test utilities to collect streamed events and assert on event data/types
  - **Error Testing**: Replace Express error propagation with Hono's throw/catch; assert on response status/data
  - **Database Integration**: Keep existing DatabaseService setup; mount Hono app under test path
  - **Assertion Helpers**: Update response parsing from `res.body` to direct JSON parsing in testClient
  - **Backwards Compatibility**: Ensure testClient provides similar API to supertest for minimal test changes
- ✅ Draft shared local-mode hook signatures in `startMcpServer` to validate SP-032/SP-034 requirements with Specly's background jobs.
  - **Add to ServerConfig.localMode**:
    - `onShutdown?: (instanceManager: IInstanceManager, options: T) => Promise<void> | void;`
    - `onTransition?: (instanceManager: IInstanceManager, options: T) => Promise<void> | void;`
  - **In startMcpServer setupRoutes**: Add control routes `/shutdown` and `/transition` that call the hooks if defined
  - **For Specly**: Use `onShutdown: (im) => im.stopBackgroundJobs()`, `onTransition: (im) => { stop jobs; spawn new process }`
  - **SP-034 Prep**: Specly can drop SpeclyInstanceManager wrapper, use InstanceManager directly, and handle background jobs via hooks
- ✅ Outline CLI flag handling flow so SP-033 can drop duplicate parsing without regressions.
  - **Remove**: `apps/specly-server/src/utils/cli-parser.ts` (duplicate of mcp-kit's parser)
  - **Extend ExtendedCliOptions**: Add `forceSeed?: boolean;`
  - **Use shared parseCliArgs**: Import from `@omar391/mcp-kit/utils/cli-parser`
  - **Configure cliConfig**: Set `customOptionsParser` to parse `--force-seed` flag and `SPECLY_FORCE_SEED` env
  - **Update help text**: Add `--force-seed` description via cliConfig
  - **No regressions**: Ensure all current flags/options work identically
- ✅ Document proxy call-sites and required API changes ahead of SP-035 so `http-proxy` can be removed without breaking tests.
  - **Call-sites to update**:
    - `InstanceManager.startProxy()`: Change to use `startHonoProxy()`, update return type from `HttpServer` to `void`
    - `packages/mcp-kit/src/__tests__/base-instance-manager.test.ts`: Replace `ProxyManager` instantiation with `startHonoProxy` calls
    - `apps/specly-server/src/server/instance-manager.ts`: Remove `proxyManager` getter if no longer needed
  - **API Changes**: `startProxy` method signature change; ensure proxy port is still accessible
  - **Dependency Removal**: Delete `http-proxy` package and `ProxyManager` class
  - **Test Updates**: Adjust assertions to match Hono proxy behavior, ensure no raw `http.Server` access needed
  
