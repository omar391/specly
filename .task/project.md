# Specly Project Documentation

Legacy TaskPilot project is now superseded by Specly. This document defines the active scope, requirements, architecture links, and task mapping for the Specly direct cutover. A concise legacy summary is preserved for historical context at the end.

---
## 1. Overview
Specly introduces immutable hash-addressed specs, versioned tool graphs, profile inheritance, deterministic server-driven execution, and idempotent side-effect handling. Goal: reproducible, auditable multi-step automation flows for AI assistants with explicit version pinning per workspace (via profile versions).

## 2. Objectives & Non-Objectives
Objectives:
- Deterministic execution (hashes & locked tool/profile versions)
- Linear, flattened profile inheritance (O(1) resolution)
- Unified execute endpoint replacing legacy tool-flow + feedback endpoints
- Idempotent side-effect spec execution via journal
- Rich task lifecycle with dependency graph
- Workspace rule reinforcement integrated into prompt context
- Direct cutover (no shadow mode) minimizing maintenance overhead

Non-Objectives (deferred):
- Expression-based transitions
- Cross-tool graph edges (multi-tool sessions)
- Streaming executor output
- Advanced graph editing UI (drag/drop)
- Task cancelation status

## 3. Scope Boundary
In-scope: new schema, repositories, seeding, SpecEngine, unified API, profile inheritance, rules reinforcement, retries, GC jobs, observability baseline, UI screens for specs/tools/profiles/sessions/tasks.
Out-of-scope: external platform connectors beyond existing minimal GitHub usage; advanced security sandboxing; full metrics dashboard.

## 4. Architecture Reference
Canonical architecture specification: `docs/specly-architecture.md` (sections 1–20). All SP tasks must reference this filename when citing sections (e.g., "specly-architecture.md §14").

## 5. Data Model Summary (Delta vs Legacy)
Removed: tool_flows, tool_flow_steps, feedback_steps tables; stepId concepts.
Added / Reworked: specs, tools, tool_versions, profiles, profile_versions, profile_version_tools, workspace_profile_versions, action_journal, workspace_rules, tasks (expanded), task_dependencies, sessions (lease columns).

## 6. Task Mapping
Source of truth: `docs/task.md`. Highlights:
- Schema & migrations: SP-001
- Hashing utilities: SP-002
- Repo layer: SP-003
- Seed & publication: SP-004
- SpecEngine: SP-005
- Execute endpoint: SP-006
- Task/session upgrade: SP-008
- Profile inheritance: SP-009
- Action journal: SP-010
- Graph validation: SP-018
- API endpoints (spec/tool/profile/task): SP-014–SP-016
- Rules reinforcement: SP-017
- Session lease tests: SP-019
- Retry policy tests: SP-020
- UI (specs/tools/profiles/sessions/tasks): SP-100–SP-107

## 7. Dependencies & Critical Path
Critical chain: SP-001 → SP-002 → SP-003 → SP-004 → (SP-005 & SP-014 & SP-018) → SP-006 → SP-008 → SP-009 → SP-010 → SP-017/019/020
UI blocked until backend execute + API endpoints stable (≥ SP-006 & SP-014–SP-016).

## 8. Execution Guarantees
- Hash determinism validated with golden vectors (SP-002, SP-200)
- Graph safety (acyclic, reachable, single entry) enforced pre-insert (SP-018)
- Profile flatten invariant: no runtime recursive merge (SP-009 tests)
- Idempotent side effects: journal reused result by idem key (SP-010)
- Lease exclusivity: conflicting client_state_id yields 409 (SP-019)

## 9. Validation & Error Policy
HTTP 409: uniqueness / lease conflicts / inheritance cycles.
HTTP 422: schema validation, graph invalid structure, task transition violations.
HTTP 404: resource not found, session not present.
HTTP 410: (Reserved; currently not used since legacy endpoints removed.)

## 10. Observability & Metrics (Initial)
- spec_engine_execute_latency_ms (histogram)
- spec_engine_route_edge_selection_total (counter)
- spec_engine_hash_cache_hits_total (counter—optional early stub)
- profile_inheritance_depth_gauge
- action_journal_replays_total

## 11. Security & Limits
- command_alias uniqueness per profile version
- executor_type whitelist
- spec/template size limit (configurable)
- cycle detection for graphs & inheritance
- guarded side_effect retry limits (maxAttempts)

## 12. Migration Strategy
Single destructive migration (SP-001) with prior local DB backup. Legacy code references removed immediately (no dual-write). Seed script establishes baseline versions; subsequent operations rely solely on new tables.

## 13. Rollback Strategy
Rollback = restore pre-migration DB snapshot + revert code commit prior to SP-001 merge. No partial rollback supported after executing new writes.

## 14. Open Risks & Mitigations

| Risk | Impact | Mitigation Task |
|------|--------|-----------------|
| Incorrect canonicalization | Hash churn & duplication | Golden tests (SP-002, SP-200) |
| Hidden graph cycles | Runtime loops | Pre-insert validation (SP-018) |
| Lease race conditions | Session hijack | Strict 409 tests (SP-019) |
| Spec seed drift | Inconsistent environments | Idempotent seed (SP-004) |
| Retry runaway | Resource consumption | Retry policy tests (SP-020) |

## 15. Documentation Commitments
`docs/specly-architecture.md` stays authoritative; `docs/task.md` updated each merged PR referencing Task IDs; README updated after SP-006 & SP-014 completion (SP-201).

## 16. Deferred Features Catalog
Maintained in `docs/task.md` (Deferred / Optional Enhancements section) and architecture §19.

## 17. Acceptance Summary
See Acceptance Criteria in `docs/task.md` (direct cutover). Completion gating enumerated SP tasks must be green & documented.

## 18. Glossary
Spec: immutable hashed execution unit.
Tool Version: hashed DAG of specs.
Profile Version: flattened selection of tool versions with aliases.
Workspace Binding: workspace → profile version pointer.
Session Lease: (session_id, client_state_id) exclusivity pair.
Idempotency Key: derived identifier for side_effect replay detection.

## 19. Legacy Snapshot (TaskPilot Summary)
TaskPilot delivered MCP multi-step flows with template orchestration, UI (Home / Tool Flows / Feedback Steps), dual DB architecture, and 69 passing tests. It lacked: hash-addressable specs, immutable versioning, profile inheritance, unified execution endpoint, and idempotent side effects—all addressed by Specly.

## 20. Change Log (Specly Initiation)
- 2025-09-02: Specly project doc created; legacy project.md replaced; direct cutover tasks enumerated (SP-001..SP-020, SP-100+).

---
Authoritative references: `docs/specly-architecture.md`, `docs/task.md`, `docs/migration_roadmap.md`, `docs/migration_roadmap_ui.md`.
