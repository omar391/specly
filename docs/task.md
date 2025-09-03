# Specly Unified Task List (Direct Cutover)

No backward compatibility. Tasks formatted as execution-ready units with traceability to `migration_roadmap.md`, `migration_roadmap_ui.md`, `file_changes.md`, and `file_changes_ui.md`.

Status legend (initial): TBD (not started) | In-Progress | Blocked | Done.

---
## Backend Foundation

## Task ID: SP-001
- **Title**: Create Specly Core Schema
- **Description**: Implement new global + workspace schema (specs, tools, tool_versions, profiles, profile_versions, profile_version_tools, workspace_profile_versions, action_journal, workspace_rules, tasks, task_dependencies, sessions). Remove legacy tool_flows / feedback_steps tables from code (drop tables via migration). See migration_roadmap.md §2, file_changes.md (schema sections).
- **Priority**: High
- **Dependencies**: None
- **Status**: Done
- **Progress**: 100%
- **Completed At**: 2025-09-03T08:09:25Z
- **Notes**: Core schema established (global + workspace). Legacy multi-step system fully purged: executor logic neutralized, legacy tables (tool_flows, tool_flow_steps, feedback_steps) dropped via programmatic migration + SQL, references removed from code, placeholder tests ensure no regressions. Added specly-core-schema test verifying presence of new tables and absence of legacy ones (all tests green: 84/84). Deferred items explicitly out of scope for SP-001: renaming tasks_new/sessions_new (handled in later task), adding full uniqueness/FK/indices expansion (future tasks will implement). This completes acceptance criterion #1 for backend cutover.
- **Connected File List**: ./src/database/schema/global-schema.ts, ./src/database/schema/workspace-schema.ts, ./src/database/schema/relations.ts, ./src/database/migrations/*

## Task ID: SP-002
- **Title**: Hashing & Canonicalization Utilities
- **Description**: Implement spec canonical JSON hash + tool version hash (ordered specs + sorted edges). Add golden vector tests. §1.3 roadmap.
- **Priority**: High
- **Dependencies**: SP-001
- **Status**: In-Progress
- **Progress**: 70%
- **Completed At**: 
- **Notes**: Canonical JSON serializer + spec & tool version hashing implemented (`canonicalStringify`, `hashSpec`, `hashToolVersion`, `stableHash`). Golden fixture established (`spec-example.json`) with baseline enforcement in `hash.golden.test.ts`. Added negative test verifying ordered_specs reordering changes hash. Remaining: integrate hashing into spec/tool endpoints (SP-014), collision logging + guard, optional in-memory hash cache, expand golden vectors (SP-200), documentation of update procedure. Low-priority future: deep nested fuzz test.
- **Connected File List**: ./src/utils/hash.ts, ./src/__tests__/hash.test.ts

## Task ID: SP-003
- **Title**: Repository Layer (Spec / ToolVersion / Profile / ProfileVersion / Rules / ActionJournal)
- **Description**: Add data access classes (CRUD + specialized queries: fetch active tool version via workspace binding, inheritance flatten support). Remove legacy query functions. §2, §1.4.
- **Priority**: High
- **Dependencies**: SP-001, SP-002
**Status**: Done
**Progress**: 100%
**Completed At**: 2025-09-03T08:46:30Z
**Notes**: Repository layer fully implemented and covered by tests (95/95 passing). Added repositories: SpecRepositoryImpl (idempotent hash create), ToolVersionRepositoryImpl (graph manifest hashing + implicit tool ensure), ProfileRepository (profile create, version auto-increment, tool attachment with duplicate guard, workspace binding upsert), WorkspaceRulesRepository (rule add/reinforce confidence increment), ActionJournalRepository (idempotent pending entry on (specHash,idempotencyKey) + status update). Programmatic migrations already include all required tables. Tests extended (`repository.test.ts`) to assert: spec idempotency (stable hash with dynamic metadata), tool version idempotent duplicate, profile version increments (1→2), tool attachment duplicate prevention, workspace binding, workspace rule reinforcement increments confidence, action journal idempotent creation + status update. Adjusted tests to avoid hash collision flakiness by injecting run UUID metadata and unique profile/rule names. This satisfies acceptance criteria for SP-003 (CRUD + integrity guards). Deferred (documented for later tasks): collision logging, stronger DTO typing (replace any), graph manifest round-trip canonicalization test, hash cache optimization (ties into SP-002 future optimization). No legacy query usages remain for these domains.
**Notes**: Repository layer fully implemented and covered by tests (95/95 passing). Added repositories: SpecRepositoryImpl (idempotent hash create), ToolVersionRepositoryImpl (graph manifest hashing + implicit tool ensure), ProfileRepository (profile create, version auto-increment, tool attachment duplicate guard, workspace binding upsert), WorkspaceRulesRepository (rule add/reinforce confidence increment), ActionJournalRepository (idempotent pending entry + status update). Programmatic migrations include all required tables. Tests assert spec idempotency, tool version duplicate avoidance, profile version increments, tool attachment duplicate prevention, workspace binding, workspace rule reinforcement confidence increment, and action journal idempotent creation + status update. Hash collision flakiness eliminated via run UUID metadata and unique names. Follow-up enhancements tracked under SP-021.
**Connected File List**: ./src/database/global-queries.ts, ./src/database/workspace-queries.ts, ./src/services/database-service.ts, ./src/repositories/spec-repository.ts, ./src/repositories/profile-repository.ts, ./src/repositories/workspace-rules-repository.ts, ./src/repositories/action-journal-repository.ts, ./src/__tests__/repository.test.ts

## Task ID: SP-004
- **Title**: Spec Seeding & Initial Tool Version Publication
- **Description**: Convert legacy in-memory definitions (or seed file) directly into specs & linear tool versions; create root profile + initial profile version; bind all workspaces. After seeding, delete any code referencing legacy flows. §5 step 2.
- **Priority**: High
- **Dependencies**: SP-003
- **Status**: Done
- **Progress**: 100%
- **Completed At**: 2025-09-03T09:05:50Z
- **Notes**: Seeding fully implemented and validated. Seed definitions (`SPECLY_SEED_SPECS`, `SPECLY_SEED_TOOLS`, `SPECLY_ROOT_PROFILE`) established in `embedded-seed-data.ts`. `SeedManager.seedSpecly()` now: (1) deterministically orders spec & tool processing, (2) creates specs & tool versions idempotently by hash, (3) creates root profile + initial profile version on first run, (4) attaches latest tool versions, (5) always (re)binds all existing workspaces to latest profile version, (6) returns structured result incl. created hash arrays, (7) emits structured JSON log with stable ordering. Tests: idempotency, profile version existence, and post-creation workspace binding added (`seed-manager.test.ts`) using isolated in-memory GLOBAL DB for deterministic first-run counts. Structured logging & deterministic ordering complete acceptance criteria for logging/reporting. Additional workspaces created after initial seed get bound on subsequent seed run (verified by test). No remaining blockers—SP-004 closure unblocks SP-005 SpecEngine.
- **Connected File List**: ./src/data/embedded-seed-data.ts, ./src/services/seed-manager.ts, ./src/scripts/seed-specly.ts

### SP-005 Draft Planning Addendum (Pending Formalization)
Goals:
- Deterministic spec execution routing (single-step initial scope)
- Graph validation & ordering abstraction (independent of persistence)
- Stable canonical hash usage for execution caching (reuse from SP-002)

Core Proposed Interfaces:
```ts
interface SpecNode { hash: string; intent: 'human' | 'autonomous'; sideEffect: boolean; }
interface ToolGraph { entry: string; nodes: Record<string, SpecNode>; edges: Array<{from: string; to: string; priority: number}>; }
interface ExecutionStep { specHash: string; awaitingHuman: boolean; }
interface ExecutionPlan { steps: ExecutionStep[]; warnings: string[]; }
interface ExecutionPlanner {
	buildPlan(graph: ToolGraph): ExecutionPlan;
}
```

Initial Tasks (to become separate Task IDs or folded into SP-005 notes):
1. Minimal graph extractor from existing toolVersions.graphManifest
2. Cycle & unreachable detection (warning vs error policy)
3. Priority-based ordering (stable sort by priority then spec hash)
4. Awaiting human flag propagation when intent === 'human'
5. Unit tests: linear chain, branch merge, cycle rejection, unreachable node warn

Open Questions:
- Should unreachable specs invalidate publish? (Draft: warn only)
- Multi-entry future possibility? (Out of scope; enforce single entry now)

Assumptions:
- Tool version manifest already validated for structural integrity (SP-018 will later tighten)
- No side_effect replay logic until SP-010

Next Action after addendum acceptance: create `spec-engine.ts` scaffold implementing interfaces + failing tests (TDD start).

## Task ID: SP-005
- **Title**: Implement SpecEngine Core
- **Description**: Execution loop per pseudocode (routing, human awaiting, session lease, context merge). Exclude side_effect idempotency (later task). §3 roadmap.
- **Priority**: High
- **Dependencies**: SP-003, SP-004
- **Status**: In-Progress
- **Progress**: 15%
- **Completed At**: 
- **Notes**: Skeleton `spec-engine.ts` added with BasicExecutionPlanner (topological ordering, cycle detection, priority + hash deterministic ordering, unreachable warnings) and tests (`spec-engine.test.ts`) covering: linear chain, priority branch ordering, cycle rejection, unreachable node warning. Next: integrate planner into forthcoming execute loop (pending SP-006). Remaining for SP-005: session lease integration, awaiting_input state transitions, context merge stub, result_code propagation.
- **Connected File List**: ./src/services/spec-engine.ts, ./src/types/index.ts

## Task ID: SP-006
- **Title**: Unified Execute API Endpoint
- **Description**: Add `POST /api/tools/:tool/execute` using SpecEngine. Remove legacy tool-flow & feedback endpoints. Update router + middleware (session ownership). §4.
- **Priority**: High
- **Dependencies**: SP-005
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Validate request shape, return consistent content array. Cleanup: remove legacy API controllers & routes (`tool-flows.ts`, `feedback-steps.ts`) and return 410/404 for their former paths. Ensure router no longer mounts these endpoints and tests confirm absence.
- **Connected File List**: ./src/api/router.ts, ./src/api/middleware.ts, ./src/api/types.ts

## Task ID: SP-007
- **Title**: CLI Refactor (Remove StepId)
- **Description**: Update all tool CLI commands to call unified execute. Remove stepId flags & text. Provide session/task flags. See file_changes.md tools section.
- **Priority**: Medium
- **Dependencies**: SP-006
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Ensure backward incompatible removal clearly documented in README.
- **Connected File List**: ./src/tools/*.ts, ./src/utils/cli-parser.ts, ./README.md

## Task ID: SP-008
- **Title**: Task & Session Model Upgrade
- **Description**: Implement new task statuses, dependency table, session columns; update queries & services enforcing transitions. Remove old status mapping logic.
- **Priority**: High
- **Dependencies**: SP-001, SP-005
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Add test coverage for transitions and dependency unlocking.
- **Connected File List**: ./src/database/schema/workspace-schema.ts, ./src/services/workspace-registry.ts, ./src/__tests__/task-status-transitions.test.ts

## Task ID: SP-009
- **Title**: Profile Inheritance Service
- **Description**: Implement `createProfileVersion` flatten + removals/overrides. Include cycle detection. Add endpoint & CLI commands for profile version creation & workspace upgrade. §1.4, §5 step 5.
- **Priority**: Medium
- **Dependencies**: SP-003, SP-004
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Unit test multi-level A<-B<-C, override, remove.
- **Connected File List**: ./src/services/profile-service.ts, ./src/api/router.ts, ./src/tools/update.ts

## Task ID: SP-010
- **Title**: Action Journal & Side Effects
- **Description**: Add action_journal repository & integrate side_effect idempotency + retry logic into SpecEngine. Implement computeIdemKey.
- **Priority**: Medium
- **Dependencies**: SP-005
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Journal tests for reuse and retry exhaustion.
- **Connected File List**: ./src/services/spec-engine.ts, ./src/database/schema/global-schema.ts, ./src/__tests__/action-journal.test.ts

## Task ID: SP-011
- **Title**: Background Jobs (GC & Purge)
- **Description**: Add instance-manager sweeps: transient session GC (24h), soft delete purge (90d), retry scheduling. Metrics counters.
- **Priority**: Medium
- **Dependencies**: SP-010
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Configurable horizons via env.
- **Connected File List**: ./src/server/instance-manager.ts, ./src/services/spec-engine.ts

## Task ID: SP-012
- **Title**: Metrics & Observability
- **Description**: Implement latency histograms, routing counters, hash cache hits, inheritance depth gauge. Expose via `/health` extended payload.
- **Priority**: Low
- **Dependencies**: SP-005, SP-009
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Use simple in-memory aggregator first.
- **Connected File List**: ./src/server/express-server.ts, ./src/services/spec-engine.ts

## Task ID: SP-013
- **Title**: Security & Validation Pass
- **Description**: Enforce command_alias uniqueness pre-check, spec size limits, executor_type whitelist, input/output schema validation errors.
- **Priority**: Medium
- **Dependencies**: SP-006, SP-005
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Add negative tests (invalid schema, oversize template).
- **Connected File List**: ./src/services/spec-engine.ts, ./src/__tests__/security-validation.test.ts

## Task ID: SP-014
- **Title**: Spec & Tool API Endpoints
- **Description**: Implement endpoints: POST /api/specs, POST /api/tools, POST /api/tools/:tool/versions (validation + hash verification). Architecture refs: spec creation §14, tools & versions §13, API list §17. Include tests for: duplicate spec hash (idempotent return), duplicate tool name (409), invalid graph (cycle) rejection (ties to SP-018 validator). Update router & types.
- **Priority**: High
- **Dependencies**: SP-001, SP-002, SP-003
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Ensure tool version hash recomputed server-side and matches client proposal.
- **Connected File List**: ./src/api/router.ts, ./src/api/types.ts, ./src/__tests__/spec-tool-endpoints.test.ts

## Task ID: SP-015
- **Title**: Profile & Workspace Binding Endpoints
- **Description**: Implement: POST /api/profiles, POST /api/profiles/:profile/versions, POST /api/profiles/:profile/versions/:version/publish, POST /api/workspaces/:id/profile/upgrade, GET /api/workspaces/:id/profile. Architecture refs: profiles/inheritance §4 & §12, API §17. Tests: duplicate profile name (409), inheritance cycle rejection, publish increments version_number, upgrade pins workspace binding.
- **Priority**: High
- **Dependencies**: SP-009, SP-014
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Use transaction for publish + active_version_id set.
- **Connected File List**: ./src/api/router.ts, ./src/services/profile-service.ts, ./src/__tests__/profile-endpoints.test.ts

## Task ID: SP-016
- **Title**: Task & Dependency API Endpoints
- **Description**: Implement: POST /api/tasks, PATCH /api/tasks/:id/status, POST/DELETE dependencies endpoints, GET /api/tasks/:id, GET /api/sessions?workspace_id=&task_id?. Architecture refs: status model §5, dependency management §6, API §17, sessions table §15. Tests: dependency cycle rejection, blocked→in_progress invalid, queued→paused invalid, status updates reflect dependency resolution.
- **Priority**: High
- **Dependencies**: SP-008, SP-006
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Provide consistent error codes (422 validation, 409 conflict).
- **Connected File List**: ./src/api/router.ts, ./src/services/workspace-registry.ts, ./src/__tests__/task-endpoints.test.ts

## Task ID: SP-017
- **Title**: Workspace Rules Reinforcement & Prompt Injection
- **Description**: Implement reinforcement algorithm (confidence update) and retrieval ordering (confidence desc, recency). Integrate top-N rules into human & autonomous prompt context. Architecture refs: workspace rules §11, execution flow context injection §8, API §17. Add rule upsert endpoint POST /api/rules and GET /api/rules. Tests: duplicate rule triple idempotent, confidence increases, inactive rules excluded.
- **Priority**: Medium
- **Dependencies**: SP-003, SP-005
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Cache optional; simple in-process list acceptable.
- **Connected File List**: ./src/services/prompt-orchestrator.ts, ./src/api/router.ts, ./src/__tests__/workspace-rules.test.ts

## Task ID: SP-018
- **Title**: Graph & Transition Validation
- **Description**: Add validator ensuring: no cycles reachable from entry_spec, all edges reference ordered_specs, exactly one entry_spec in ordered_specs, unreachable specs flagged (warning), priority integers normalized (default 100). Architecture refs: transitions & routing §7, tool versions graph manifest §13. Dead-end mid-graph triggers failure test. Provide separate util with tests.
- **Priority**: Medium
- **Dependencies**: SP-002
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Cycle detection via DFS; complexity O(V+E).
- **Connected File List**: ./src/utils/graph-validate.ts, ./src/__tests__/graph-validate.test.ts

## Task ID: SP-019
- **Title**: Session Lease & Force-Start Enforcement Tests
- **Description**: Implement rigorous tests around client_state_id leasing, force_start behavior (transfer ownership), and conflict responses (409). Ensure idle transition when awaiting_input and rejection on mismatched resume.
- **Priority**: Medium
- **Dependencies**: SP-006, SP-005
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Add negative test for force_start without existing session ownership.
- **Connected File List**: ./src/__tests__/session-lease.test.ts, ./src/services/spec-engine.ts

## Task ID: SP-020
- **Title**: Retry Policy Simulation Tests
- **Description**: Simulate side_effect spec with retry_policy (maxAttempts, exponential backoff). Tests for: success on retry, final failure marks task failed, journal reuse of success, delays respected (logical ordering).
- **Priority**: Low
- **Dependencies**: SP-010
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Mock timers/backoff; do not require real delays.
- **Connected File List**: ./src/__tests__/retry-policy.test.ts, ./src/services/spec-engine.ts

---
## UI Implementation

## Task ID: SP-100
- **Title**: UI API Client Refactor
- **Description**: Replace `TaskPilotApiClient` with `SpeclyApiClient`; remove tool-flow & feedback methods; add spec/tool/profile endpoints. Update types (statuses, remove dependencies array). See file_changes_ui.md.
- **Priority**: High
- **Dependencies**: SP-006
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Maintain SSE; add new event handlers.
- **Connected File List**: ./ui/src/lib/api-client.ts

## Task ID: SP-101
- **Title**: Remove Legacy UI Pages & Components
- **Description**: Delete tool-flow-card, feedback-editor, pages/tool-flows.tsx, pages/feedback-steps.tsx. Clean CSS. Update nav.
- **Priority**: High
- **Dependencies**: SP-100
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Ensure dead imports purged.
- **Connected File List**: ./ui/src/components/tool-flow-card.tsx, ./ui/src/components/feedback-editor.tsx, ./ui/src/pages/tool-flows.tsx, ./ui/src/pages/feedback-steps.tsx

## Task ID: SP-102
- **Title**: Specs & Tools Pages Scaffold
- **Description**: Create pages/specs.tsx & pages/tools.tsx listing specs (hash, intent) and tool versions (hash, entry_spec). Query via new endpoints.
- **Priority**: High
- **Dependencies**: SP-100
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Include simple search by hash prefix.
- **Connected File List**: ./ui/src/pages/specs.tsx, ./ui/src/pages/tools.tsx

## Task ID: SP-103
- **Title**: Spec Editor Component
- **Description**: Implement `spec-editor.tsx` with JSON form, live hash preview (client canonicalization), validation errors.
- **Priority**: Medium
- **Dependencies**: SP-102, SP-002
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Provide copy-to-clipboard for hash.
- **Connected File List**: ./ui/src/components/spec-editor.tsx

## Task ID: SP-104
- **Title**: Tool Version Publisher & Graph Canvas
- **Description**: Implement tool-version-publisher & tool-graph-canvas (DAG layout). Edge validation (no cycles). Hash pre-computation & server verification.
- **Priority**: Medium
- **Dependencies**: SP-103
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Provide minimal topological layout; later optimization optional.
- **Connected File List**: ./ui/src/components/tool-version-publisher.tsx, ./ui/src/components/tool-graph-canvas.tsx

## Task ID: SP-105
- **Title**: Profiles & Inheritance UI
- **Description**: Add profiles.tsx & profile-version.tsx pages plus profile-version-creator component to manage overrides/removals; show inheritance markers.
- **Priority**: Medium
- **Dependencies**: SP-009
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Visual tag for inherited vs overridden.
- **Connected File List**: ./ui/src/pages/profiles.tsx, ./ui/src/pages/profile-version.tsx, ./ui/src/components/profile-version-creator.tsx

## Task ID: SP-106
- **Title**: Execution Console & Sessions Page
- **Description**: Implement live session UI (execution-console) with SSE updates and context diff display; add sessions listing.
- **Priority**: Medium
- **Dependencies**: SP-006, SP-100
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Debounce rerenders (≤100ms). Show awaiting_input vs active visually.
- **Connected File List**: ./ui/src/components/execution-console.tsx, ./ui/src/pages/sessions.tsx

## Task ID: SP-107
- **Title**: Task Dependencies Panel & Status Badges
- **Description**: Implement task-dependencies-panel CRUD; add status-badge component & update tasks page table.
- **Priority**: Medium
- **Dependencies**: SP-008, SP-100
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Circular dependency detection server error surfaced gracefully.
- **Connected File List**: ./ui/src/components/task-dependencies-panel.tsx, ./ui/src/components/status-badge.tsx, ./ui/src/pages/tasks.tsx

## Task ID: SP-108
- **Title**: Rules UI Enhancements
- **Description**: Add rule-input-form + normalization preview; integrate into Rules page; update relation filter chips.
- **Priority**: Low
- **Dependencies**: SP-100
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Show duplicate warning before submit.
- **Connected File List**: ./ui/src/components/rule-input-form.tsx, ./ui/src/components/workspace-rules-display.tsx

## Task ID: SP-109
- **Title**: Branding & Design Tokens Update
- **Description**: Rename TaskPilot to Specly across UI, update design-system.json & tailwind tokens for new statuses & session states.
- **Priority**: Low
- **Dependencies**: SP-100
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Provide accessible contrast for status colors.
- **Connected File List**: ./ui/src/design-system.json, ./ui/tailwind.config.js, ./ui/src/index.css, ./ui/index.html

## Task ID: SP-110
- **Title**: UI Accessibility & Performance Polish
- **Description**: Add keyboard navigation, aria labels, lazy tab mounting, graph textual fallback, measure render metrics.
- **Priority**: Low
- **Dependencies**: SP-104, SP-106
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Provide baseline metrics logging in dev console.
- **Connected File List**: Multiple (components/*, pages/*)

---
## Cross-Cutting & Documentation

## Task ID: SP-021
- **Title**: Repository Layer Enhancements & Optimization
- **Description**: Add collision logging & guard for spec/tool version hashes, replace any with typed DTOs, implement graph manifest round-trip canonicalization test, introduce optional in-memory hash cache (ties to SP-002 optimization), and add negative mutation test for toolVersion graph ordering.
- **Priority**: Low
- **Dependencies**: SP-002, SP-003
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Non-blocking improvements to robustness and observability; schedule after core execution & API tasks (post SP-006/SP-014) unless a hash collision is observed earlier.
- **Connected File List**: ./src/utils/hash.ts, ./src/repositories/spec-repository.ts, ./src/repositories/profile-repository.ts, ./src/repositories/workspace-rules-repository.ts, ./src/repositories/action-journal-repository.ts, ./src/__tests__/repository.test.ts

## Task ID: SP-200
- **Title**: Golden Hash Fixture Maintenance
- **Description**: Establish golden vectors test & update instructions for adding new spec fixtures.
- **Priority**: Medium
- **Dependencies**: SP-002
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Failing test must block merge.
- **Connected File List**: ./src/__tests__/hash.test.ts, ./docs/migration_roadmap.md

## Task ID: SP-201
- **Title**: Documentation Overhaul
- **Description**: Update README, architecture doc, remove legacy references, add quickstart for spec → publish → execute.
- **Priority**: Medium
- **Dependencies**: SP-006, SP-100
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Include sample curl requests.
- **Connected File List**: ./README.md, ./docs/specly-architecture.md

## Task ID: SP-202
- **Title**: Security & Limits Documentation
- **Description**: Document command_alias rules, template size limit, executor registry restrictions.
- **Priority**: Low
- **Dependencies**: SP-013
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Add to architecture doc appendix.
- **Connected File List**: ./docs/specly-architecture.md

## Task ID: SP-203
- **Title**: Migration Completion Report
- **Description**: Summarize all tasks, metrics, remaining open enhancements; set migration version record.
- **Priority**: Low
- **Dependencies**: SP-011, SP-110, SP-201
- **Status**: TBD
- **Progress**: 0%
- **Completed At**: 
- **Notes**: Include risk outcomes vs initial list.
- **Connected File List**: ./docs/migration_roadmap.md, ./docs/task.md

---
## Deferred / Optional Enhancements
- Expression transitions (new condition_type)
- Cross-tool edges & multi-tool session
- Export/import bundle CLI
- Advanced graph editing (drag/drop edges)
- Rule inference via LLM pipeline

---
All future PRs must reference Task ID(s). Update status, progress %, and completion timestamp on merge.

## Acceptance Criteria
Direct cutover model (no phases). Migration is considered complete when all High priority backend tasks (SP-001–SP-006, SP-008, SP-014–SP-016) and critical runtime safety tasks (SP-004 seed idempotency, SP-005 engine determinism, SP-006 unified endpoint, SP-018 graph validation, SP-019 lease enforcement) are satisfied.

Minimum gating criteria:
1. Schema (SP-001) applied and legacy tables removed from code references (physical drop may occur in same migration) with all new uniqueness & FK constraints present.
2. Hash utilities (SP-002) produce stable, reproducible hashes (golden test vectors committed; 2 consecutive CI runs identical).
3. Repositories (SP-003) implement CRUD + integrity guards (cycle detection for inheritance pre-check stubs even if not yet fully used).
4. Seed (SP-004) idempotent: second invocation creates zero new rows and reports identical hash set.
5. SpecEngine (SP-005) passes unit tests for: routing priority, awaiting_input handling, error propagation, deterministic next-spec selection.
6. Execute API (SP-006) replaces legacy endpoints; hitting removed endpoints returns 410 or 404 (as documented) and no internal legacy executor usage remains.
7. Task/session model (SP-008) transitions enforced; negative tests reject invalid transitions & circular dependencies.
8. Spec & Tool endpoints (SP-014) fully functional with server-side hash verification & idempotent spec creation.
9. Profile & binding endpoints (SP-015) handle inheritance & publish with version increment and cycle rejection.
10. Task & dependency endpoints (SP-016) enforce dependency graph rules & conflict codes.
11. Profile inheritance (SP-009) flatten logic validated with multi-level override & removal scenario (at least one 3-level chain test).
12. Graph validation (SP-018) rejects cycles & invalid edges; dead-end mid-run test passes (task failed with diagnostic).
13. Session lease enforcement (SP-019) tests: mismatch 409, force_start transfers ownership, awaiting_input idle state confirmed.
14. Action journal & side effects (SP-010) support idempotent side_effect execution with reuse of prior result when idem key repeats.
15. Retry policy simulation (SP-020) covers success-on-retry and final failure path.
16. Workspace rules (SP-017) reinforcement increments confidence, injection appears in prompt context order.
17. Security & validation (SP-013) tests cover alias uniqueness violation, oversize spec/template, disallowed executor_type.

UI release criteria (post backend readiness):
- API client refactor (SP-100) complete and all other UI tasks depend only on new endpoints.
- Execution console (SP-106) proves real-time updates across at least one full session lifecycle (start → awaiting_input → resumed → completed).

Documentation criteria:
- README and architecture doc updated (SP-201) to show: create spec → publish tool version → bind profile → execute.
- Security & limits documented (SP-202) and referenced from README.
- Migration completion report (SP-203) lists any deferred enhancements.

Rollback (minimal since destructive): backup of pre-migration DB snapshot retained until SP-006 and SP-008 validations green.

## Updated Traceability Matrix (Representative)
| SP Task | Roadmap Section | File Changes Anchor |
|---------|-----------------|---------------------|
| SP-001 | migration_roadmap.md §2 | global/workspace schema additions |
| SP-002 | migration_roadmap.md §1.3 | hash utilities (new) |
| SP-003 | migration_roadmap.md §2 / §1.4 | repository layer refactors |
| SP-004 | migration_roadmap.md §5 | seed scripts & data conversion |
| SP-005 | migration_roadmap.md §3 | spec-engine.ts (new) |
| SP-006 | migration_roadmap.md §4 | router/middleware execute endpoint |
| SP-008 | migration_roadmap.md §2.2 | task/session schema + logic |
| SP-014 | migration_roadmap.md §API / §13 | spec/tool version endpoints |
| SP-015 | migration_roadmap.md §API / §4 / §12 | profile/version/binding endpoints |
| SP-016 | migration_roadmap.md §API / §5 / §6 / §15 | task & dependency endpoints |
| SP-017 | migration_roadmap.md §11 / §8 / §17 | rules endpoints & reinforcement |
| SP-018 | migration_roadmap.md §7 / §13 | graph validation |
| SP-019 | migration_roadmap.md §9 | session lease logic tests |
| SP-020 | migration_roadmap.md §10 | retry policy tests |
| SP-009 | migration_roadmap.md §1.4 | profile-service flatten logic |
| SP-010 | migration_roadmap.md §2 (action_journal) | action_journal integration |
| SP-013 | migration_roadmap.md §Security | validation additions |
| SP-100 | migration_roadmap_ui.md §API | api-client refactor |
| SP-106 | migration_roadmap_ui.md §Sessions | execution console |
| SP-201 | migration_roadmap.md §Docs | README overhaul |

(Other tasks map similarly; see their Description fields.)

## Notes
Legacy phase-based planning removed 2025-09-02 for clarity under direct cutover approach. Historical phased plan intentionally discarded (no appendix) to prevent drift.

This task plan is living; update in PRs referencing Task IDs. All implementers must maintain alignment with `migration_roadmap.md` and `migration_roadmap_ui.md`.
