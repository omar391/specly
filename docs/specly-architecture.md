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

## 3. Execution Model
### 3.1 State Machine (Text Diagram)
```text
┌──────────┐     autonomous spec      ┌─────────────┐
│ RUNNING  │ ───────────────────────▶ │RUNNING(next)│
└────┬─────┘                          └────┬────────┘
  │ human spec encountered              │
  │                                     │ executor error (no attempts remain)
  ▼                                     ▼
┌──────────────┐   resume(token)   ┌────────────┐
│ AWAITING_INPUT│ ───────────────▶ │ RUNNING     │
└──────┬────────┘                  └────┬───────┘
    │ stale/used token               │ plan exhausted
    ▼                                ▼
┌──────────┐   dead-end / structural  ┌───────────┐
│ ERROR    │ ◀─────────────────────── │ COMPLETED │
└──────────┘                          └───────────┘
```
Transitions:
- RUNNING → AWAITING_INPUT when next planned node intent = human.
- AWAITING_INPUT → RUNNING when resume invoked with valid unused resumeToken.
- AWAITING_INPUT → ERROR when resumeToken mismatched/stale (RESUME_TOKEN_INVALID).
- RUNNING → ERROR on executor failure after exhausting retries (EXECUTOR_FAILED) or lease renewal failure.
- RUNNING → ERROR on dead-end detection (ROUTE_DEAD_END).
- RUNNING → COMPLETED when all plan steps consumed and last node has no outgoing edges.

### 3.2 Seams 

| Seam | Purpose | Current Implementation | Future Extension | 

|------|---------|------------------------|------------------| 

| Lease Provider | Session ownership & renewal | In-memory interface (acquire/renew/release) | Persistent / distributed lease with TTL | 

| Journal | Idempotency + retry replay | Single mutable row per (session,spec,idempotency_key) | Immutable attempt history table | 

| Metrics | Operational observability | Counter increments in critical paths | Histograms, labels (tool_name, result_code) | 

| Retry Policy | Controlled reattempt of autonomous failures | maxAttempts + strategy (immediate/exponential logical) | Real delay scheduling / jitter | 

| Resume Token Invalidation | Prevent duplicate progress after human input | In-memory consumed token set | Persisted token versioning & concurrency detection |

### 3.3 Error Taxonomy (Runtime + Structural) 

| Code | Layer | Trigger | Caller Guidance | 

|------|-------|---------|-----------------| 

| GRAPH_CYCLE | Structural | Cycle/self-loop in validation | Fix graph definition | 

| GRAPH_MISSING_NODE | Structural | Edge references absent spec | Correct manifest or builder | 

| EXECUTOR_FAILED | Runtime | Final autonomous attempt failed | Investigate spec executor; maybe increase retries | 

| LEASE_ACQUIRE_FAILED | Runtime | Competing client ownership | Retry with force if appropriate | 

| LEASE_RENEW_FAILED | Runtime | Lost lease mid-run | Re-run from start after resolving ownership | 

| ROUTE_DEAD_END | Runtime | Plan ended while outgoing edges exist (planner gap) | Inspect planner / manifest consistency | 

| RESUME_TOKEN_INVALID | Runtime | Token mismatch or reuse | Obtain fresh state and retry resume |

### 3.4 Determinism Guarantees
- Topological ordering stable: sorting by incoming edge priority desc then spec hash.
- Context merge: last-writer-wins with deterministic key insertion order.
- Side-effect reuse: replay short-circuits executor and maintains execution order invariants.
- Retry attempts do not reorder subsequent specs; unsuccessful attempts leave no additional plan entries.

### 3.5 Performance Characteristics
- Planning: O(V+E) (Kahn with priority sorting cost O(V log V) worst-case from ready set sorting).
- Execution: O(N) over plan steps (each spec executed at most once logically; retries bounded by maxAttempts constant factor).
- Reuse path: O(1) journal lookup before executor.

## 4. Hashing & Determinism
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

### 5.1 Status Transitions & Dependency Guard
- Centralized transition rules enforce allowed moves between task statuses. Illegal transitions (e.g., queued → completed) return HTTP 422.
- Dependency-aware guard: transitioning into `in_progress` or `completed` is rejected (HTTP 422) if any declared dependency is unresolved (not `completed` or `failed`).
- Completing a task sets `completed_at` timestamp exactly once; subsequent non-terminal transitions are disallowed.
- `blocked` may be set explicitly with an optional `blocked_reason`; when all dependencies resolve, tasks can move back to `queued` (if never started) or `in_progress` via explicit API calls.

## 6. Dependency Management
`task_dependencies (task_id, depends_on_task_id)` (unique pair).  
A task is `blocked` if any dependency not in `completed` or `failed`. An optional inline `blocked_reason` can force `blocked`. On resolution, status transitions to `queued` (if not started) or `in_progress`.

## 7. Transitions & Routing
Transition row structure (in `tool_versions.graph_manifest.edges` & optionally a normalized table later):
```json
{ from, to, condition_type: 'result_code' | 'always', condition_value?, priority? }
```
Selection algorithm (deterministic):
1. Gather edges with `from = current_spec`.
2. Partition by specificity (result_code > always).
3. From highest non-empty partition, pick edge with lowest `priority` (normalized: missing → 100); tie-break by stable insertion order (or hash secondary if needed).
4. If none → task `failed` with `result_code = no_transition` (dead-end mid-run distinct from validation failures).
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

### 10.1 Idempotency & Journal Mechanics
The action journal enforces idempotent execution for side-effect specs and provides the substrate for retries. Core properties:
1. Persistence Model: A single logical row per `(session_id, spec_hash, idempotency_key)` representing the latest attempt state. Columns capture status (`pending|success|failed`), attempt count, timestamps, result payload, and last error code.
2. Idempotency Key Resolution: If a spec defines `idempotency_key_template`, the engine performs simple token substitution (`{{spec_hash}}`). Absent a template, the fallback key is the spec hash. Template expansion must be deterministic and side-effect free.
3. Upsert Semantics: First observation inserts a `pending` row; subsequent lifecycle transitions mutate the same row (attempt count incremented, status and payload fields updated). This keeps lookups O(1) while preserving aggregate attempt count.
4. Foreign Key Integrity: Specs must exist prior to execution; journal logic never creates placeholder spec rows. Environment (seeding or API publishing) is responsible for ensuring presence.
5. Reuse (Replay) Path: For a side-effect spec, before invoking the executor the engine queries the journal for a `success` row with matching keys. If found, the stored result is injected directly into the execution context and normal routing continues without executor invocation.

### 10.2 Retry & Collision Strategy
1. Retry Policy: A spec-level JSON field `retry_policy` supplies `{ maxAttempts, strategy, baseDelayMs }`. The engine attempts execution up to `maxAttempts` times (inclusive of the first attempt). Supported strategies: `immediate` (no delay) and `exponential` (logical backoff value computed; scheduling of actual delays is an implementation detail and may be deferred). `maxAttempts` MUST be ≥ 1.
2. Attempt Lifecycle: Each attempt (including the first) is journaled: `started` then `succeeded` or `failed`. On failure with remaining budget, the engine proceeds to the next attempt; on failure with no remaining budget it surfaces error code `EXECUTOR_FAILED`.
3. Collision Semantics: The key space `(session_id, spec_hash, idempotency_key)` yields exactly one mutable journal row. Cross-spec collisions (distinct `spec_hash` producing the same `idempotency_key`) are undefined behavior and SHOULD be prevented by upstream key template design. Future revisions MAY introduce explicit collision detection and a counter `action_journal_collisions_total`.
4. Metrics: Counters: `specly_engine_reuse_hits_total` (successful replay), `action_journal_retries_total` (each retry beyond the first), `action_journal_retry_exhausted_total` (terminal exhaustion), `specly_engine_journal_failures_total` (journal write/upsert failures swallowed to preserve execution). Additional histograms (e.g. retry backoff distributions) MAY be added without altering semantics.
5. Audit & Forensics: The aggregate row maintains cumulative attempt count and final outcome. A future extension MAY add an immutable per-attempt history table for detailed auditing without impacting replay performance.
6. Failure Tolerance: Journal write failures MUST NOT cause executor success paths to abort. Replay therefore provides at-most-once semantics; under transient write failure conditions re-execution MAY occur, preserving correctness over strict duplication avoidance.

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
  "ordered_specs": [spec_hash...],
  "entry_spec": spec_hash,
  "edges": [
    { "from": spec_hash, "to": spec_hash, "condition_type": "result_code"|"always", "condition_value": "...", "priority": 10 }
  ]
}
```
Expression-based transitions are future extension (will add condition_type 'expression').

### 13.1 Pre-Persist Graph Validation (Validator)
Before hashing & persisting a tool version, the validator enforces:
- Exactly one `entry_spec` (multi-entry not supported).
- All `ordered_specs` unique; all edge `from`/`to` appear in `ordered_specs`.
- No self-loops.
- No cycles (Kahn or DFS detection across reachable subgraph from entry).
- No unreachable specs (any node not reached from entry) → ERROR unless internal flag `allow_unreachable=true` supplied (dev only; not public API feature).
- Priorities: missing → 100; must be integer ≥ 0; reject non-integer / negative.
- Edge list normalized (sorted) before hash to guarantee deterministic hashing.

Validator returns a normalized manifest (filled priorities, sorted edges). Failure produces typed error codes: `ERR_MULTI_ENTRY`, `ERR_UNDECLARED_SPEC`, `ERR_SELF_LOOP`, `ERR_CYCLE`, `ERR_UNREACHABLE`, `ERR_PRIORITY_INVALID`.

Normalization & Hashing Guarantees:
- Missing `priority` is normalized to `100` before hashing.
- Edge list is deterministically sorted by `(from, to, condition_type, condition_value, priority, insertion_index)` ensuring stable tool version hashes regardless of input order.
- Changing an explicitly provided `priority` that differs from the default affects the hash, as expected.

Public API Error Mapping (Validator → HTTP): 

| Internal Code | Public Code | HTTP | 

|---------------|------------|------| 

| ERR_CYCLE, ERR_SELF_LOOP | GRAPH_CYCLE | 422 | 

| ERR_UNDECLARED_SPEC, ERR_ENTRY_NOT_DECLARED | GRAPH_MISSING_NODE | 422 | 

| ERR_UNREACHABLE, ERR_PRIORITY_INVALID, ERR_DUP_SPEC | GRAPH_INVALID | 422 |

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
 - assets JSON
 - external_references JSON
 - metadata JSON
 - tags JSON
 - completed_at (nullable)
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

### 15.1 JSON Column Rationale (Tasks)
- assets: arbitrary structured pointers to artifacts produced/consumed by tasks (e.g., URLs, object descriptors).
- external_references: stable links or IDs in external systems (issue trackers, PRs), deliberately kept outside `metadata` for first-class filtering and future indexing.
- metadata: unstructured, extensible key/value bag for UI or orchestration hints not used for primary filtering.
- tags: simple array/object for lightweight classification; separate from metadata for consistent querying.

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

| Dead-end spec (no edges) mid-run | Task failed with diagnostic (result_code `no_transition`). | 

| Duplicate alias post-flattening | Reject before insert (unique constraint). | 

| Client resume mismatch | 409 unless `force_start`. | 

| Human input spec w/out args | Return prompt; no progression. | 

| Side-effect replay | (Phase 1 seam) Journal write only; replay & retry logic added later (SP-010). | 

| Unreachable spec in new tool version | Validation error (422) unless `allow_unreachable=true` internal override. | 

| Multiple entry specs declared | Validation error (ERR_MULTI_ENTRY). | 

| Cycle in edges | Validation error (ERR_CYCLE). |

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

---

## Appendix A: Security & Validation Limits

### A.1 Executor Type Whitelist
Only the following executor types are permitted for spec definitions:
- `function` - JavaScript function execution (sandboxed)
- `bash` - Shell script execution
- `rest` - HTTP REST API calls
- `graphql` - GraphQL query execution
- `noop` - No-op executor (testing/placeholder)
- `node` - Node.js script execution

**Enforcement:** Spec creation (POST /api/specs) validates `executor_type` against this whitelist. Attempts to register specs with unlisted executors (e.g., `python`, `ruby`, arbitrary strings) are rejected with HTTP 422 and error code `ERR_INVALID_EXECUTOR_TYPE`.

**Rationale:** Limits attack surface by restricting execution vectors to known, validated executor implementations. Future executor types require explicit whitelist addition and security review.

### A.2 Size Limits

#### Spec Content Template
- **Limit:** 1 MB (1,048,576 bytes) default
- **ENV Variable:** `SPECLY_MAX_SPEC_CONTENT_SIZE`
- **Enforcement:** POST /api/specs validates `content_template` size before hashing
- **Error:** HTTP 422, code `ERR_SPEC_CONTENT_TOO_LARGE`
- **Rationale:** Prevents memory exhaustion from maliciously large prompt templates

#### Input/Output Schemas
- **Limit:** 100 KB (102,400 bytes) each, default
- **ENV Variables:** `SPECLY_MAX_INPUT_SCHEMA_SIZE`, `SPECLY_MAX_OUTPUT_SCHEMA_SIZE`
- **Enforcement:** POST /api/specs validates `input_schema` and `output_schema` sizes
- **Errors:** HTTP 422, codes `ERR_INPUT_SCHEMA_TOO_LARGE`, `ERR_OUTPUT_SCHEMA_TOO_LARGE`
- **Rationale:** JSON schema validation complexity scales with schema size; limits prevent DoS via schema bomb attacks

#### Graph Constraints
- **Max Nodes:** 1000 specs per tool version (default)
  - **ENV Variable:** `SPECLY_MAX_GRAPH_NODES`
  - **Error:** HTTP 422, code `ERR_GRAPH_TOO_MANY_NODES`
  
- **Max Depth:** 50 levels from entry_spec (default)
  - **ENV Variable:** `SPECLY_MAX_GRAPH_DEPTH`
  - **Error:** HTTP 422, code `ERR_GRAPH_TOO_DEEP`
  
- **Max Edges:** Implicitly bounded by nodes (each node can reference any other)
  - **Error:** HTTP 422, code `ERR_GRAPH_TOO_MANY_EDGES`

- **Enforcement:** POST /api/tools/:tool/versions validates graph size/depth during structural validation (before hash computation)
- **Rationale:** Prevents cycle detection algorithms (O(V+E)) from becoming DoS vectors; ensures planning completes in bounded time

### A.3 Command Alias Uniqueness

**Constraint:** `command_alias` must be unique across all tool registrations (global namespace)

**Enforcement:** 
- POST /api/tools validates alias uniqueness before tool creation
- Duplicate alias attempts return HTTP 409 with error code `ERR_COMMAND_ALIAS_CONFLICT`
- `null` aliases are permitted (tools without CLI shortcuts)

**Rationale:** Command aliases provide CLI convenience layer shortcuts. Global uniqueness prevents ambiguity when resolving tool invocations from command-line interfaces. Profile-level tool attachment may reference the same tool version multiple times with different workspace-local names, but the underlying tool's `command_alias` remains globally unique.

**Example Conflict:**
```bash
# Tool A registered with command_alias="analyze"
POST /api/tools { name: "data-analyzer", command_alias: "analyze" } → 201 Created

# Tool B attempts same alias
POST /api/tools { name: "log-analyzer", command_alias: "analyze" } → 409 Conflict
{
  "error": "ERR_COMMAND_ALIAS_CONFLICT",
  "message": "Command alias 'analyze' already registered to tool 'data-analyzer'"
}
```

### A.4 Configuration Reference

All security limits are configurable via environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SPECLY_MAX_SPEC_CONTENT_SIZE` | 1048576 (1 MB) | Maximum spec content_template size in bytes |
| `SPECLY_MAX_INPUT_SCHEMA_SIZE` | 102400 (100 KB) | Maximum input_schema size in bytes |
| `SPECLY_MAX_OUTPUT_SCHEMA_SIZE` | 102400 (100 KB) | Maximum output_schema size in bytes |
| `SPECLY_MAX_GRAPH_NODES` | 1000 | Maximum specs per tool version graph |
| `SPECLY_MAX_GRAPH_DEPTH` | 50 | Maximum depth from entry_spec to any reachable node |

**Configuration Example:**
```bash
# Increase limits for trusted internal deployment
export SPECLY_MAX_SPEC_CONTENT_SIZE=5242880  # 5 MB
export SPECLY_MAX_GRAPH_NODES=5000
export SPECLY_MAX_GRAPH_DEPTH=100

# Start server with custom limits
pnpm start
```

### A.5 Validation Test Coverage

Security validation is comprehensively tested in `src/__tests__/security-validation.test.ts`:
- ✅ Executor type whitelist (reject python, accept whitelisted types)
- ✅ Spec size limits (reject oversized content_template/input_schema/output_schema, accept within limits)
- ✅ Graph constraints (reject graphs exceeding node count or depth limits, accept valid graphs)
- ✅ Command alias uniqueness (reject duplicate aliases, allow unique and null aliases)
- ✅ Environment configuration validation (override defaults, verify limits respected)

**Total Security Tests:** 15 passing (included in 218/218 test suite)

### A.6 Security Posture Summary

| Dimension | Implementation | Status |
|-----------|----------------|--------|
| **Input Validation** | Whitelist + size limits | ✅ Complete |
| **Resource Limits** | Graph size/depth constraints | ✅ Complete |
| **Namespace Integrity** | Command alias uniqueness | ✅ Complete |
| **Configuration** | ENV-based overrides | ✅ Complete |
| **Test Coverage** | 15 dedicated security tests | ✅ Complete |

**Production Recommendations:**
1. Deploy with default limits unless specific use cases require adjustment
2. Monitor rejected requests (422/409 codes) for potential attack patterns
3. Consider additional rate limiting at reverse proxy layer for public-facing deployments
4. Regularly audit executor implementations for sandbox escape vulnerabilities
5. Log all ERR_COMMAND_ALIAS_CONFLICT events for namespace collision detection
