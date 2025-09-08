# Specly Migration Roadmap

This roadmap defines a direct (non‑backwards‑compatible) replacement of the legacy ToolFlow / FeedbackStep engine with the Specly architecture. No shadow / dual execution: legacy code and tables are dropped in the same migration sequence. Provides: domain model, schema, algorithms, pseudocode, API, risks, validation. Cross‑refs: `docs/file_changes.md`, `docs/file_changes_ui.md`, unified tasks in `docs/task.md`.

## 1. Target Domain Model (Authoritative)

### 1.1 Core Entities
| Entity | Purpose | Key Immutability Rules |
|--------|---------|------------------------|
| Spec | Immutable instruction template + executor metadata | Hash changes on any canonical field change |
| ToolVersion | Immutable DAG snapshot (ordered specs + edges) | Hash changes on spec list or any edge detail |
| Tool | Stable identity (name + description + optional command alias) | No mutable pointer to version in pure snapshot model |
| Profile | Logical grouping of tools (supports inheritance) | Parent chain linear only |
| ProfileVersion | Flattened snapshot of tool → tool_version mapping (with aliases) | Immutable after creation |
| ProfileVersionTool | Row per tool in a profile_version (optionally inherited) | Records `inherited_from_profile_version_id` |
| Workspace | Bound to single profile_version at a time | Upgrade explicit; tasks pinned to version at creation |
| Task | User-visible work unit | Status transitions deterministic per engine |
| TaskDependency | M:N self deps for tasks | Unique per pair |
| Session | Execution context (transient or task-bound) | Idle/active state only |
| ActionJournal | Idempotency + side effect ledger | Unique (spec_hash, session_id, idempotency_key) |
| WorkspaceRule | Preference / constraint fact | Unique (workspace_id, relation, rule) |

### 1.2 Status Enums
Task: `queued | in_progress | awaiting_input | blocked | paused | completed | failed`
Session: `active | idle`

### 1.3 Hash Canonicalization
Spec hash = SHA-256 of canonical JSON of immutable fields:
```
{
  executor_type,
  executor_version,
  intent,
  side_effect,
  content_template,
  static_params,
  input_schema,
  output_schema,
  idempotency_key_template,
  retry_policy,
  show_output,
  security,
  metadata
}
```
Normalization: remove null/undefined keys; recursively sort keys; CRLF→LF; trim trailing spaces; collapse >2 blank lines to 2.
ToolVersion hash = SHA-256(JSON.stringify({
  tool: tool_name,
  ordered_specs: [spec_hash...],
  edges: sortedEdges
})) with sortedEdges sorted by `(from,to,condition_type,(condition_value||''), priority||0)`.

### 1.4 Profile Inheritance Flatten Algorithm
Given parent profile_version P (or none) and request (tools_add_or_override[], remove[] optional):
1. Start map M = {}.
2. If parent: load all parent profile_version_tools rows; for each: M[tool_name] = (tool_version_hash, alias, source_pv_id=parent_id_of_row_or_that_row).
3. For each name in remove[]: delete M[name].
4. For each addition/override: M[tool_name] = (tool_version_hash, alias, source_pv_id=null).
5. Persist new profile_version; for each entry in M insert profile_version_tools row setting `inherited_from_profile_version_id` to source_pv_id if not null.
Complexity: O(N) where N number of tools in parent chain.

## 2. New Database Schema (Drizzle / SQLite)

### 2.1 Global DB Additions
```ts
export const specs = sqliteTable('specs', {
  hash: text('hash').primaryKey(),
  executorType: text('executor_type').notNull(),
  executorVersion: text('executor_version').notNull(),
  intent: text('intent', { enum: ['human','autonomous'] }).notNull(),
  sideEffect: integer('side_effect', { mode: 'boolean' }).default(false),
  contentTemplate: text('content_template'),
  staticParams: text('static_params', { mode:'json' }).default({}),
  inputSchema: text('input_schema', { mode:'json' }),
  outputSchema: text('output_schema', { mode:'json' }),
  idempotencyKeyTemplate: text('idempotency_key_template'),
  retryPolicy: text('retry_policy', { mode:'json' }),
  showOutput: integer('show_output', { mode:'boolean' }).default(true),
  security: text('security', { mode:'json' }),
  metadata: text('metadata', { mode:'json' }).default({}),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

export const toolVersions = sqliteTable('tool_versions', {
  hash: text('hash').primaryKey(),
  toolName: text('tool_name').notNull(),
  graphManifest: text('graph_manifest', { mode:'json' }).notNull(), // {ordered_specs:[], edges:[], entry_spec}
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

export const tools = sqliteTable('tools', {
  name: text('name').primaryKey(),
  commandAlias: text('command_alias').unique(),
  description: text('description'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  parentProfileId: text('parent_profile_id').references(() => profiles.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

export const profileVersions = sqliteTable('profile_versions', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete:'cascade' }),
  parentProfileVersionId: text('parent_profile_version_id').references(() => profileVersions.id),
  version: integer('version').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

export const profileVersionTools = sqliteTable('profile_version_tools', {
  id: text('id').primaryKey(),
  profileVersionId: text('profile_version_id').notNull().references(() => profileVersions.id, { onDelete:'cascade' }),
  toolName: text('tool_name').notNull().references(() => tools.name, { onDelete:'cascade' }),
  toolVersionHash: text('tool_version_hash').notNull().references(() => toolVersions.hash, { onDelete:'cascade' }),
  commandAlias: text('command_alias'),
  inheritedFromProfileVersionId: text('inherited_from_profile_version_id').references(() => profileVersions.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
}, (t) => ({
  uniqueTool: uniqueIndex('ux_pvt_tool').on(t.profileVersionId, t.toolName),
  uniqueAlias: uniqueIndex('ux_pvt_alias').on(t.profileVersionId, t.commandAlias)
}));

export const workspaceProfileVersions = sqliteTable('workspace_profile_versions', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete:'cascade' }).primaryKey(),
  profileVersionId: text('profile_version_id').notNull().references(() => profileVersions.id),
  pinnedAt: text('pinned_at').default(sql`CURRENT_TIMESTAMP`)
});

export const actionJournal = sqliteTable('action_journal', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  specHash: text('spec_hash').notNull().references(() => specs.hash, { onDelete:'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status', { enum:['pending','success','failed'] }).notNull(),
  attempts: integer('attempts').default(0),
  lastErrorCode: text('last_error_code'),
  resultJson: text('result_json', { mode:'json' }),
  errorJson: text('error_json', { mode:'json' }),
  startedAt: text('started_at').default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at')
}, (t) => ({
  uxIdem: uniqueIndex('ux_action_journal_idem').on(t.specHash, t.sessionId, t.idempotencyKey)
}));

export const workspaceRulesNew = sqliteTable('workspace_rules', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete:'cascade' }),
  relation: text('relation', { enum:['always-do','never-do','is-a','has-a'] }).notNull(),
  rule: text('rule').notNull(),
  originalText: text('original_text'),
  confidence: integer('confidence').default(1),
  sourceSessionId: text('source_session_id'),
  active: integer('active', { mode:'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  lastReinforcedAt: text('last_reinforced_at')
}, (t) => ({
  uxWorkspaceRule: uniqueIndex('ux_workspace_rule').on(t.workspaceId, t.relation, t.rule)
}));
```

### 2.2 Workspace DB Changes
Replace `tasks` table; introduce `task_dependencies`; reuse `sessions` with added columns.
```ts
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum:['queued','in_progress','awaiting_input','blocked','paused','completed','failed'] }).default('queued'),
  priority: text('priority', { enum:['high','medium','low'] }).default('medium'),
  progress: integer('progress').default(0),
  notes: text('notes'),
  profileVersionId: text('profile_version_id'),
  blockedReason: text('blocked_reason'),
  assets: text('assets', { mode:'json' }).default([]),
  externalReferences: text('external_references', { mode:'json' }).default([]),
  metadata: text('metadata', { mode:'json' }).default({}),
  tags: text('tags', { mode:'json' }).default([]),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at')
});

export const taskDependencies = sqliteTable('task_dependencies', {
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete:'cascade' }),
  dependsOnTaskId: text('depends_on_task_id').notNull().references(() => tasks.id, { onDelete:'cascade' })
}, (t) => ({
  uxTaskDep: uniqueIndex('ux_task_dep').on(t.taskId, t.dependsOnTaskId)
}));

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  taskId: text('task_id').references(() => tasks.id, { onDelete:'set null' }),
  profileVersionId: text('profile_version_id'),
  currentSpecHash: text('current_spec_hash'),
  status: text('status', { enum:['active','idle'] }).default('active'),
  clientStateId: text('client_state_id'),
  lastActiveAt: text('last_active_at').default(sql`CURRENT_TIMESTAMP`),
  context: text('context', { mode:'json' }).default({}),
  lastResultCode: text('last_result_code'),
  humanBlocking: integer('human_blocking', { mode:'boolean' }).default(false),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});
```

### 2.3 Legacy Coexistence Strategy
None. Migration script creates new tables, migrates (transforms) required seed data and then drops legacy tables immediately. There is no dual-write period.

## 3. Execution Engine (SpecEngine) Pseudocode
```ts
class SpecEngine {
  constructor(repos, clock, logger) {}

  async execute({ toolName, taskId, sessionId, clientStateId, forceStart, args }): Promise<ExecuteResult> {
    // 1. Resolve session
    let session = await this.loadOrCreateSession({ toolName, taskId, sessionId, clientStateId, forceStart });

    // 2. Load tool version via session.profileVersionId → profileVersionTools → toolVersionHash
    const toolVersion = await repos.toolVersions.getActiveForSession(session, toolName);
    const graph = toolVersion.graphManifest; // {ordered_specs, edges, entry_spec}

    // 3. Determine current spec
    if (!session.currentSpecHash) {
      session.currentSpecHash = graph.entry_spec;
      await repos.sessions.save(session);
    }
    const spec = await repos.specs.get(session.currentSpecHash);

    // 4. If spec.intent === 'human' && args empty → enter awaiting_input
    if (spec.intent === 'human' && (args == null || Object.keys(args).length === 0)) {
      session.status = 'idle';
      await this.persistAwaitingInput(session, taskId);
      return this.renderHumanPrompt(spec, session);
    }

    // 5. Validate input_schema
    validateArgs(spec.inputSchema, args);

    // 6. If spec.sideEffect => idempotency check
    const idemKey = computeIdemKey(spec, args, session);
    let journal = await repos.actionJournal.find(spec.hash, session.id, idemKey);
    if (!journal) journal = await repos.actionJournal.createPending(...);
    if (journal.status === 'success') return reuseSuccess(journal, session);

    // 7. Execute via executor registry
    const executor = this.registry.get(spec.executorType, spec.executorVersion);
    const execResult = await executor.run({ spec, args, context: session.context });

    // 8. Validate output_schema & merge context
    validateOutput(spec.outputSchema, execResult.output);
    session.context = merge(session.context, execResult.contextDelta);
    session.lastResultCode = execResult.resultCode || 'ok';

    // 9. Update journal
    updateJournal(journal, execResult);

    // 10. Route to next spec
    const next = selectNextEdge(graph.edges, spec.hash, session.lastResultCode);
    if (!next) {
       markTaskCompleted(taskId); session.status='idle';
       await repos.sessions.save(session);
       return finalResponse(spec, session, execResult);
    }
    session.currentSpecHash = next.to;
    session.status='active';
    await repos.sessions.save(session);

    return buildStepResponse(spec, session, execResult);
  }
}
```

### Edge Selection
```
function selectNextEdge(edges, fromHash, resultCode) {
  const candidates = edges.filter(e => e.from === fromHash);
  const bySpecificity = partition(candidates, e => e.condition_type === 'result_code' && e.condition_value === resultCode,
                                           e => e.condition_type === 'always');
  const bucket = firstNonEmpty(bySpecificity);
  if (!bucket) return null;
  return bucket.sort((a,b) => (a.priority ?? 100) - (b.priority ?? 100) || a._insertion - b._insertion)[0];
}
```

### Profile Version Creation Pseudocode
```ts
async function createProfileVersion({ profileId, parentProfileVersionId, additions, removals }) {
  const version = await nextVersionNumber(profileId);
  const pvId = uuid();
  const flattened = new Map();
  if (parentProfileVersionId) {
    const parentRows = await repo.profileVersionTools.list(parentProfileVersionId);
    for (const r of parentRows) flattened.set(r.toolName, { ...r, inheritedFrom: r.inheritedFromProfileVersionId || parentProfileVersionId });
  }
  for (const name of removals || []) flattened.delete(name);
  for (const add of additions) flattened.set(add.toolName, { toolVersionHash: add.toolVersionHash, commandAlias: add.commandAlias, inheritedFrom: null });
  await repo.profileVersions.insert({ id: pvId, profileId, parentProfileVersionId, version });
  for (const [toolName, row] of flattened) {
    await repo.profileVersionTools.insert({ profileVersionId: pvId, toolName, toolVersionHash: row.toolVersionHash, commandAlias: row.commandAlias, inheritedFromProfileVersionId: row.inheritedFrom });
  }
  return pvId;
}
```

## 4. API Contract (New / Updated)
| Method | Path | Purpose | Notes |
|--------|------|---------|-------|
| POST | /api/specs | Create (idempotent by hash) spec | Returns spec hash |
| POST | /api/tools/:tool/versions | Publish tool version (body: ordered_specs[], edges[], entry_spec) | Returns tool_version hash |
| GET | /api/tools/:tool/graph | Fetch active graph per workspace profile binding | workspace->profile_version->tool_version |
| POST | /api/profile-versions | Create child/root profile version | additions/removals payload |
| POST | /api/workspaces/:id/upgrade-profile | Bind newer profile version | returns new binding |
| POST | /api/tools/:tool/execute | Unified execute | Body: { task_id?, session_id?, client_state_id?, force_start?, args? } |
| POST | /api/tasks/:id/dependencies | Add dependency | Body: { depends_on } |
| DELETE | /api/tasks/:id/dependencies/:depId | Remove dependency |  |
| PATCH | /api/tasks/:id/delete | Soft delete task | sets deleted_at |

## 5. Migration Execution Order (Compressed Direct Cutover)
| Step | Goal | Key Actions | Success Criteria |
|------|------|------------|------------------|
| 1 | Schema creation | Create new Specly tables; drop legacy after verification snapshot | New tables exist; legacy tables absent |
| 2 | Seed base data | Convert legacy flow definitions in-memory → specs & tool versions; insert root profile/version; bind workspaces | Counts match expectations; no legacy queries needed |
| 3 | Implement SpecEngine & Validator | Add engine + repositories + hashing utilities + pre-persist graph validator (single entry, no cycles, no unreachable, priority normalization) | Unit tests pass (hash, routing, validation: cycle, unreachable, multi-entry) |
| 4 | Replace execution path | Wire API / CLI to SpecEngine; remove ToolFlowExecutor imports | All tests use new engine only |
| 5 | Profile inheritance | Implement create child profile versions + upgrading | Inheritance tests green |
| 6 | Side effects & idempotency | Add action journal enforcement & retry policies | Journal tests green |
| 7 | Ops hardening | Add GC, purge, metrics | Observability metrics emitting |
| 8 | UI alignment | Ship UI pages tied to new endpoints (specs/tools/profiles/sessions) | UI e2e smoke passes |

## 6. Background Jobs
| Job | Schedule | Function |
|-----|----------|----------|
| Transient Session GC | hourly | Delete sessions with task_id null & last_active_at < now - 24h |
| Soft Delete Purge | daily | Hard delete tasks/sessions with deleted_at < now - 90d |
| Action Journal Retry | every 5m | Re-run failed side_effect specs if retry policy permits |

## 7. Risk & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Hash drift due to normalization bug | Duplicate specs or incorrect reuse | Unit tests with golden vectors; freeze normalization util |
| Partial cutover divergence | Inconsistent task states | Dual execution diff logger Phase 2 |
| Inheritance chain loops | Infinite traversal | DB CHECK or code guard rejecting cycle on insert |
| Idempotency key collisions | Unexpected reuse | Include spec_hash + deterministic args digest |
| Performance regression (extra joins) | Higher latency | Flattened profile_version_tools for O(1) lookups |

## 8. Validation & Testing Strategy
- Unit: hashing, routing, inheritance flatten (override/remove/multi-level), action journal state machine.
- Integration: execute (human + autonomous), dependency blocking/unblocking, profile upgrade mid-open task (task remains pinned), session lease transfer, GC simulation.
- Golden Tests: canonical spec JSON → hash vectors.
- No shadow diff (legacy removed); instead snapshot expected transcripts from seed flows.

## 9. Important Implementation Notes
- Do NOT mutate existing specs; always create new hash on change.
- Avoid JSON manifest duplication; rely on normalized relational tables (graph_manifest remains cache inside tool_versions only).
- Ensure unique indices exist before writing business logic depending on them (fail fast).
- Provide a `specly_migration_version` table recording applied phase for ops visibility.

## 10. Open (Deferred) Enhancements
| Item | Rationale |
|------|-----------|
| Expression-based transition conditions | Add after result_code & always stable |
| Cross-tool edges | Requires multi-tool routing semantics |
| JSON export/import bundle | After stable internal format |
| Retry scheduling backoff queue | Use simple delay first |
| Rule inference pipeline (LLM) | After core deterministic engine stable |

## 11. Sample Payloads
### Publish Tool Version
```json
POST /api/tools/add_task/versions
{
  "ordered_specs": ["a1b2c3...", "d4e5f6..."],
  "edges": [
    { "from": "a1b2c3...", "to": "d4e5f6...", "condition_type": "always", "priority": 100 }
  ],
  "entry_spec": "a1b2c3..."
}
```
### Create Profile Version
```json
POST /api/profile-versions
{
  "profile_id": "default", 
  "parent_profile_version_id": null,
  "additions": [
     { "tool_name": "add_task", "tool_version_hash": "tvh123", "command_alias": "//add" }
  ],
  "removals": []
}
```
### Execute Tool
```json
POST /api/tools/add_task/execute
{
  "task_id": "t123", 
  "client_state_id": "lease-abc", 
  "args": { "requirement": "Add caching layer" }
}
```
Response (awaiting input example):
```json
{
  "session_id": "s789",
  "task_id": "t123",
  "status": "awaiting_input",
  "content": [{"type":"text","text":"Please provide acceptance criteria."}],
  "current_spec": "a1b2c3..."
}
```

## 12. Reference Mapping Legacy → New
| Legacy Concept | New Equivalent |
|----------------|----------------|
| tool_flows | tool_versions + profile_version_tools |
| tool_flow_steps | specs + tool_versions.graph_manifest.edges |
| feedback_steps | specs (intent='human') |
| stepId param | implicit via session.currentSpecHash |
| ToolFlowExecutor | SpecEngine |
| next-step-generator | edge routing logic |

## 13. Implementation Order Within Phases (Micro-Sequence)
Phase 0 micro-order:
1. Add new schema tables + drizzle types.
2. Add repositories with unit tests.
3. Add hashing utilities + tests.
Phase 1:
4. Build spec seeding script converting legacy tool_flow_steps.
5. Publish tool versions.
6. Create root profile & profile version; bind all workspaces.
Phase 2:
7. Implement SpecEngine (dry-run mode) capturing transcripts.
8. Diff harness comparing legacy vs new.
Phase 3:
9. Enable execute endpoint to call new engine for selected tool(s).
10. Update tool CLI commands to remove stepId dependency.
Phase 4:
11. Remove legacy executor usage; mark deprecated endpoints.
Phase 5:
12. Implement profile inheritance & tests.
13. Add upgrade endpoint & CLI.
Phase 6:
14. Remove legacy tables (migration to drop) & code cleanup.
Phase 7:
15. Implement action journal idempotency + retry policies.
Phase 8:
16. Add GC + purge jobs; metrics & logging.

## 14. Metrics & Observability (Initial)
| Metric | Type | Description |
|--------|------|-------------|
| spec_engine_execution_ms | histogram | End-to-end execute latency |
| spec_engine_routing_branch | counter(labels: tool, result_code) | Edge selection frequency |
| spec_reuse_cache_hit | counter | Spec hash lookup cache hits |
| action_journal_retries | counter | Retry attempts performed |
| profile_inheritance_depth | gauge | Max depth observed |

## 15. Security Considerations
- Validate `command_alias` input to prevent injection / shell hints.
- Enforce max spec content length & schema size to prevent DB bloat.
- Restrict executor_type registry to whitelisted package prefixes.
- Session lease (`client_state_id`) rotation optional via `force_start`.

## 16. Rollback Strategy
Limited (destructive migration). Before applying schema changes create full SQLite file backup(s). Rollback = restore backup & revert commit; no in-app toggle.

---
This roadmap is the canonical reference for implementation. See `docs/file_changes.md` for file-level edits and `docs/task.md` for actionable tasks.
