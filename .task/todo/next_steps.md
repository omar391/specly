# Next Steps (as of 2025-09-09)

Update (2025-09-09): Items 1–3 below are completed in this iteration; API docs and task trackers updated; full test suite green (173/173) and typecheck clean. Proceed with items 5–7 next.

Focus: SP-016 Task dependencies and API cleanup; finalize Specly-only codebase

Status: SP-008 is complete
- Final tables in place (workspace: `tasks`, `task_dependencies`, `sessions` | global: Specly tables)
- API + services use Specly statuses: queued | in_progress | awaiting_input | blocked | paused | completed | failed
- Programmatic migrations create final schema and rebuild/upgrade legacy tables on detection
- Test suite green (172/172)

Immediate next actions:
1) Centralize status transitions (Specly-only)
   - Add small pure util `utils/task-status.ts`:
     - allowedStatuses and canTransition(from, to, opts?) returning { ok, reason? }
     - nextStatuses(from) for UI/help
     - opts may include dependency guardrail toggles (e.g., hasUnresolvedDeps)
   - Wire TasksController to use the util (remove inline transition maps)
   - Tests: happy paths, terminal-state immutability, invalid jumps, dependency guardrail

2) SP-016: Implement dependencies endpoints on `task_dependencies`
   - Endpoints:
     - POST /api/workspaces/:id/tasks/:taskId/dependencies { depends_on: string }
     - DELETE /api/workspaces/:id/tasks/:taskId/dependencies/:dependsOn
     - GET /api/workspaces/:id/tasks/:taskId/dependencies (optional)
   - Rules: no self-dependency, reject duplicates idempotently, 404 on missing tasks, cycle detection (A->...->A is invalid)
   - Behavior: when a task has unresolved dependencies, disallow transition to in_progress/completed; allow queued/blocked/paused
   - Tests: create chain A->B->C; reject A->A; reject cycle C->A; delete removes edge; status validator respects dependencies

3) API model polish (Specly-only)
   - TasksController.mapTaskDbToApi currently preserves legacy fields (parent_task_id, connected_files). Update to:
     - Return Specly fields only (assets, external_references, tags, metadata) without aliasing to legacy names
     - Confirm no legacy-only fields remain; UI will adapt to Specly fields
   - Task interface (src/api/types.ts) is already Specly for status/priority; confirm fields and remove any legacy remnants across API types
   - Inline transition tables removed in favor of centralized util (see 1)

4) Testing policy (locked)
   - Use pnpm + vitest/tsx for all tests; no Bun-based test runs
   - Do not add .vscode/tasks.json for running tests

5) Data modeling decision: external_references and tags
   - Current: stored as first-class JSON columns on `tasks`
   - Recommendation: keep as explicit columns (assets/external_references/tags/metadata)
     - Pros: clear schema, targeted indexing later, selective queries without parsing one catch-all metadata object
     - Use `metadata` for free-form extensions; keep external_references/tags stable and validated
   - Action: document this decision in project docs; ensure API returns them consistently (may keep `connected_files` as alias for assets for now)

6) Task sync providers rename plan
   - Rename `remote_interfaces` → `task_sync_providers` (clearer intent: GitHub/Jira/Trello/Asana task sources)
   - Scope: table + indices + service/DAO naming + tests; no behavior change
   - Optional follow-up: introduce two tables later if needed (catalog of provider types vs per-workspace connections)
   - Migration: drizzle programmatic rename (and drizzle-kit SQL later) without shims

7) Migrations approach
   - Continue using programmatic SQL for rapid test environments (current path) and add drizzle-kit migrations for reproducible versioned changes
   - Action: scaffold drizzle-kit migrations mirroring current tables; configure CI/dev to run generated SQL; keep programmatic as bootstrap

Acceptance for this next iteration:
- Status transition logic centralized and covered by unit tests
- Dependencies endpoints implemented with tests, including cycle detection and status guardrails
- Docs updated (api-design.md, specly-architecture.md) to reflect decisions on external_references/tags and remote interfaces
- Testing policy documented (pnpm/vitest only; no Bun-based tests; no VS Code tasks)
- All tests and typechecks green

Deferred/Optional:
- Sessions listing endpoint and filters for tasks index
- Final rename of New-suffixed methods to drop “New” after wrapper removal (small follow-up)
