# Incoming 3
Here’s an updated, streamlined design incorporating each of your feedback points, highlighting deltas, trade‑offs, and a refined schema/API. I’ve kept it skimmable but concrete so we can lock it in before writing migrations.

## Checklist (your feedback → incorporated status)
1. Tool `name` & `command_alias` uniqueness scoped to profile (not global) – Adjusted
2. Task status needs richer lifecycle (blocked, in_progress, etc.) – Adjusted
3. Session status should stay lean (no “completed”) – Adjusted
4. Remove redundant `transient` boolean (task_id null ⇒ transient) – Adjusted
5. Rules table: remove `subject`, rename `object` → `rule` – Adjusted
6. Remove `next_spec_hash` from execute API (server owns progression) – Adjusted (with branching strategy)
7. Add separate task status `waiting_for_human` (distinct from idle) – Added
8. Remove separate resume endpoint; reuse execute with flags – Adjusted
9. Rename rules “reinforce” endpoint to something simpler (update) – Adjusted
10. Exact executor version pinning – Accepted
11. No session reattachment without force_start – Accepted
12. Rule extraction: LLM / manual; keep deterministic base – Adjusted
13. Tool version built offline then published; rename finalize → publish – Adjusted
14. Transient session GC, no query after GC; optional soft delete window – Adjusted
15. Minimize API + table count – Consolidated where safe

## 1. Tool & Profile Scoping

### Option Chosen
Tools exist logically within a profile version scope. We’ll implement:

- `profiles` (immutable identity)
- `profile_versions` (snapshot manifest)
- `tools` (global table, but uniqueness constraints enforced per profile_version using a join table)
- `profile_version_tools` (mapping; enforces uniqueness of (profile_version_id, tool_name) and (profile_version_id, command_alias))

This gives:
- Reusability of a tool definition across multiple profile versions (if unchanged)
- Scoped uniqueness without duplicating rows
- Ability to publish a new profile version referencing a new tool version or the same tool

If you prefer a stricter “tool rows are profile-local,” we can drop the mapping table and add `profile_id` on tools; trade‑off: duplication of unchanged tools across versions. (Current plan: keep mapping for dedupe.)

## 2. Status Model

### Task statuses
- `in_progress`
- `waiting_for_human`
- `blocked`
- `idle` (not actively progressing but not blocked; e.g., paused by user)
- `completed`
- `failed`
(Optionally `queued` later if we introduce scheduling.)

### Session statuses
- `active`
- `idle` (no activity past idle timeout OR currently blocked on a human prompt)
We drop “completed.” A session becomes irrelevant once the task transitions to `completed` or `failed`; session row can remain (for provenance) but status stays `idle`. We retain `human_blocking` flag for fast predicate.

Derivation:
- If current spec.intent='human' and no args supplied yet → task status set to `waiting_for_human`; session.status may become `idle`, `human_blocking=true`.
- When user provides args → task moves to `in_progress`; session.status → `active`.

### Blocked Tasks
We introduce a `task_blockers` table or a self‑referential relation (M:N) so dependency resolution can set status `blocked` automatically when any unmet dependency remains. (Optional in Phase 1; can start with a simple `blocked_reason` string.)

## 3. Session Transience Simplification

Remove `transient` column; transience = `task_id IS NULL`.
GC queries look for:
- `task_id IS NULL`
- `last_active_at < now - 24h`
Delete (or mark soft-deleted with a tombstone table if we add soft delete later).

(If you want soft delete now: add `deleted_at` nullable; GC permanently purges after 90 days.)

## 4. Rules / Preferences Table

Simplified structure:

workspace_rules:
- id
- workspace_id
- relation ('always-do' | 'never-do' | 'is-a' | 'has-a')
- rule (TEXT) – canonicalized form (lowercase trimmed) + original text if we want to preserve formatting
- original_text (optional)
- confidence (REAL)
- source_session_id (nullable)
- created_at
- last_reinforced_at
- active (boolean)

Unique index suggestion: (workspace_id, relation, rule) to consolidate reinforcement.

Inference of “subject” becomes a derived concern (embedding, later classification). We can add a `subject` cached column later if needed without changing hash logic.

## 5. Branching Without Client Passing next_spec_hash

Removing `next_spec_hash` raises a selection question when multiple edges are valid. Three viable strategies:

A. Server auto-select: deterministic ordering (priority asc) + optional internal heuristic → invisible to client (simplest, but hides agency from LLM).  
B. Server returns candidate list + a short opaque selection token (NOT raw spec hash). Client echoes selected token in `args.selection_token`. Server expands token to the spec hash. (Preserves safety & removes need to expose hash choosing.)  
C. Keep spec hashes visible but treat them as read-only identifiers; client never “chooses,” server chooses based on result_code from executor output only.

Given your desire to not have the client dictate next step, Strategy A or C fit. If we still want LLM autonomy in choosing branches semantically, Strategy B is a compromise (token, not spec hash, and still flows through server validation). Recommend: Start with Strategy A (auto-progress) and add Strategy B later if needed.

For now:
- Remove any request field that influences next step.
- Executor returns optional `result_code`; server selects first matching edge; fallback to first `always` edge.

## 6. Unified Execute Endpoint

POST /api/tools/:tool/execute

Body (updated):
```json
{
  "task_id": number | null,
  "session_id": number | null,
  "client_state_id": string | null,
  "force_start": boolean | null,
  "args": object | null
}
```

Semantics:
- If `session_id` given → resume (validate `client_state_id` or require `force_start`).
- Else if `task_id` given → attach/create session.
- Else → create transient session (returns session_id; may later be attached to task via task creation endpoint or a dedicated attach call).
- No step selection fields.
- If at a human step and `args` absent → return prompt (do not advance).
- If at a human step and `args` present → process & advance automatically.

Resume endpoint removed.

## 7. Tool Version Publication

Endpoints:
- POST /api/tools (create tool skeleton; supply name, alias, description)
- POST /api/tools/:tool/versions (body: { ordered_specs: string[], edges?: Edge[], entry_spec?: string })
  - Server computes tool_version hash; stores row (draft state stored only in request scope; we are not persisting a "draft" flag).
- POST /api/tools/:tool/publish (body: { tool_version_hash, profile_version_id }) 
  - Sets `active_version_hash` for the tool *within that profile version context*, or we maintain an association table mapping (profile_version_id, tool_name) → tool_version_hash.
Naming Change: “publish” instead of “finalize.” If we want a separation between “publish” (store version) and “activate” (swap active), we can add `POST /api/tools/:tool/activate` but simplest is treat publish as immediate activation.

Simplification Option:
- Eliminate `activeVersionHash` column on tools; make active resolution purely via `profile_version_manifest.tools[tool_name]`. Then to “activate” you create a new profile_version referencing the new tool_version. This is the pure snapshot model. (Cleaner, one source of truth.)
Recommendation: Adopt snapshot-only model (drop `activeVersionHash` & `profileVersionId` columns on tools). Activation = creating & selecting a new profile_version. This encourages immutable history and avoids ambiguous “which profile is this tool active for?”.

## 8. Reduced Table Set

After simplification choices:

Required initially:
- specs
- tool_versions
- tools
- profiles
- profile_versions
- workspace_profile_versions (rename from workspace_profiles to show it points to a version)
- sessions
- tasks
- action_journal
- workspace_rules
- (optional) task_blockers (Phase later)

Dropped:
- profile_version_tools (if we embed mapping inside profile_version.manifest JSON)
- transient flag column (implied)
- separate resume endpoint table adjustments

Profile version manifest shape:
```json
{
  "tools": {
    "add_task": { "tool_version_hash": "...", "command_alias": "add" },
    "start_task": { "tool_version_hash": "...", "command_alias": "go" }
  },
  "meta": { "changelog": "...", "created_by": "system" }
}
```
Tools table now only: (name PK, description, created_at). Alias lives in manifest for version scoping. That fully satisfies “alias uniqueness within profile version.”

## 9. Updated Schema Sketch (Condensed)

```ts
// Tool identity (no alias, no activeVersion fields)
tools: {
  name PK,
  description,
  created_at
}

tool_versions: {
  hash PK,
  tool_name FK -> tools.name,
  graph_manifest JSON { ordered_specs, edges, entry_spec },
  created_at
  // hash computed deterministically
}

// Immutable spec model (unchanged except removed runtime counters initially for minimalism)
specs: {
  hash PK,
  executor_type,
  executor_version,
  intent,
  side_effect,
  content_template,
  static_params JSON,
  input_schema JSON,
  output_schema JSON,
  idempotency_key_template,
  retry_policy JSON,
  show_output,
  security JSON,
  metadata JSON,
  created_at
}

// Profiles & versions (alias + version mapping lives in manifest)
profiles: {
  id PK,
  name UNIQUE,
  description,
  created_at,
  active_version_id FK -> profile_versions.id
}

profile_versions: {
  id PK,
  profile_id FK,
  version_number INT,
  manifest JSON, // { tools: { tool_name: { tool_version_hash, command_alias } } }
  created_at
}

workspace_profile_versions: {
  workspace_id,
  profile_version_id,
  pinned_at
  // Composite primary key (workspace_id) or allow multiple historical rows if we want upgrade history
}

tasks: {
  id PK,
  workspace_id,
  title,
  description,
  status ENUM('in_progress','waiting_for_human','blocked','idle','completed','failed'),
  session_id FK nullable,
  created_at,
  updated_at,
  blocked_reason TEXT NULL
}

task_blockers (optional future): {
  task_id,
  blocker_task_id,
  created_at
}

sessions: {
  id PK,
  workspace_id,
  tool_name,
  current_spec_hash,
  status ENUM('active','idle'),
  client_state_id,
  last_active_at,
  started_at,
  context JSON,
  last_result_code,
  task_id FK nullable,
  human_blocking BOOLEAN,
  idle_timeout_ms INT
  // no completed_at, derive from task status when linked
}

action_journal: { ... same as prior ... }

workspace_rules: {
  id PK,
  workspace_id,
  relation ENUM('always-do','never-do','is-a','has-a'),
  rule TEXT,
  original_text TEXT NULL,
  confidence REAL,
  source_session_id INT NULL,
  created_at,
  last_reinforced_at,
  active BOOLEAN
  // Unique (workspace_id, relation, rule)
}
```

## 10. API Surface (Revised Minimal Form)

- POST /api/specs
- POST /api/tools (create tool identity)
- POST /api/tools/:tool/versions (create new tool version; returns hash)
- POST /api/profile/:profile/version (create new profile version: body lists tool_version hashes + alias per tool)
- POST /api/profile/:profile/version/publish (sets profile.active_version_id to newly created version)
- POST /api/workspaces/:id/profile/upgrade (bind workspace to profile.active_version_id)
- POST /api/tools/:tool/execute (unified start/resume/progress)
- POST /api/tasks (create task & start session)
- PATCH /api/tasks/:id/status (manual status change e.g., mark blocked/unblocked)
- GET /api/sessions?workspace_id=... (includes transient & persistent)
- GET /api/tasks/:id
- POST /api/rules (create/update rule; idempotent upsert on (workspace_id, relation, rule))
- GET /api/rules?workspace_id=...
(You suggested rename “reinforce” → “update”. We can just use POST /api/rules with upsert semantics.)

Removed:
- resume endpoint
- finalize endpoint (renamed publish at profile level)
- per-tool publish (activation happens by referencing tool_version hash inside a new profile_version)

Branching: currently server auto-select; if/when we add user/LLM choice we introduce `selection_token` later.

## 11. Edge Cases & Validation

| Area | Rule |
|------|------|
| Duplicate alias in same profile version | Reject when building manifest (pre-hash) |
| Publish profile version with missing tool_version hash | 400 error |
| Execute with task_id linked to different profile version than current workspace binding | 409 conflict (must upgrade workspace or rebase tool) |
| Session resume with mismatched client_state_id & no force_start | 409 |
| Attempt to update task status to completed while a human_blocking spec outstanding | 409 unless override flag |
| Side-effect spec retries | Abort after maxAttempts; mark task failed if critical (critical flag could be derived from side_effect + metadata.tags includes 'critical') |

## 12. Open (Minor) Decisions Remaining

1. Keep `blocked_reason` inline vs separate blockers table (lean start vs richer graph).  
2. Include `original_text` for rules now or add later. (I lean include now; cost negligible.)  
3. Add `priority` field on rules for direct injection ordering vs compute from confidence each time. (We can compute; skip column for now.)  

Let me know your preference on those; otherwise I’ll proceed with the lean choices: inline `blocked_reason`, include `original_text`, compute ordering dynamically.

## 13. Proposed Next Steps

If you’re aligned:
1. I draft a doc patch (update brainstorm.md or create `docs/specly-architecture.md`) reflecting this refined model.
2. Generate initial Drizzle migration skeleton for new tables (Phase 0).
3. Implement hashing utility + minimal executor registry scaffold.
4. Add unit tests for spec hashing determinism & rule upsert.

Tell me which of these to start (e.g., “proceed with doc patch” or “start Phase 0 migrations”).

## 14. Quick Diff Summary vs Previous Incoming Spec

- Removed: next_spec_hash, resume endpoint, transient flag, subject column, tool-level alias uniqueness globally.
- Added: richer task statuses, waiting_for_human, blocked_reason, alias scoping via profile_version manifest.
- Moved activation: from tool activeVersionHash → profile_version manifest (snapshot purity).
- Simplified branching (auto-select).
- Simplified rules model.

---

Let me know any adjustments or green-light a next action (doc patch or migration code). I’ll proceed immediately once you choose.
