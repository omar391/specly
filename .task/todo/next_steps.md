# Next Steps - Hono Server Restructuring Plan (2025-11-10)

## Current Status
- ✅ Previous Express refactoring completed (SP-001 through SP-009)
- ✅ Phase 1: Core Hono Foundation completed (SP-011)
- ✅ Phase 2: Local Runtime Separation completed (SP-012)
- ✅ Phase 3: Runtime Examples completed (SP-013)
- ✅ Phase 4: Integration completed (SP-014, SP-015, SP-016)
- ✅ Build Configuration Fixed: Switched from Rsbuild to esbuild for proper TypeScript compilation
- ✅ SP-019 Runtime Detection: Implemented comprehensive runtime detection utilities with full test coverage
- 🔄 Next: SP-020 (Integration Tests) or SP-017 (Documentation)
- 📋 Plan designed and documented in task.md

## Immediate Next Steps (Priority Order)

### Phase 4: Integration and Testing ✅ MOSTLY COMPLETED
1. **Update main server exports** (`server/index.ts`) ✅
   - Added universal exports for core Hono functionality
   - Added local runtime exports for Node.js/Bun features
   - Updated package.json exports for all new modules
   - Maintained backwards compatibility

2. **Migrate specly-server** ✅ COMPLETED
   - Updated main server startup to use Hono core + Node.js adapter
   - Fixed main function execution condition for built files
   - Verified all existing functionality works (MCP endpoints, health, multi-instance)
   - Server starts correctly and serves all 12 Specly tools
   - Full application testing successful

3. **Test edge deployment** ✅ COMPLETED
   - Created edge-test.ts script simulating Cloudflare Workers environment
   - Verified universal Hono core works without local Node.js features
   - Tested MCP protocol handling, health endpoints, CORS, and middleware
   - Confirmed edge deployment capability

4. **Fix build configuration issues** ✅ COMPLETED
   - Rsbuild was creating dynamic imports to source files instead of bundled output
   - Switched to esbuild for proper TypeScript compilation and bundling
   - All modules now compile correctly without dynamic imports
   - Tests run successfully (98/101 passing, only 3 timeout issues remain)

5. **Add runtime detection utilities** ✅ COMPLETED
   - Implemented detectRuntime(), isNodeLike(), isEdgeRuntime(), getRuntimeInfo() in server/core/runtime.ts
   - Added comprehensive test suite covering all runtime environments (Node.js, Bun, Deno, Cloudflare, Vercel, Netlify, browser, unknown)
   - Updated server/index.ts to conditionally export local features only in Node.js/Bun environments
   - All 16 runtime detection tests pass

6. **Fix remaining test timeouts** 🔄 NEXT PRIORITY
   - 3 failing tests in base-instance-manager.test.ts (timeout issues, not logic errors)
   - Investigate and fix waitForPort and proxy timeout tests
   - Ensure all 101 tests pass before declaring complete

### Phase 5: Documentation and Cleanup (SP-017, SP-018)
7. **Add integration tests for cross-runtime compatibility** (SP-020)
   - Create integration tests that verify the universal Hono core works across different runtimes
   - Include tests for Node.js, Bun, and mock tests for edge environments
   - Test MCP protocol handling, middleware, and error scenarios
   - Use vitest with environment-specific test runners

8. **Update documentation**
   - Create migration guide for consumers
   - Document new architecture and deployment options
   - Update README with universal vs local feature explanations
   - Include deployment examples for all runtimes

9. **Remove legacy code**
   - Deprecate old Express/Edge implementations
   - Clean up unused code after migration
   - Final validation and release

## Key Technical Decisions

### Universal vs Local Separation
- **Universal (works everywhere)**: MCP protocol, basic HTTP, middleware, health endpoints
- **Local (Node.js/Bun only)**: Multi-instance coordination, proxying, port management, process signals

### Build System Migration
- **From Rsbuild**: Had issues with TypeScript compilation and dynamic imports
- **To esbuild**: Proper TypeScript compilation, cross-runtime bundling, fast builds
- **Result**: Clean bundled output that works in all JavaScript runtimes

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
- 🔄 Comprehensive test coverage (98/101 tests passing, 3 timeouts to fix)
- ✅ Runtime detection and conditional loading working correctly
- ✅ Build system optimized for cross-runtime deployment
- 🔄 Clear documentation and migration path

## Risk Mitigation
- Implement incrementally with thorough testing at each phase
- Maintain dual exports during transition period
- Extensive integration testing before removing legacy code
- Clear rollback plan if issues discovered

