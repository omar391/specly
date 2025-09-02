Integrating your Iter 0–3 evolution plus the latest feedback to converge on a “final” architecture doc; below you’ll find (1) a feedback checklist with critical evaluation, (2) decisions & trade‑offs, (3) the refined model (statuses, schema, execution algorithm), (4) an updated API, and (5) a clean replacement doc you can drop in (suggested new filename: `docs/specly-architecture.md`). I call out any remaining decision points explicitly.

## 1. Feedback → Evaluation Checklist

1. Add `queued` task status  
   - Evaluation: Valid for a workflow engine; enables future scheduling / dependency resolution. Low cost, forward-compatible. Adopt.

2. Blockers: “Self-referential M:N is sufficient; avoid extra complexity”  
   - Observation: A self-referential M:N is inherently a separate join table (e.g., `task_dependencies`). The question is whether to also store a redundant `blocked_reason`.  
   - Decision: Keep minimal join table `task_dependencies (task_id, depends_on_task_id, created_at)`; derive `blocked` automatically; keep optional inline `blocked_reason` for manual override/explanatory text (nullable). Avoid a second model.

3. Transient vs persistent deletion: Hard delete transient; soft delete persistent  
   - Evaluation: Reasonable. Soft delete adds small column cost (`deleted_at`). Needed for audit/resume plus future analytics. Adopt soft delete for tasks (and sessions if linked) with `deleted_at`. Transient sessions (no task) can be hard deleted immediately after GC window (24h). Provide optional config for GC horizon; default 24h.

4. Transition selection purely server-side using transition table (condition_type + value + priority)  
   - Evaluation: This matches workflow engines (n8n, Airflow branching). Fully consistent with removing `next_spec_hash`. Adopt deterministic selection algorithm: filter transitions; rank by (specificity > priority > creation order). (Define specificity: result_code > expression > always.)

5. Remove `session_id` from execute API (rely on `task_id`)  
   - Critique: Works only after a task exists; breaks ephemeral exploratory flows (e.g., brainstorming before creating a task). Without `session_id`, transient multi-step interactions cannot be resumed.  
   - Options:  
     A) Keep `session_id` optional (current) → supports transient sessions.  
     B) Require always a task first (enforce early task creation) → simplifies API but forces a task for mere brainstorming.  
     C) Introduce `ephemeral_token` distinct from internal PK (safer to expose).  
   - Recommendation: Keep `session_id` (Option A) for MVP flexibility; we can later alias it to a short opaque token. If you strongly prefer removal, we must also introduce a “create_task” gating step. (Awaiting your confirmation if you want to override.)

6. Snapshot-only tool/profile versioning  
   - Agreed: Adopt; removes ambiguity. Tools become timeless identities; profile version manifest decides which tool_version is active. No `active_version_hash` column.

7. Status renames: `waiting_for_human` → `awaiting_input`; `idle` → `paused`  
   - Evaluation: `awaiting_input` is broader (human or LLM). `paused` semantically clearer than `idle`. Adopt renames.  
   - Final task statuses: `queued`, `in_progress`, `awaiting_input`, `blocked`, `paused`, `completed`, `failed`, (optional later: `canceled`).  
   - Session statuses: retain `active`, `paused` (rename from idle). (A session doesn’t complete; task completion implicitly finalizes session.)

8. Enforce alias uniqueness at DB level (profile version scoped)  
   - Conflict: Current plan stores alias inside `profile_version.manifest` (a JSON blob), which cannot have a native unique constraint.  
   - Options:  
     A) Introduce `profile_version_tools` table with columns `(profile_version_id, tool_name, tool_version_hash, command_alias)` and unique index `(profile_version_id, command_alias)` → enforces constraint in SQL.  
     B) Keep JSON manifest; validate uniqueness in application code (risk of race).  
   - Recommendation: Use table (A) for correctness & queryability; manifest can be reconstructed or omitted. Adopt table; drop alias from JSON or keep JSON as denormalized cache (optional). Decision: implement table; keep manifest optional or remove.

9. “Execute with task_id linked to different profile version” impossible due to separate DBs  
   - Analysis: Tasks are workspace-local; profile versions are global (or global+workspace mapping). A workspace can upgrade its bound profile version after tasks were created. A pre-upgrade task is pinned to older profile version. So mismatch can occur intentionally (legacy tasks).  
   - Design: Each task stores `profile_version_id` at creation. Executions ensure workspace’s current profile version is either the same OR a compatibility rule decides behavior (e.g., continue under pinned version).  
   - Decision: Add `profile_version_id` on `tasks`. On workspace upgrade, existing tasks continue pinned unless explicitly migrated.

10. Keep `blocked_reason` inline  
    - Adopt (plus dependency set for automatic blocked detection).

## 2. Updated Domain Decisions

Accepted changes: task statuses (with `queued`), server-driven routing, self-referential dependency table, soft delete for persistent tasks, snapshot-only model, alias uniqueness via join table, tasks pinned to profile version, session_id retained (pending your override).

Open (need your explicit choice):
- Do you want to drop `session_id` entirely (forcing task-first) or keep? (Default: keep for transient flows.)
- Keep or drop JSON manifest after normalizing to relational `profile_version_tools`? (Default: drop manifest to avoid duplication; can regenerate from relations.)

## 3. Refined Data Model (Final Draft)

### Entities

specs (immutable hashed – unchanged from Iter 3 except consistent snake_case)
tool_versions
tools
profiles
profile_versions
profile_version_tools (NEW for alias & version binding + uniqueness)
workspace_profile_versions (workspace pinned to a profile_version)
tasks
task_dependencies (self-referential M:N)
sessions
action_journal
workspace_rules

### Key Columns (adjusted)

tasks:
- status ENUM('queued','in_progress','awaiting_input','blocked','paused','completed','failed')
- profile_version_id (FK) (pinned)
- blocked_reason TEXT NULL
- deleted_at TIMESTAMP NULL (soft delete)

sessions:
- status ENUM('active','paused')
- deleted_at TIMESTAMP NULL (persistent only; ephemeral hard delete)
- task_id NULL (transient if null)
- last_active_at

profile_version_tools:
- id PK
- profile_version_id FK
- tool_name FK
- tool_version_hash FK
- command_alias TEXT
- UNIQUE(profile_version_id, command_alias)
- UNIQUE(profile_version_id, tool_name)

task_dependencies:
- task_id FK
- depends_on_task_id FK
- UNIQUE(task_id, depends_on_task_id)

workspace_rules:
- UNIQUE(workspace_id, relation, rule)

## 4. Transition Evaluation Algorithm (Server-Side)

Given current spec `S` and transitions T where `from = S`:
1. Evaluate all transitions; mark each as `valid`:
   - condition_type = 'result_code' → valid if executor.result_code === condition_value
   - condition_type = 'expression' → evaluate expression safely (future) returns truthy
   - condition_type = 'always' → always valid
2. Partition valid transitions by condition_type specificity ranking: result_code > expression > always
3. From highest specificity non-empty bucket, pick transition with lowest numeric `priority` (default priority=100 if null); tie-break by insertion order (row id).
4. Next spec = transition.to_spec_hash. If none valid → task fails with diagnostic (guard against dead-end).
5. If selected spec.intent='human' → task.status='awaiting_input' & session.status='paused'. Else task.status='in_progress'.

## 5. Status Transitions (Task + Session)

| Trigger | Task Status | Session Status |
|---------|-------------|----------------|
| Task created, dependencies unmet | queued OR blocked | paused |
| Dependencies satisfied & auto-start | in_progress | active |
| Human spec reached (no args yet) | awaiting_input | paused (human_blocking=true) |
| Human input provided | in_progress | active |
| Manual pause | paused | paused |
| Dependency becomes unmet mid-flight | blocked | paused |
| All specs complete | completed | paused |
| Executor fatal failure (non-retryable) | failed | paused |
| Retryable error (attempt < max) | in_progress | active (after backoff) |

Session doesn’t own completion semantics; task completion is authoritative.

## 6. Execute API (Refined)

Endpoint: POST `/api/tools/:tool/execute`

Request body:
```
{
  "task_id": number | null,
  "session_id": number | null,      // OPTIONAL (see discussion)
  "client_state_id": string | null,
  "force_start": boolean | null,
  "args": object | null
}
```

Server logic precedence:
- If `task_id` present → identify (or create if first call) session pinned to task.
- Else if `session_id` present → resume transient session.
- Else → create new transient session (return session_id).
- Validate `client_state_id`; if mismatch & no `force_start` → 409.
- Determine progression (may request args if human input needed).

If you opt to remove `session_id`: we must forbid transient sessions or auto-create a hidden task (e.g., “scratchpad”). That adds hidden complexity. Keeping `session_id` is cleaner.

## 7. Updated API Surface (Minimal Relational Snapshot Model)

Profiles & Tools
- POST /api/specs
- POST /api/tools
- POST /api/tools/:tool/versions
- POST /api/profiles
- POST /api/profiles/:profile/versions (body: array of { tool_name, tool_version_hash, command_alias })
- POST /api/profiles/:profile/versions/:version/publish (sets profile.active_version_id)
- POST /api/workspaces/:id/profile/upgrade (bind to profile.active_version_id)
- GET /api/workspaces/:id/profile (shows current profile_version & tools)

Execution & Tasks
- POST /api/tasks (body: { title, description, tool_name, client_state_id? } → creates task in `queued` or `in_progress` depending on dependencies)
- PATCH /api/tasks/:id/status (allowed transitions with validation)
- POST /api/tools/:tool/execute (progress)
- GET /api/tasks/:id
- GET /api/sessions?workspace_id=&task_id? (for debugging; includes transient if requested)
- DELETE /api/sessions/:id (transient only; persistent sessions implicitly tied to task lifecycle)
- POST /api/tasks/:id/dependencies (body: { depends_on: number[] })
- DELETE /api/tasks/:id/dependencies/:depends_on

Rules
- POST /api/rules (upsert)
- GET /api/rules?workspace_id=

(You can add pagination & filters later.)

## 8. Schema Sketch (Drizzle Pseudocode)

````ts
// Note: Omit runtime counters initially; add as needed.

export const specs = sqliteTable('specs', {
  hash: text('hash').primaryKey(),
  executorType: text('executor_type').notNull(),
  executorVersion: text('executor_version').notNull(),
  intent: text('intent', { enum: ['human','autonomous'] }).notNull(),
  sideEffect: integer('side_effect',{ mode:'boolean'}).notNull(),
  contentTemplate: text('content_template'),
  staticParams: blob('static_params',{ mode:'json'}).notNull(),
  inputSchema: blob('input_schema',{ mode:'json'}),
  outputSchema: blob('output_schema',{ mode:'json'}),
  idempotencyKeyTemplate: text('idempotency_key_template'),
  retryPolicy: blob('retry_policy',{ mode:'json'}),
  showOutput: integer('show_output',{ mode:'boolean'}).notNull().default(false),
  security: blob('security',{ mode:'json'}),
  metadata: blob('metadata',{ mode:'json'}).notNull(),
  createdAt: integer('created_at',{ mode:'timestamp_ms'}).notNull()
});

export const tools = sqliteTable('tools', {
  name: text('name').primaryKey(),
  description: text('description'),
  createdAt: integer('created_at',{ mode:'timestamp_ms'}).notNull()
});

export const toolVersions = sqliteTable('tool_versions', {
  hash: text('hash').primaryKey(),
  toolName: text('tool_name').notNull().references(()=>tools.name),
  graphManifest: blob('graph_manifest',{ mode:'json'}).notNull(),
  createdAt: integer('created_at',{ mode:'timestamp_ms'}).notNull()
  // Add index(tool_name)
});

export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  activeVersionId: integer('active_version_id'),
  createdAt: integer('created_at',{ mode:'timestamp_ms'}).notNull()
});

export const profileVersions = sqliteTable('profile_versions', {
  id: integer('id').primaryKey(),
  profileId: integer('profile_id').notNull().references(()=>profiles.id),
  versionNumber: integer('version_number').notNull(),
  createdAt: integer('created_at',{ mode:'timestamp_ms'}).notNull(),
});
export const profileVersionTools = sqliteTable('profile_version_tools', {
  id: integer('id').primaryKey(),
  profileVersionId: integer('profile_version_id').notNull().references(()=>profileVersions.id),
  toolName: text('tool_name').notNull().references(()=>tools.name),
  toolVersionHash: text('tool_version_hash').notNull().references(()=>toolVersions.hash),
  commandAlias: text('command_alias').notNull(),
  createdAt: integer('created_at',{ mode:'timestamp_ms'}).notNull()
}, (t) => ({
  uniqTool: uniqueIndex('pvt_tool_uq').on(t.profileVersionId, t.toolName),
  uniqAlias: uniqueIndex('pvt_alias_uq').on(t.profileVersionId, t.commandAlias)
}));

export const workspaceProfileVersions = sqliteTable('workspace_profile_versions', {
  workspaceId: integer('workspace_id').notNull(),
  profileVersionId: integer('profile_version_id').notNull().references(()=>profileVersions.id),
  pinnedAt: integer('pinned_at',{ mode:'timestamp_ms'}).notNull()
  // If you want history keep multiple rows; else make workspaceId PK
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey(),
  workspaceId: integer('workspace_id').notNull(),
  profileVersionId: integer('profile_version_id').notNull().references(()=>profileVersions.id),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status',{ enum:['queued','in_progress','awaiting_input','blocked','paused','completed','failed']}).notNull(),
  sessionId: integer('session_id'),
  blockedReason: text('blocked_reason'),
  deletedAt: integer('deleted_at',{ mode:'timestamp_ms'}),
  createdAt: integer('created_at',{ mode:'timestamp_ms'}).notNull(),
  updatedAt: integer('updated_at',{ mode:'timestamp_ms'}).notNull()
});

export const taskDependencies = sqliteTable('task_dependencies', {
  taskId: integer('task_id').notNull().references(()=>tasks.id),
  dependsOnTaskId: integer('depends_on_task_id').notNull().references(()=>tasks.id),
  createdAt: integer('created_at',{ mode:'timestamp_ms'}).notNull()
}, (t)=>({
  uniqDep: uniqueIndex('task_dep_uq').on(t.taskId, t.dependsOnTaskId)
}));

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey(),
  workspaceId: integer('workspace_id').notNull(),
  toolName: text('tool_name').notNull().references(()=>tools.name),
  currentSpecHash: text('current_spec_hash').notNull().references(()=>specs.hash),
  status: text('status',{ enum:['active','paused']}).notNull(),
  clientStateId: text('client_state_id'),
  lastActiveAt: integer('last_active_at',{ mode:'timestamp_ms'}).notNull(),
  startedAt: integer('started_at',{ mode:'timestamp_ms'}).notNull(),
  context: blob('context',{ mode:'json'}).notNull(),
  lastResultCode: text('last_result_code'),
  taskId: integer('task_id'),
  humanBlocking: integer('human_blocking',{ mode:'boolean'}).notNull().default(false),
  idleTimeoutMs: integer('idle_timeout_ms').notNull().default(300000),
  deletedAt: integer('deleted_at',{ mode:'timestamp_ms'})
  // GC: where taskId IS NULL and lastActiveAt < now - interval
});

export const actionJournal = sqliteTable('action_journal', {
  id: integer('id').primaryKey(),
  sessionId: integer('session_id').notNull().references(()=>sessions.id),
  specHash: text('spec_hash').notNull().references(()=>specs.hash),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status',{ enum:['pending','success','failed']}).notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastErrorCode: text('last_error_code'),
  resultJson: blob('result_json',{ mode:'json'}),
  errorJson: blob('error_json',{ mode:'json'}),
  startedAt: integer('started_at',{ mode:'timestamp_ms'}),
  completedAt: integer('completed_at',{ mode:'timestamp_ms'})
}, (t)=>({
  uniqAction: uniqueIndex('action_journal_idem_uq').on(t.specHash, t.sessionId, t.idempotencyKey)
}));

export const workspaceRules = sqliteTable('workspace_rules', {
  id: integer('id').primaryKey(),
  workspaceId: integer('workspace_id').notNull(),
  relation: text('relation',{ enum:['always-do','never-do','is-a','has-a']}).notNull(),
  rule: text('rule').notNull(),
  originalText: text('original_text'),
  confidence: real('confidence').notNull(),
  sourceSessionId: integer('source_session_id'),
  createdAt: integer('created_at',{ mode:'timestamp_ms'}).notNull(),
  lastReinforcedAt: integer('last_reinforced_at',{ mode:'timestamp_ms'}),
  active: integer('active',{ mode:'boolean'}).notNull().default(true)
}, (t)=>({
  uniqRule: uniqueIndex('workspace_rule_uq').on(t.workspaceId, t.relation, t.rule)
}));
````

## 9. Deterministic Execution Summary

1. Identify context (task or session).
2. If task in `queued` and dependencies resolved → promote to `in_progress`.
3. Load current spec.
4. If spec.intent='human' & no args → respond prompt (task→`awaiting_input`, session→`paused`).
5. Validate args (input_schema). Execute:
   - Side-effect journaling + idempotency key.
   - Retry policy enforcement.
6. Merge outputs, compute result_code.
7. Route via transitions algorithm.
8. Update statuses (`completed` vs next progression).
9. Emit response (no client-driven step change).

## 10. Final Replacement Architecture Doc

Below is the proposed consolidated document you can save as `docs/specly-architecture.md` (superseding `brainstorm.md` & incoming iterations).

````markdown
# Specly Architecture (Finalized Core Model)

## 1. Purpose
Specly is an MCP server delivering deterministic, multi-step “spec” workflows to AI assistants. Each tool invocation progresses through an immutable graph of spec nodes (prompt or autonomous action). Content-addressed hashing guarantees reproducibility; server-side routing ensures the client never dictates control flow.

## 2. Core Abstractions
- Spec: Atomic immutable execution unit (prompt or action) with canonical hash.
- Tool Version: DAG of spec hashes (ordered + edges) hashed deterministically.
- Tool: Named identity referencing many versions historically (no mutable in-place version).
- Profile Version: Snapshot mapping of (tool → tool_version_hash + command_alias) establishing a coherent toolset.
- Workspace Binding: A workspace pins to a specific profile version; tasks inherit that version.
- Task: User-visible unit of work with lifecycle and optional dependencies.
- Session: Execution context for a tool run (transient until attached to a task).
- Action Journal: Side-effect idempotency + retry tracking.
- Workspace Rules: Accumulated preference/constraint facts influencing prompt generation.

## 3. Hashing & Determinism
Spec hash = SHA-256 of canonical JSON of immutable fields (normalized templates, sorted keys, stripped nulls). Tool version hash = SHA-256 of { tool_name, ordered_specs[], sorted_edges[] }. No runtime metadata influences hashes.

## 4. Status Model
Task statuses: queued | in_progress | awaiting_input | blocked | paused | completed | failed  
Session statuses: active | paused  
A session never “completes” independently; task completion renders session inactive (paused).

## 5. Routing & Transitions
Transitions table logic distilled into in-memory evaluation:
1. Collect candidate edges for current spec.
2. Evaluate by specificity: result_code > expression > always.
3. Select minimal priority among highest specificity bucket (tie-break by creation order).
4. If no candidate → fail task (diagnostic).
No client-provided next step. Future extension: optional “selection_token” for LLM choice (not required now).

## 6. Idempotent Side Effects
Action specs (`side_effect=true`) require idempotency key:
- Provided template → rendered with context
- Else executor natural key (if provided)
- Else composite fallback (spec_hash + session_id)
Action journal ensures safe retries and replay immunity.

## 7. Dependency Management
`task_dependencies (task_id, depends_on_task_id)` forms a self-referential M:N.  
Task is `blocked` if any dependency not in (completed, failed, canceled) OR if manual `blocked_reason` set.

## 8. Rules (Preferences)
Workspace rules: relation + rule text with confidence. Reinforcement increments confidence; deactivation toggles `active=false`. Inject top-N rules (by confidence & recency) into prompt specs’ context.

## 9. Execution Flow
1. Identify or create session (task-bound or transient).
2. Promote task from queued → in_progress if dependencies resolved.
3. If spec.intent=human & args missing → emit rendered template; set awaiting_input/paused.
4. Else execute spec:
   - Validate args
   - Journal side effects
   - Run executor (exact version pin)
   - Merge output, derive result_code
5. Route to next spec or finalize (completed/failed).
6. Respond with current content & derived state (no next-step ID selection required).

## 10. API (Initial Set)
- POST /api/specs
- POST /api/tools
- POST /api/tools/:tool/versions
- POST /api/profiles
- POST /api/profiles/:profile/versions
- POST /api/profiles/:profile/versions/:version/publish
- POST /api/workspaces/:id/profile/upgrade
- POST /api/tasks
- PATCH /api/tasks/:id/status
- POST /api/tasks/:id/dependencies
- DELETE /api/tasks/:id/dependencies/:depends_on
- POST /api/tools/:tool/execute
- GET /api/tasks/:id
- GET /api/sessions?workspace_id=&task_id?
- POST /api/rules
- GET /api/rules?workspace_id=

## 11. Schema Overview (See schema sketch file for Drizzle pseudo)
Core tables: specs, tool_versions, tools, profiles, profile_versions, profile_version_tools, workspace_profile_versions, tasks, task_dependencies, sessions, action_journal, workspace_rules.

## 12. Security & Executors
Executors are version-pinned modules (builtin or external `specly-executor-*`) providing input/output schemas and security constraints. Future isolation via worker threads / policy sandbox.

## 13. Soft Delete & GC
- Persistent tasks/sessions: soft delete via `deleted_at`.
- Transient sessions (no task_id): hard GC after >24h inactivity.
- Optional retention tuning later.

## 14. Observability (Future)
Add metrics counters (executions, retries, failures) & spec lineage (metadata.supersedes) later without hash impact.

## 15. Extensibility Notes
- Expression transitions introduced later; start with result_code + always.
- Branch choice UI: add `selection_token` pathway if assistant autonomy becomes desirable.
- Task migration on profile upgrade: explicit endpoint (future) to rebase tool_version (generates new session path if mid-flow).

## 16. Open Optional Enhancements (Deferred)
- Canceled status
- Rule subject extraction / embeddings
- Selection tokens for branching
- Executor sandbox hardening
- Spec lineage visualization

## 17. Rationale Summary
- Snapshot immutability prevents hidden drift.
- Server-owned routing eliminates client desync.
- Task/profile pinning ensures reproducible continuations post-upgrade.
- Minimal relational tables (one join for profile_version_tools, one for dependencies) balance integrity & simplicity.

````

## 11. Diff Summary vs Iteration 3

| Aspect | Iter 3 | Final |
|--------|--------|-------|
| Task statuses | no queued, different names | Added queued; renamed waiting_for_human→awaiting_input; idle→paused |
| Alias uniqueness | Manifest JSON (app logic) | Enforced via `profile_version_tools` table unique index |
| session_id usage | Present but maybe optional | Kept (pending your confirmation) for transient multi-step workflows |
| Branching | Multiple strategies listed | Fixed deterministic server routing; removed next_spec_hash |
| Dependencies | Optional blockers or reason | Self-referential join + optional blocked_reason |
| Task pinning | Implicit | Explicit `profile_version_id` on tasks |
| Soft delete | Not finalized | Adopted for persistent tasks/sessions |
| Manifest | JSON only | Normalized relational; manifest optional/derivable |

## 12. Remaining Decision Prompts (Please reply with choices)

1. Keep `session_id` in execute API? (Recommend: YES for transient flows.)  
2. Keep JSON manifest alongside `profile_version_tools` (cache) or drop? (Recommend: DROP initially to avoid duplication.)  
3. Include `canceled` status now or later? (Recommend: Defer.)  

Provide your answers (e.g., “1: yes, 2: drop, 3: defer”) and I’ll then produce migration stubs + hashing utility next.

---

Let me know your decisions and I’ll move straight into generating the migration + utility code.