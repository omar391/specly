# Planned File-by-File Changes (Specly Direct Cutover)

Immediate, non‑backwards‑compatible migration. All legacy ToolFlow / FeedbackStep execution code is removed (not deprecated). This is a destructive refactor: we introduce Spec / ToolVersion / ProfileVersion model and delete transitional shims in the same change set where feasible.

Legend:
- [R] Remove file immediately
- [N] New file
- [M] Modify existing file
- [S] Split responsibility (part remains, part moves elsewhere)

## Global Architectural Impact Summary
Remove: `tool_flows`, `tool_flow_steps`, `feedback_steps`, `ToolFlowExecutor`, `next-step-generator`. Replace with: immutable `specs`, `tool_versions` (graph manifests), `profiles`, `profile_versions`, `profile_version_tools`, expanded `tasks` & `sessions`, `action_journal`, new rule uniqueness.

No dual-run, no shadow mode: legacy execution path is deleted once SpecEngine lands.

---
## Root Source
### `src/index.ts` [M]
- Export new engine initializers (SpecEngine, ProfileService, SpecRepository) alongside legacy exports (temporary shim).
- Add feature flag bootstrap (`SPEC_ENGINE_ENABLED`).

### `src/cli.ts` [M]
- Add new CLI subcommands:
  - `profiles:publish`, `profiles:list`, `specs:import`, `tools:graph`, `migrate:specly`.
- Wire flag `--spec-engine` to prefer new execution path.
- Deprecate stepId oriented arguments; map to new `--session` while still accepting legacy for one phase.

---
## API Layer (`src/api/*`)
### `src/api/router.ts` [M]
- Remove legacy tool-flow & feedback-step routes entirely.
- Add routes:
  - `POST /api/specs`
  - `POST /api/tools/:tool/versions`
  - `GET /api/tools/:tool/graph`
  - `POST /api/tools/:tool/execute`
  - `POST /api/profile-versions`
  - `POST /api/workspaces/:id/upgrade-profile`

### `src/api/tasks.ts` [M]
- Extend task statuses to new enum: queued, in_progress, awaiting_input, blocked, paused, completed, failed.
- Add soft delete endpoint (PATCH /tasks/:id/delete) marking `deleted_at`.
- Add dependency management endpoints (POST/DELETE /tasks/:id/dependencies).

### `src/api/tool-flows.ts` [R]
### `src/api/feedback-steps.ts` [R]

### `src/api/workspaces.ts` [M]
- Add route to fetch bound profile version & available upgrades.
- Add rule to trigger workspace profile upgrade migration job.

### `src/api/middleware.ts` [M]
- Remove feature flag logic; assume SpecEngine.
- Add session ownership validation (`client_state_id`).

### `src/api/types.ts` [M]
- Delete ToolFlow / FeedbackStep DTOs. Add Spec, ToolVersion, ProfileVersion, ProfileVersionTool types.

---
## Constants (`src/constants/*`)
### `tool-names.ts` [M]
- Add mapping for canonical tool names to command aliases (persist).
- Note: enforce uniqueness per profile version, not global (comment + TODO until DB uniqueness in new join table).

---
## Data (`src/data/*`)
### `embedded-seed-data.ts` [M]
- Replace legacy seed structures entirely with new arrays: `specSeeds`, `toolVersionSeeds`, `rootProfileSeed`.

---
## Database Layer (`src/database/*`)
### `connection.ts`, `drizzle-connection.ts` [M]
- Register only new Specly schema (remove legacy tables from code references once migration script has materialized new tables). Legacy models no longer queried.

### `global-queries.ts` [M]
- Remove `getToolFlow*` functions.
- Add SpecRepository, ToolVersionRepository, ProfileRepository, ProfileVersionRepository, WorkspaceRuleRepository.

### `workspace-queries.ts` [M]
- Add new task status transitions helpers, dependency resolution functions.
- Rule queries migrated to new uniqueness constraint (workspace_id, relation, rule).

### `schema/global-schema.ts` [M]
- Replace legacy table exports with new tables (delete tool_flows, tool_flow_steps, feedback_steps from code; physical tables dropped via migration script executed once).

### `schema/workspace-schema.ts` [M]
- Overwrite tasks table definition; add task_dependencies table; remove legacy workspace_* flow tables.

### `schema/relations.ts` [M]
- Add relations for new tables (profile_version_tools, tool_versions -> specs, etc.).

### `migrations/` [N]
- New timestamped migrations implementing new tables (see migration roadmap). Legacy tables untouched initially.

---
## Server (`src/server/*`)
### `express-server.ts` [M]
- Mount new routes; inject SpecEngine; health check includes spec engine migration state.

### `instance-manager.ts` [M]
- Manage profile upgrades and session GC windows; add background sweeper (soft delete purge, transient session GC).

### Tests `src/server/__tests__/instance-manager.integration.test.ts` [M]
- Extend for profile inheritance & GC behaviors.

---
## Services (`src/services/*`)
### `tool-flow-executor.ts` [R]
### `next-step-generator.ts` [R]

### `database-service.ts` [M]
- Simplify to Specly repositories only (remove branching logic).

### `dynamic-schema-generator.ts` [M]
- Extend to build runtime input/output schema caches from spec JSON.

### `next-step-generator.ts` (duplicate listing) — Already removed

### `project-initializer.ts` [M]
- Initialize root profile version & workspace binding; drop any legacy seeding.

### `prompt-orchestrator.ts` [M]
- Refactor for spec template rendering & side_effect journaling; remove references to feedback steps.

### `external-task-integrations-manager.ts` [M]
- Validate that external tool calls operate under spec security constraints.

### `seed-manager.ts` [M]
- Publish initial tool versions and profile version during bootstrap if absent.

### `tool-flow-executor.ts` (see above) [D]

### `spec-engine.ts` [N]
Core execution cycle (routing, human awaiting, side effects, action journal, session lease validation).

### `tool-flow-executor` REPLACEMENT: `profile-service.ts` [N]
- Profile inheritance flatten logic.

### `workspace-registry.ts` [M]
- Manage workspace → profile_version binding & upgrades only (no legacy fallback logic).

---
## Tools (`src/tools/*`)
Each tool command updated to call unified execute; delete stepId arguments & messaging.

### `add.ts`, `start.ts`, `audit.ts`, `status.ts`, `update.ts`, `focus.ts`, `rule-update.ts`, `update-resources.ts`, `update-steps.ts`, `task-tool.ts`, `init.ts` [M]
- Remove stepId handling immediately; implement new execute invocation & session/task flags.

### `github.ts`, `external-task-integrations.ts` [M]
- If they produce dynamic steps, now just display returned `awaiting_input` content.

### `base-tool.ts` [M]
- Add helper to auto-resume session via session_id; unify error shapes (drop legacy helpers).

---
## Types (`src/types/index.ts`) [M]
- Remove / deprecate ToolFlow*, FeedbackStep* interfaces.
- Add Spec, ToolVersion, ToolVersionEdge, Profile, ProfileVersion, ProfileVersionTool, TaskStatus (expanded), SessionStatus, ActionJournalEntry, WorkspaceRule (new shape), TaskDependency.
- Mark old types with @deprecated JSDoc.

---
## Utils (`src/utils/*`)
### `cli-parser.ts` [M]
- Support new flags & deprecation warnings.
### `port-manager.ts`, `process-manager.ts` [M]
- No fundamental change; update types if referencing legacy session/task fields.

---
## Test Utilities (`src/test-utils/database-test-helpers.ts`) [M]
- Add builders for specs, tool versions, profile versions, tasks with dependencies, action journal entries.

---
## Tests (`src/__tests__/*`)
### `multi-step-tools.test.ts`, `tool-flow-executor.test.ts`, `next-step-generator.test.ts` [R]
Add: `spec-engine.test.ts`, `profile-inheritance.test.ts`, `task-status-transitions.test.ts`, `action-journal.test.ts` [N].

### Other tests [M]
- Adjust to new status enums & repositories.

---
## Removed Legacy Components Summary (Immediate)
- `next-step-generator.ts`
- `tool-flow-executor.ts`
- `tool_flow_steps` & `tool_flows` & `feedback_steps` (code + DB usage)
- StepId oriented API parameters (server & CLI)

## New Components Summary
- `spec-engine.ts`
- `profile-service.ts`
- New schema tables & migrations
- New tests for spec engine determinism, profile inheritance, action journal

(See `migration_roadmap.md` for precise schema DDL, pseudocode, and direct cutover execution plan.)
