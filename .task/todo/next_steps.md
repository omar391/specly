# Next Steps (as of 2025-09-09)

Update (2025-09-09): SP-016 completed (task dependencies, status guard, sessions endpoint). API docs and task trackers updated; targeted tests green and typecheck clean. Shifting focus to validator hardening (SP-018) and lease enforcement tests (SP-019).

Focus: SP-018 Graph & Transition Validation; SP-019 Session lease enforcement tests

Status: SP-008 remains complete
- Final tables in place (workspace: `tasks`, `task_dependencies`, `sessions` | global: Specly tables)
- API + services use Specly statuses: queued | in_progress | awaiting_input | blocked | paused | completed | failed
- Programmatic migrations create final schema and rebuild/upgrade legacy tables on detection

Immediate next actions:
1) SP-018: Finish validator hardening and coverage
   - Add/confirm tests for: duplicate ordered_specs, negative/float priorities rejection, unreachable with allow_unreachable flag off, deterministic edge ordering impacts hash (already covered, re-assert post refactors)
   - Ensure all publish/create endpoints use validator + public error mapping consistently
   - Documentation touch-ups: specly-architecture.md §13.1 normalization guarantees (done) — verify references from README/api-design

2) SP-019: Lease enforcement and conflict tests
   - Tests: lease acquire/renew failure mapping (409), force_start transfers ownership, resume with mismatched client rejected, awaiting_input idle semantics
   - Extend ToolsExecuteController mapping if any 409 paths missing; keep behavior Specly-only

3) Document explicit decision on external_references and tags
   - Keep as first-class columns alongside assets and metadata; use metadata for free-form
   - Update docs where needed (api-design.md and specly-architecture.md appendix)

4) Task sync providers rename (optional, small)
   - Rename `remote_interfaces` → `task_sync_providers` (tables, indices, code refs)
   - Programmatic migration + drizzle-kit SQL follow-up; no shims

5) Migrations scaffolding
   - Scaffold drizzle-kit migrations mirroring current schema for reproducible versioning
   - Keep programmatic bootstrap for tests; wire CI/dev to run generated SQL

Acceptance for this next iteration:
- SP-018 validator finalized with tests green and docs aligned
- SP-019 lease tests implemented with clear 409 mappings and force_start behavior
- Docs updated to reflect external_references/tags decision
- Optional rename planned/scaffolded without impacting runtime
- All tests and typechecks green

Deferred/Optional:
- Sessions listing filters expansion and tasks index filters (server + UI)
- Final rename of New-suffixed methods to drop “New” after wrapper removal (small follow-up)
