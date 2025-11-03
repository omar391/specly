# Next Steps (as of 2025-11-03)

Update (2025-11-03 Final): SP-018 and SP-019 completed. Full test suite passing (181/181). Backend core validation and lease enforcement tests complete.

Completed in this session:
- SP-018: Graph & Transition Validation (100%) - 9 validation tests including float priority rejection
- SP-019: Session Lease & Force-Start Enforcement Tests (100%) - 5 lease tests covering conflict, force_start, ownership, idle state
- SP-008: Status corrected to Done 100% in current.md
- Full test suite validated: 181 tests passing

Backend readiness checkpoint:
- Core execution complete: SP-001, SP-003, SP-004, SP-005, SP-006, SP-010
- API endpoints complete: SP-014, SP-015, SP-016
- Validation complete: SP-018, SP-019
- Hashing functional (SP-002 at 80%, optimizations deferred)

Immediate next actions (post-checkpoint):
1) Documentation sync (SP-201 partial)
   - Update README with quickstart showing spec → tool version → execute flow
   - Sync api-design.md with completed endpoint examples
   - Update specly-architecture.md references

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
