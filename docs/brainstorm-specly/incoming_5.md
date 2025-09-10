# Incoming 5
Incorporating Iter 0–4 plus your latest feedback; below you get (1) a concise checklist with analytic evaluation of each new point, (2) resolved decisions and any justified trade‑offs, (3) deltas applied to the model, and (4) a final consolidated architecture document you can drop in (`docs/specly-architecture.md`). I also outline next concrete implementation steps.

## Checklist (New Feedback → Analysis → Decision)
1. Profile inheritance (linear parent chain)  
   - Analysis: Enables “base profile” reuse, minimizes duplication. Risks: complexity in version resolution, potential drift if parent updates after child snapshot.  
   - Decision: Adopt linear inheritance at both profile and profile_version layers for deterministic snapshotting. Each `profile_version` points to an optional `parent_profile_version_id`. Effective tool set is flattened at creation for O(1) runtime lookup.

2. Replace `session_id` with `client_state_id`?  
   - Analysis: `session_id` is stable internal PK; `client_state_id` is ownership/lease token. Replacing removes an authoritative handle and complicates journaling & idempotency.  
   - Decision: Keep `session_id` (server authoritative) and continue using `client_state_id` as the lease token. Do not conflate.

3. `profile_version_tools` table (unique constraints)  
   - Already agreed. Ensure unique indices on `(profile_version_id, tool_name)` and `(profile_version_id, command_alias)`.

4. Soft delete persistent tasks + hard purge at 90 days  
   - Analysis: Soft delete supports audits/resume history; 90‑day purge bounds storage.  
   - Decision: Adopt; add maintenance job spec.

5. Session status naming: prefer `idle` over `paused`  
   - Analysis: `idle` is idiomatic for “no current work / waiting”; aligns with earlier mental model.  
   - Decision: Rename session statuses to `active | idle`. Task still uses `paused`? We chose previously `paused`; reconsider for symmetry: keep `paused` for user-intentional pause vs `idle` meaning inactivity. Final:  
     - Session statuses: `active | idle`  
     - Task statuses: `queued | in_progress | awaiting_input | blocked | paused | completed | failed` (unchanged)  
     Rationale: A task can be deliberately `paused`; a session is either actively executing or simply idle (awaiting next trigger).

6. Defer `canceled` status  
   - Decision: Deferred; can be added later without breaking compatibility.

## Key Model Deltas Applied
- Added profile inheritance: `profiles.parent_profile_id` (nullable); `profile_versions.parent_profile_version_id` (nullable).  
- Effective tool resolution: when creating a child `profile_version`, we flatten parent chain’s effective mapping, then apply overrides/additions from request, optionally removals (using a removal marker list).  
- Added optional removal semantics: client may specify `"remove": ["tool_a","tool_b"]` when creating a child profile version; removal simply excludes those tools from the flattened set.  
- `profile_version_tools` gains `inherited_from_profile_version_id` (nullable) for traceability.  
- GC policy: background sweeper permanently deletes tasks/sessions with `deleted_at < now - 90d` (only those already soft-deleted).  
- Session statuses changed to `active/idle`.  
- Clarified session vs client_state_id contract.

## Remaining Minor Decisions (Defaulted—override if you disagree)
- Removal mechanism: simple array on creation; no DB flag per tool (flattened manifest excludes removed tools; audit via lineage rows).  
- Expression transitions remain planned (future); now only `result_code` + `always`.  
- No JSON “manifest” blob now that we normalize—runtime effective set derived via `profile_version_tools` rows (flattening avoids recursive lookups).

## Final Architecture Document
Below is the consolidated final doc incorporating all changes. Replace previous drafts with this file.

````markdown
# Specly Architecture (Final Core Model w/ Profile Inheritance)

## 1. Purpose
Specly is an MCP server providing deterministic multi-step “spec” workflows (prompt + autonomous action nodes) to AI assistants. Hash-addressed specs and versioned tool/profile snapshots guarantee reproducibility; the server exclusively controls flow progression.

## 2. Core Abstractions
| Concept | Summary |
|---------|---------|
| Spec | Immutable execution unit (prompt or action) hashed over canonical fields. |
| Tool Version | DAG snapshot of spec hashes (ordered list + transition edges) hashed for integrity. |
| Tool | Stable identity (name + description); owns many versions historically. |
| Profile | Logical collection of tools for a domain; can inherit from a parent profile (linear chain). |
| Profile Version | Flattened snapshot of tool versions (with aliases) plus pointer to optional parent profile version. |
| Workspace Binding | Workspace pinned to a single profile version (explicit upgrades). |
| Task | User-visible unit of work pinned to a profile version; tracks lifecycle & optional dependencies. |
| Session | Execution context for a tool run; transient until attached to a task. |
| Action Journal | Idempotency + retry ledger for side-effect specs. |
| Workspace Rules | Stored preference/constraint facts shaping future prompts. |

## 3. Hashing & Determinism
- Spec hash = SHA-256(canonical JSON of immutable fields: executor_* / intent / side_effect / template / schemas / params / security / metadata).
- Tool version hash = SHA-256 of `{ tool_name, ordered_specs[], sorted_edges[] }`.
- Canonicalization: sort keys recursively, normalize endlines to LF, trim trailing spaces, collapse >2 blank lines to 2, strip null/undefined keys.

## 4. Profile Inheritance
Profiles form a linear chain (no diamonds):
- `profiles.parent_profile_id` (nullable).
- A `profile_version` may reference a `parent_profile_version_id`.  
Creation algorithm for a new child `profile_version`:
1. Walk ancestry chain (parent → root) collecting effective tool mapping (tool_name → (tool_version_hash, command_alias)).
2. Apply removals (optional `remove: [tool_a,...]` list).
3. Apply overrides/additions from request payload.
4. Persist flattened rows to `profile_version_tools`:
   - For inherited tools not overridden: row with `inherited_from_profile_version_id` pointing to ancestor providing that tool.
   - For overrides/new tools: `inherited_from_profile_version_id = NULL`.
Guarantees O(1) resolution at runtime; no recursive merge.

## 5. Status Model
Task statuses:  
`queued | in_progress | awaiting_input | blocked | paused | completed | failed`  
Session statuses:  
`active | idle`  
Rationale: task may be deliberately paused; a session is idle when not executing (waiting on input, blocked, or paused task).

## 6. Dependency Management
`task_dependencies (task_id, depends_on_task_id)` (unique pair).  
A task is `blocked` if any dependency not in `completed` or `failed`. An optional inline `blocked_reason` can force `blocked`. On resolution, status transitions to `queued` (if not started) or `in_progress`.

## 7. Transitions & Routing
Transition row structure (in `tool_versions.graph_manifest.edges` & optionally a normalized table later):
```json
{ "from": "...", "to": "...", "condition_type": "result_code|always", "condition_value": "...", "priority": 0 }
```
Selection algorithm:
1. Gather edges with `from = current_spec`.
2. Partition by specificity (result_code > always).
3. From highest non-empty partition, pick edge with lowest `priority` (default 100); tie-break by insertion order.
4. If none → task `failed` (dead-end).
5. Human next node sets task `awaiting_input`, session `idle`.

## 8. Spec Execution Flow
1. Resolve (task_id or transient session).
2. If task in `queued` and dependencies resolved → `in_progress`.
3. Load current spec.
4. If intent='human' & no args → render template, mark task `awaiting_input`, session `idle`.
5. Else:
   - Validate args against `input_schema`.
   - If side_effect: compute idempotency key (template > executor natural > fallback) and journal (replay short-circuit).
   - Run executor (exact version).
   - Validate output_schema; merge context; derive `result_code`.
6. Route to next spec via algorithm.
7. If none left → task `completed`.
8. Persist; respond with rendered content (if any) + derived state.

## 9. Session & Client Ownership
- `session_id`: internal stable identifier; always returned.
- `client_state_id`: lease token; first caller sets; must match on subsequent calls unless `force_start` overrides (transferring control).
- Transient sessions (no task) GC after 24h inactivity (hard delete).
- Persistent sessions soft-delete with task (soft delete) then hard purge ≥90 days after `deleted_at`.

## 10. Idempotency & Retries
`action_journal` keyed by `(spec_hash, session_id, idempotency_key)`:
- Status: pending → success/failed
- Retry policy (maxAttempts, strategy, delays).
- On success reuse result; on failure with remaining attempts schedule retry/backoff; else mark task `failed`.

## 11. Workspace Rules (Preferences)
`workspace_rules (workspace_id, relation, rule)` unique triple; fields:
- `relation`: 'always-do' | 'never-do' | 'is-a' | 'has-a'
- `rule`: canonical (lowercase trimmed)
- `original_text`, `confidence`, `last_reinforced_at`, `active`
Reinforcement formula (example): `new_conf = 1 - (1 - old_conf)*(1 - baseDelta)` (baseDelta≈0.3).  
Injected into prompt specs’ context (top-N by confidence & recency).

## 12. Profiles & Versions Data Model
Tables:
- `profiles (id, name, parent_profile_id, active_version_id, created_at)`
- `profile_versions (id, profile_id, parent_profile_version_id, version_number, created_at)`
- `profile_version_tools (id, profile_version_id, tool_name, tool_version_hash, command_alias, inherited_from_profile_version_id, created_at)`
Uniqueness:
- `(profile_version_id, tool_name)`
- `(profile_version_id, command_alias)`

Tool alias uniqueness enforced per profile version (post-inheritance application).

## 13. Tools & Versions
- `tools (name, description, created_at)`
- `tool_versions (hash, tool_name, graph_manifest JSON, created_at)`
Graph manifest minimal schema:
```json
{
  "ordered_specs": ["spec_hash", "..."],
  "entry_spec": "spec_hash",
  "edges": [
    { "from": "spec_hash", "to": "spec_hash", "condition_type": "result_code", "condition_value": "...", "priority": 10 }
  ]
}
```
Expression-based transitions are future extension (will add condition_type 'expression').

## 14. Specs
Immutable hashed table `specs`:
Fields: executor_type, executor_version, intent, side_effect, content_template, static_params, input_schema, output_schema, idempotency_key_template, retry_policy, show_output, security, metadata (display_name, tags, supersedes?, visibility), created_at.

## 15. Task & Session Tables (Core Columns)
Tasks:
- status ENUM
- profile_version_id (pin)
- session_id (if attached)
- blocked_reason
- deleted_at (soft delete)
Sessions:
- status ENUM('active','idle')
- current_spec_hash
- client_state_id
- human_blocking (boolean)
- idle_timeout_ms
- last_active_at
- deleted_at (nullable)
Dependencies:
- `task_dependencies (task_id, depends_on_task_id, created_at)` unique pair.

## 16. GC & Retention
- Transient session GC: `task_id IS NULL` & `last_active_at < now - 24h` → hard delete.
- Soft-deleted persistent tasks & sessions: purge if `deleted_at < now - 90d`.
- Configurable retention constants (ENV overridable).

## 17. API (Initial Scope)
Profiles & Tools:
- POST /api/specs
- POST /api/tools
- POST /api/tools/:tool/versions
- POST /api/profiles
- POST /api/profiles/:profile/versions (body: { parent_profile_version_id?, tools: [{ tool_name, tool_version_hash, command_alias }], remove?: [tool_name] })
- POST /api/profiles/:profile/versions/:version/publish  (activates profile version)
- POST /api/workspaces/:id/profile/upgrade  (bind workspace to active profile version)
- GET /api/workspaces/:id/profile

Execution & Tasks:
- POST /api/tasks  (create task; status: queued or in_progress)
- PATCH /api/tasks/:id/status
- POST /api/tasks/:id/dependencies
- DELETE /api/tasks/:id/dependencies/:depends_on
- POST /api/tools/:tool/execute  (body: { task_id?, session_id?, client_state_id?, force_start?, args? })
- GET /api/tasks/:id
- GET /api/sessions?workspace_id=&task_id?
- DELETE /api/sessions/:id  (transient only)

Rules:
- POST /api/rules  (upsert)
- GET /api/rules?workspace_id=

## 18. Validation & Edge Cases
| Scenario | Handling |
|----------|----------|
| Circular profile inheritance | Reject creation (DFS check). |
| Overriding non-existent tool in child | Treated as addition. |
| Removal of tool not present | Ignored (idempotent). |
| Dead-end spec (no edges) mid-run | Task failed with diagnostic. |
| Duplicate alias post-flattening | Reject before insert (unique constraint). |
| Client resume mismatch | 409 unless `force_start`. |
| Human input spec w/out args | Return prompt; no progression. |
| Side-effect replay | Journal short-circuit with stored result. |

## 19. Extensibility (Deferred)
- Transition expressions (condition_type=expression)
- `canceled` task status
- Selection tokens for LLM-driven branching
- Streaming executor outputs
- Rule embeddings / subject extraction
- Executor sandbox isolation (workers / seccomp)
- Tool removal auditing (separate tombstone table if required)

## 20. Rationale Highlights
- Flattened profile version after inheritance → predictable runtime cost.
- Server-only flow routing eliminates client divergence.
- Separation of `session_id` and `client_state_id` preserves internal integrity + lease semantics.
- Linear profile inheritance avoids conflict resolution heuristics (no diamond merges).
- Soft delete + time-based purge ensures auditability without unbounded growth.

````

## Implementation Roadmap (Refreshed)
1. Migrations: create new tables (specs, tools, tool_versions, profiles, profile_versions, profile_version_tools, workspace_profile_versions, tasks, task_dependencies, sessions, action_journal, workspace_rules).
2. Utilities: spec canonicalizer + hash tests; tool version hashing tests.
3. Executor registry scaffold (builtin prompt + stub action).
4. Profile & inheritance creation service (flatten + validation).
5. Task/session engine (linear routing).
6. Side-effect journal + idempotency.
7. Rules upsert & reinforcement logic.
8. GC scheduler (transient + soft-delete purge).
9. Observability hooks (basic logging).
10. Add branching via result_code edges (initial).

## Ready for Next Step
If you approve this final doc, I can:
A) Generate Drizzle migration skeletons & hashing utility code  
B) Add unit test stubs for canonicalization & routing  
C) Both A + B in one pass

Let me know (“proceed with A”, “A+B”, etc.) or call out any last-minute tweaks (e.g., drop removals, change status names). I’ll execute immediately.
