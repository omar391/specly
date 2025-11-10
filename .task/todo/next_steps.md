# Next Steps - Hono Server Restructuring Plan (2025-11-10)

## Current Status
- ✅ Previous Express refactoring completed (SP-001 through SP-009)
- 🔄 Starting Hono-based universal server restructuring (SP-010 onward)
- 📋 Plan designed and documented in task.md
- ⏳ Ready for implementation phase

## Immediate Next Steps (Priority Order)

### Phase 1: Core Hono Foundation (SP-011, SP-019, SP-021)
1. **Create universal Hono MCP core** (`server/core/hono-mcp.ts`)
   - Implement MCP protocol handling with Hono + fetch-to-node bridge
   - Add universal middleware (CORS, logging, health endpoints)
   - Ensure works across Node.js, Bun, Cloudflare Workers, Vercel Edge
   - Test basic MCP request/response cycle

2. **Create shared types and interfaces** (`server/core/types.ts`)
   - Consolidate MCPToolHandlers, server options, and response types
   - Ensure compatibility with existing handlers.ts

3. **Add universal middleware** (`server/core/middleware.ts`)
   - CORS middleware that works everywhere
   - Request logging middleware
   - Health endpoint utilities

4. **Add runtime detection utilities** (`server/core/runtime.ts`)
   - Implement detection for Node.js, Bun, Cloudflare Workers, Vercel Edge
   - Use for conditional loading and environment-specific optimizations

5. **Add build script for universal core**
   - Configure rsbuild for cross-runtime compilation
   - Ensure build output works in all JavaScript runtimes
   - Update package.json scripts

### Phase 2: Local Runtime Separation (SP-012)
4. **Extract local runtime features**
   - Move `instance-manager.ts` → `server/local/node-instance/`
   - Move `proxy.ts` → `server/local/proxy/`
   - Move `port-manager.ts` → `server/local/port-manager.ts`
   - Move `shutdown-manager.ts` → `server/local/process-manager.ts`
   - Move `transport.ts` → `server/local/express-bridge.ts`

5. **Update all imports and dependencies**
   - Fix imports in moved files
   - Ensure local modules don't import universal core
   - Update package.json exports for new paths

### Phase 3: Runtime Examples & Integration (SP-013, SP-014, SP-015, SP-016)
6. **Create runtime deployment examples** (`server/examples/`)
   - Node.js example with @hono/node-server
   - Bun example with Bun.serve
   - Cloudflare Workers example
   - Vercel Edge example
   - Show how the same Hono app deploys to all runtimes

### Phase 4: Integration and Testing (SP-014, SP-015, SP-016, SP-020)
7. **Update main exports** (`server/index.ts`)
   - Conditional loading based on runtime environment
   - Export universal features for all environments
   - Export local features only for Node.js/Bun

8. **Migrate specly-server**
   - Update main server startup to use Hono core + Node.js example
   - Ensure all existing functionality works (API routes, MCP, multi-instance)
   - Test full application

9. **Test edge deployment**
   - Deploy test version to Cloudflare Workers
   - Verify MCP protocol works without local features
   - Validate universal core functionality

10. **Add integration tests for cross-runtime compatibility**
    - Create tests for Node.js, Bun, and edge environment mocks
    - Test MCP protocol handling, middleware, and error scenarios
    - Include end-to-end tool call validation

### Phase 5: Documentation and Cleanup (SP-017, SP-018)
11. **Update documentation**
    - Create migration guide for consumers
    - Document new architecture and deployment options
    - Update README with universal vs local feature explanations
    - Include deployment examples for all runtimes

12. **Remove legacy code**
    - Deprecate old Express/Edge implementations
    - Clean up unused code after migration
    - Final validation and release

## Key Technical Decisions

### Universal vs Local Separation
- **Universal (works everywhere)**: MCP protocol, basic HTTP, middleware, health endpoints
- **Local (Node.js/Bun only)**: Multi-instance coordination, proxying, port management, process signals

### Backwards Compatibility Strategy
- Keep existing Express exports working during transition
- Add new Hono-based exports alongside old ones
- Clear deprecation warnings and migration guides

### Runtime Detection
- Use feature detection or environment variables to conditionally load local features
- Avoid importing Node.js modules in edge environments

## Success Criteria
- ✅ MCP servers deployable to all JavaScript runtimes
- ✅ Existing Node.js functionality preserved
- ✅ Clean separation between universal and local concerns
- ✅ Comprehensive test coverage across environments (including integration tests)
- ✅ Runtime detection and conditional loading working correctly
- ✅ Build system optimized for cross-runtime deployment
- ✅ Clear documentation and migration path

## Risk Mitigation
- Implement incrementally with thorough testing at each phase
- Maintain dual exports during transition period
- Extensive integration testing before removing legacy code
- Clear rollback plan if issues discovered

## Timeline Estimate
- Phase 1 (Core + Utils + Build): 3-4 days
- Phase 2 (Separation): 2-3 days
- Phase 3 (Examples): 3-4 days
- Phase 4 (Integration + Tests): 3-4 days
- Phase 5 (Cleanup): 1-2 days
- **Total: 12-17 days** with testing and validation

