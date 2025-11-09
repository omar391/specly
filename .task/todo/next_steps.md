# Next Steps (as of 2025-11-09 - Updated 17:15 UTC)

## TP-200 · Rename Express server helper
- [x] Replace `server-lite.ts` with `server.ts` and update barrel exports.
- [x] Purge stale build artifacts (`dist/server/express/server-lite.js`) after rename.
- [x] Run `pnpm --filter @omar391/mcp-kit build` and `pnpm --filter specly-server test` to confirm rename is transparent.
- [x] Scan Specly imports for lingering `server-lite` references and update if discovered.

## TP-201 · Implement startMcpNodeServer orchestrator
- [x] Document orchestration responsibilities from `apps/specly-server/src/index.ts` (multi-instance flow, seeding, shutdown).
- [x] Propose minimal `startMcpNodeServer` API surface (options, hooks, lifecycle callbacks).
- [x] Draft implementation sketch aligning with BaseInstanceManager + ExpressServer seams.
- [x] Align `startMcpNodeServer` contexts with `IExpressServer` interface to remove casts and enforce the shared contract.

## TP-202 · Deduplicate Express server integration tests
- [x] Categorize existing Specly express tests into shared vs Specly-only.
- [x] Move shared coverage into `packages/mcp-kit` with equivalent Vitest harness.
- [x] Update Specly suite to consume shared helpers and retain only bespoke assertions.
- [x] Re-run scoped `pnpm --filter @omar391/mcp-kit test` and `pnpm --filter specly-server test` to confirm suites stay green after pruning.
- [ ] Await review feedback; once approved, kick off TP-203 extraction planning.

## TP-203 · Extract shared CLI and instance seams
- [x] Audit Specly CLI and InstanceManager code for generic logic vs Specly-specific behavior. *(identifed reusable CLI parsing flags, version/lock orchestration, and proxy takeover flow separate from Specly seeding + background jobs)*
- [x] Define extraction plan (new abstractions or configuration hooks) for mcp-kit. *(plan: add configurable flag handlers to `parseCliArgs`, introduce `coordinateInstanceRole` helper to manage stale-lock recovery, version transitions, and proxy startup, and update Specly to consume these seams while keeping seeding/background hooks local)*
- [x] Outline testing strategy post-extraction to keep Specly integration green. *(add Vitest coverage for new CLI flag handlers + multi-instance orchestrator in mcp-kit, and rerun Specly `cli`/`instance-manager` suites to verify integration; ensure proxy takeover path mocked in new tests.)*
- [x] Extend `startMcpNodeServer` to optionally delegate instance coordination to `coordinateInstanceRole` (contexts now surface coordination metadata; dedicated Vitest coverage added).
- [x] Document new CLI flag handler and instance coordination APIs within `packages/mcp-kit` (README or docs) and surface usage guidance in Specly docset. *(README now includes CLI parsing/orchestrator examples; `specly-architecture.md §21` records Specly usage guidance.)*
- [x] Evaluate need for a shared CLI runner helper that wraps parsing + `startMcpNodeServer`, keeping Specly seeding/background hooks as callbacks. *(Decision: hold off; Specly still requires dual-mode (HTTP/STDIO) branching, seeding toggles, and diagnostics that would over-complicate a shared runner. Revisit after Specly migrates to `startMcpNodeServer`.)*
- [x] Reconcile documentation/task notes for TP-203 with latest orchestrator adoption (update `docs/task.md` or attest no change needed).
- [x] Prepare diff/self-review package for TP-203 (summaries + pending questions) ahead of approval checkpoint. *(Ready to share with reviewer.)*

## TP-204 · Relocate shared test utilities
- [x] Inventory `apps/specly-server/src/test-utils` for portable helpers. *(Shared candidate: `database-test-helpers.ts` pending abstraction of Specly types; stay-local: `ensure-specs.ts` tied to Specly schema.)*
- [x] Outline abstraction plan for `database-test-helpers` (e.g., generic factory in mcp-kit with Specly-specific adapter).
- [x] Draft relocation checklist: map which Specly helpers now depend solely on `createTestInstanceAccessors` and capture required type adapters.
- [x] Relocate `database-test-helpers` into `packages/mcp-kit` (add Specly wrapper that re-exports typed accessors) and update import sites.
- [x] Run targeted and full suites (`pnpm --filter @omar391/mcp-kit test`, `pnpm --filter specly-server test`) to confirm relocation is transparent.
- [x] Re-home `createDatabaseTestAccessors` outside mcp-kit per feedback; adjust imports and docs accordingly, then rerun relevant test suites.
- [x] Replace the bespoke `ExpressServer` wrapper with shared hooks wired through `startMcpNodeServer`, and update Specly tests to cover the new seams.

## TP-205 · Design pluggable MCP server bootstrap API
> All tracked substeps for TP-205 and TP-206 are complete as of 2025-11-09. No additional next actions remain for these tasks.

## TP-206 · Adopt new MCP server bootstrap in Specly

- [x] Map Specly entrypoint usage of the existing API and identify default hooks to retain.
- [x] Update `apps/specly-server/src/index.ts` to call the new bootstrap helper with Express defaults. *(Now calls `startMcpServer({ kind: 'express', ... })`.)*
- [x] Re-run relevant Specly test suites (CLI, express server) after migration. *(Executed `pnpm --filter specly-server test -- --runTestsByPath apps/specly-server/src/__tests__/express-server.test.ts apps/specly-server/src/__tests__/instance-manager.integration.test.ts --reporter basic` — all passing as of 2025-11-09 15:53 local.)*
- [x] Review Specly-specific hooks (background jobs, graceful shutdown) against new bootstrap seams and document any follow-up adjustments. *(Confirmed hooks run only for MAIN role, background jobs stop on shutdown/transition paths, and proxy callbacks handle both autoProxy=true/false without changes.)*
- [x] Validate CLI stdio path under new bootstrap (ensure `autoProxy: false` still launches stdio proxy correctly) and capture findings/tests. *(Added `apps/specly-server/src/__tests__/cli-stdio-bootstrap.test.ts` to assert the stdio mode path disables `autoProxy` and invokes `startStdioProxy`; run via `pnpm --filter specly-server test -- --runTestsByPath apps/specly-server/src/__tests__/cli-stdio-bootstrap.test.ts --reporter basic` on 2025-11-09.)*
- [x] Review documentation and developer ergonomics (README, `docs/specly-architecture.md §21`) to determine if updates are needed for the new stdio bootstrap behavior before closing TP-206. *(README command reference now reflects `--dev`/`--no-kill` semantics; architecture §21 documents the flag behavior.)*

