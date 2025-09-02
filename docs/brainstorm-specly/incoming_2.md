Incorporating your feedback, here’s a consolidated, updated architecture spec plus concrete schema/API adjustments and an execution roadmap tuned for “no backward compatibility,” explicit spec-as-executor model, task–session lifecycle, profile versioning, external executor packaging, and preference (rules) capture.

## Checklist (your feedback → addressed)
- No backward compatibility needed → simplify migration (fresh schema, one-shot seed) (Done)
- Remove step aliases; only tool alias (command) matters (Done)
- Session ↔ Task model (persistent vs transient, client_state_id, statuses, idle/force_start) (Done)
- Spec object extended with executor contract fields; side_effect & idempotency journaling replace post_flow_action (Done)
- Eliminate post_flow_action hook (Done)
- Profile versioning; multiple workspaces can upgrade to newer profile version (Done)
- External executors as npm packages (manifest + dynamic load) (Done)
- Preference / rule extraction (is-a, has-a, always-do, never-do) pipeline & storage (Done)
- Hash canonicalization updated for new spec schema (Done)
- Updated API surface reflecting new lifecycle & session concurrency (Done)
- Open questions clearly called out (Included)

---

## 1. Updated Core Domain Model

### 1.1 Spec (Immutable Execution Unit)
Canonical (hashed) fields only:
- executor_type: string (e.g. "builtin.llm.prompt", "builtin.db.write", "ext.git.commit")
- executor_version: semver string
- intent: 'human' | 'autonomous'
- side_effect: boolean
- content_template: string | null
- static_params: JSON object
- input_schema: JSON | null
- output_schema: JSON | null
- idempotency_key_template: string | null (required when side_effect && no natural key)
- retry_policy: JSON | null ({ maxAttempts, strategy, baseDelayMs, retryOn[] })
- show_output: boolean
- security: JSON | null ({ network, filesystem, secrets[]?, scopes[]? })
- metadata: {
    display_name: string,
    description?: string,
    tags?: string[],
    supersedes?: string (prior spec hash),
    visibility?: 'global' | 'profile'
  }

Runtime (non-hash) columns:
- hash (PK)
- created_at
- usage_count
- last_used_at
- journal_success_count / journal_failure_count (optional counters)

Hash = SHA-256 of canonical JSON:
1. Remove null/undefined keys.
2. Sort object keys recursively.
3. Normalize content_template: trim trailing whitespace lines, convert CRLF→LF, collapse >2 blank lines into exactly 2.
4. Serialize with JSON.stringify without spacing.

### 1.2 Tool
- name (PK) (e.g. "start_task")
- command_alias (unique) (e.g. "go") — surfaced in description as //go
- active_version_hash (FK → tool_version.hash) (nullable while drafting)
- profile_version_id (FK) (tool membership pinned to a profile version snapshot)
- description
- created_at

### 1.3 Tool Version
Immutable snapshot referencing a graph of specs:
- hash (PK)
- tool_name (FK)
- graph_manifest JSON { ordered_specs: string[], edges: Edge[], entry_spec: string }
  - edges: { from: spec_hash, to: spec_hash, condition_type: 'always'|'result_code'|'expression', condition_value?: string, priority?: number }
- created_at

Tool version hash = SHA-256(JSON.stringify({
  tool: tool_name,
  specs: ordered_specs,
  edges: sortedEdges
}))
Edges sorted by (from,to,condition_type,condition_value||'',priority||0).

### 1.4 Profile & Profile Version
Profiles are versioned snapshots of tool graph selections.

profile:
- id (PK)
- name (unique)
- description
- created_at
- active_version_id (FK → profile_version.id)

profile_version:
- id (PK)
- profile_id (FK)
- version_number (incrementing int)
- created_at
- manifest JSON { tools: { [tool_name]: tool_version_hash }, metadata?: { notes, changelog } }

Workspace binds to a specific profile_version (not floating):
workspace_profile:
- workspace_id
- profile_version_id
- pinned_at

Upgrade means updating workspace_profile.profile_version_id to latest for that profile.

### 1.5 Sessions / Tasks

task:
- id (PK)
- workspace_id
- title
- description
- status: 'active' | 'idle' | 'completed'
- session_id (FK nullable)
- created_at / updated_at

session:
- id (PK)
- workspace_id
- tool_name
- current_spec_hash
- status: 'active' | 'idle' | 'completed'
- client_state_id (nullable) (nonce bound to active client)
- last_active_at
- started_at
- completed_at (nullable)
- context JSON (aggregate variables)
- last_result_code (nullable)
- transient: boolean (true until linked to a task)
- task_id (nullable FK) (once set → persistent)
- idle_timeout_ms (default 300000)
- human_blocking: boolean (true when waiting on 'human' intent spec completion payload)

Rules:
- transient sessions auto GC after 24h inactivity (or on server sweep).
- only one active (status='active') session per (task_id) at a time.
- client_state_id must match on resume unless force_start flag provided.

### 1.6 Action Journal (Idempotency & Side Effects)

action_journal:
- id (PK)
- session_id
- spec_hash
- idempotency_key (unique)
- status: 'pending' | 'success' | 'failed'
- attempts
- last_error_code (nullable)
- result_json (nullable)
- error_json (nullable)
- started_at
- completed_at

Unique composite index: (spec_hash, session_id, idempotency_key).

### 1.7 Rule / Preference Knowledge (Workspace Rules)

workspace_rule_facts:
- id
- workspace_id
- source_session_id (nullable)
- subject: string (e.g. "commit_message", "test_suite")
- relation: 'is-a' | 'has-a' | 'always-do' | 'never-do'
- object: string
- confidence: float (0-1)
- created_at
- last_reinforced_at
- active: boolean

Extraction occurs in human-facing feedback / audit specs.

### 1.8 Executor Registry

executor_registry (in-memory; persisted optional):
- executor_type
- executor_version
- package_name
- module_path
- input_schema
- output_schema
- security_defaults
- loaded_at

External executors discovered through:
- Node resolution of packages matching prefix: specly-executor-* (configurable)
- Each package exports manifest: { executor_type, version, schemas, capability, security, runner(factory) }

---

## 2. Eliminated Concepts
- Legacy flows & step enums (no migration required).
- post_flow_action hook (replaced by explicit autonomous spec nodes).
- Step alias concept (only display_name + hash).
- Backward compatibility / dual-engine flag (we go straight to new engine).

---

## 3. Execution Flow (Concrete Algorithm)

1. Client calls POST /api/tools/:tool/execute with:
   { task_id? , session_id? , client_state_id?, force_start?, args?, next_spec_hash? }
2. Server resolves session:
   - If session_id provided: validate client_state_id OR force_start.
   - Else if task_id: reuse existing active session or create new persistent session bound to task.
   - Else: create transient session.
   - On creation: pick entry_spec from active tool version.
3. Load current spec (next_spec_hash overrides current when valid transition).
4. Validate input against spec.input_schema.
5. If spec.intent='human' AND args absent -> render content_template with merged context, mark session human_blocking=true, return with next_steps listing current allowed transitions (client will respond with args to continue).
6. If side_effect=true:
   - Compute idempotency_key (template > executor natural > fallback).
   - Check action_journal for existing success → reuse; if failed & attempts < retry_policy.maxAttempts schedule retry (or execute now).
7. Execute via executor runner (dynamically imported).
8. Validate output_schema; merge into session.context.
9. Derive result_code (executor return or spec-level mapping).
10. Pick next edge(s): filter edges where from == spec_hash; apply condition precedence:
    - result_code matches any result_code edges.
    - expression edges (future) evaluated after result_code.
    - fallback 'always'.
11. If multiple candidates -> sort by priority asc (lowest number highest priority); provide all as ranked next_steps (LLM chooses), OR auto-advance if only one and intent='autonomous'.
12. Update session.current_spec_hash or mark completed if none.
13. If no next steps → session.status='completed'.
14. Return JSON: { content[], session_id, task_id?, current_spec_hash, next_steps[], session_status, client_state_id(unchanged) }.

Idle detection: background job marks sessions idle if now - last_active_at > idle_timeout_ms AND status='active' and intent isn't waiting for human input (or sets human_blocking implies automatically idle). Resume flips to active, updates last_active_at.

Force start: if client_state_id mismatch, require force_start flag to override and set new client_state_id (return prior id in response for audit).

---

## 4. API Surface (Updated)

POST /api/tools/:tool/execute  
Body: {
  task_id?, session_id?, client_state_id?, force_start?: boolean,
  args?: JSON,
  next_spec_hash?: string
}  
Response: {
  session_id, task_id?, current_spec_hash, content: [{type:'text', text}], next_steps: [{spec_hash, short_hash, display_name, description}],
  session_status, client_state_id
}

GET /api/sessions?workspace_id=...  
Query params: include_transient=bool (default true), status?, task_id?

POST /api/sessions/:id/resume  
Body: { client_state_id, force_start? }

DELETE /api/sessions/:id (transient only)

POST /api/tasks  
Body: { title, description, tool_name?, client_state_id? }  
- Creates task + persistent session (optionally selects tool; else default start tool)

PATCH /api/tasks/:id/status (complete / close)

GET /api/tools (list with command_alias surfaced inside description)

POST /api/specs (create spec; returns hash)  
Body includes canonical fields; server recomputes and ensures immutability.

POST /api/tools/:tool/draft (stage list of spec_hashes + edges)  
POST /api/tools/:tool/finalize (computes tool_version hash; sets active_version_hash within a draft context)

POST /api/profiles/:profile/version (new profile_version from set of tool_version hashes)  
POST /api/profiles/:profile/activate (set active_version_id)  
POST /api/workspaces/:id/profile/upgrade (apply latest active profile_version)  

GET /api/workspaces/:id/rules (list knowledge facts)  
POST /api/workspaces/:id/rules/reinforce (add/update facts)  

(Extraction happens server-side during certain spec executions; this endpoint is ancillary.)

---

## 5. Schema Sketch (TypeScript / Drizzle Pseudocode)

````ts
export const specs = sqliteTable('specs', {
  hash: text('hash').primaryKey(),
  executorType: text('executor_type').notNull(),
  executorVersion: text('executor_version').notNull(),
  intent: text('intent', { enum: ['human','autonomous']}).notNull(),
  sideEffect: integer('side_effect', { mode: 'boolean'}).notNull(),
  contentTemplate: text('content_template'),
  staticParams: blob('static_params', { mode: 'json'}).notNull(),
  inputSchema: blob('input_schema', { mode: 'json'}),
  outputSchema: blob('output_schema', { mode: 'json'}),
  idempotencyKeyTemplate: text('idempotency_key_template'),
  retryPolicy: blob('retry_policy', { mode: 'json'}),
  showOutput: integer('show_output',{mode:'boolean'}).notNull().default(false),
  security: blob('security',{mode:'json'}),
  metadata: blob('metadata',{mode:'json'}).notNull(), // includes display_name
  createdAt: integer('created_at',{ mode:'timestamp_ms'}).notNull(),
  usageCount: integer('usage_count').notNull().default(0),
  lastUsedAt: integer('last_used_at',{ mode:'timestamp_ms'})
});

export const toolVersions = sqliteTable('tool_versions', {
  hash: text('hash').primaryKey(),
  toolName: text('tool_name').notNull(),
  graphManifest: blob('graph_manifest',{mode:'json'}).notNull(),
  createdAt: integer('created_at',{mode:'timestamp_ms'}).notNull()
});

export const tools = sqliteTable('tools', {
  name: text('name').primaryKey(),
  commandAlias: text('command_alias').notNull().unique(),
  activeVersionHash: text('active_version_hash'),
  profileVersionId: integer('profile_version_id'),
  description: text('description'),
  createdAt: integer('created_at',{mode:'timestamp_ms'}).notNull()
});

export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  activeVersionId: integer('active_version_id'),
  createdAt: integer('created_at',{mode:'timestamp_ms'}).notNull()
});

export const profileVersions = sqliteTable('profile_versions', {
  id: integer('id').primaryKey(),
  profileId: integer('profile_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  manifest: blob('manifest',{mode:'json'}).notNull(), // { tools: { toolName: toolVersionHash } }
  createdAt: integer('created_at',{mode:'timestamp_ms'}).notNull()
});

export const workspaceProfiles = sqliteTable('workspace_profiles', {
  workspaceId: integer('workspace_id').notNull(),
  profileVersionId: integer('profile_version_id').notNull(),
  pinnedAt: integer('pinned_at',{mode:'timestamp_ms'}).notNull()
});

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey(),
  workspaceId: integer('workspace_id').notNull(),
  toolName: text('tool_name').notNull(),
  currentSpecHash: text('current_spec_hash').notNull(),
  status: text('status',{ enum:['active','idle','completed']}).notNull(),
  clientStateId: text('client_state_id'),
  lastActiveAt: integer('last_active_at',{mode:'timestamp_ms'}).notNull(),
  startedAt: integer('started_at',{mode:'timestamp_ms'}).notNull(),
  completedAt: integer('completed_at',{mode:'timestamp_ms'}),
  context: blob('context',{mode:'json'}).notNull(),
  lastResultCode: text('last_result_code'),
  transient: integer('transient',{mode:'boolean'}).notNull(),
  taskId: integer('task_id'),
  humanBlocking: integer('human_blocking',{mode:'boolean'}).notNull().default(false),
  idleTimeoutMs: integer('idle_timeout_ms').notNull().default(300000)
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey(),
  workspaceId: integer('workspace_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status',{ enum:['active','idle','completed']}).notNull(),
  sessionId: integer('session_id'),
  createdAt: integer('created_at',{mode:'timestamp_ms'}).notNull(),
  updatedAt: integer('updated_at',{mode:'timestamp_ms'}).notNull()
});

export const actionJournal = sqliteTable('action_journal', {
  id: integer('id').primaryKey(),
  sessionId: integer('session_id').notNull(),
  specHash: text('spec_hash').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status',{ enum:['pending','success','failed']}).notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastErrorCode: text('last_error_code'),
  resultJson: blob('result_json',{mode:'json'}),
  errorJson: blob('error_json',{mode:'json'}),
  startedAt: integer('started_at',{mode:'timestamp_ms'}),
  completedAt: integer('completed_at',{mode:'timestamp_ms'})
});

export const workspaceRuleFacts = sqliteTable('workspace_rule_facts',{
  id: integer('id').primaryKey(),
  workspaceId: integer('workspace_id').notNull(),
  sourceSessionId: integer('source_session_id'),
  subject: text('subject').notNull(),
  relation: text('relation',{ enum:['is-a','has-a','always-do','never-do']}).notNull(),
  object: text('object').notNull(),
  confidence: real('confidence').notNull(),
  createdAt: integer('created_at',{mode:'timestamp_ms'}).notNull(),
  lastReinforcedAt: integer('last_reinforced_at',{mode:'timestamp_ms'}),
  active: integer('active',{mode:'boolean'}).notNull().default(true)
});
````

---

## 6. Hash Canonicalization Utilities

Pseudo:

````ts
function normalizeTemplate(t?: string|null) {
  if(!t) return null;
  return t
    .replace(/\r\n/g,'\n')
    .split('\n')
    .map(line => line.replace(/\s+$/,''))
    .join('\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim() + '\n';
}

function canonicalizeSpec(spec: CanonicalSpecInput) {
  const clone = deepStripNull(spec);
  clone.content_template = normalizeTemplate(clone.content_template);
  return stableDeterministicJSONStringify(clone); // keys sorted recursively
}

function computeSpecHash(spec) {
  return sha256(canonicalizeSpec(spec));
}
````

---

## 7. External Executor Packaging

Convention:
- Package name: specly-executor-<domain>
- Exports `register()` returning manifest(s):
  ```
  export interface ExecutorManifest {
    executor_type: string;
    executor_version: string; // semver
    input_schema?: JSONSchema;
    output_schema?: JSONSchema;
    security?: { network?: 'none'|'allowlisted'|'full'; filesystem?: 'none'|'read'|'read-write' };
    runner: (ctx: ExecutorContext) => Promise<ExecutorResult>;
    introspect?: () => any;
  }
  ```
Discovery:
1. Read project root (and global) package.json dependencies.
2. Filter names starting with specly-executor-.
3. Dynamic import, collect manifests, validate schema & version, populate registry.
4. On spec execution, match executor_type+executor_version to manifest; reject if missing.

Version negotiation: If spec references executor_version '1.2.x', pick highest compatible installed manifest satisfying semver; record concrete resolved version in execution record (not part of spec hash—so restrict spec to exact version to avoid non-determinism OR we treat resolved version mismatch as warning). Recommendation: enforce exact version pin in spec to preserve determinism.

Security enforcement: Each executor runner receives sandbox config (e.g., disable network unless allowed). Node-level sandbox TBD (future: isolate via worker threads + policy).

---

## 8. Preference / Rule Extraction Pipeline

During any spec with intent='human' and metadata.tags includes 'feedback' or 'rule-capture':
1. Collect user textual feedback provided in args.
2. Run lightweight classification prompt (or deterministic regex heuristics) producing candidate facts:
   - Pattern examples:
     - "Always write unit tests first" → (subject:"unit_tests", relation:"always-do", object:"write_first")
     - "Never modify generated migrations manually" → (subject:"migrations", relation:"never-do", object:"manual_edit")
3. Existing facts: if same (subject, relation, object) → increase confidence (bounded to 1.0) & update lastReinforcedAt.
4. Expose aggregated rules to later specs via session context injection (e.g., session.context.rules = top N active facts sorted by confidence & recency).
5. Provide optional tool to list/manage rules.

Confidence update formula example:
new_conf = 1 - (1 - old_conf)*(1 - baseDelta) ; baseDelta=0.3

---

## 9. Implementation Roadmap (No Legacy Migration)

Phase 0: Foundations
- Implement schema (Drizzle migrations).
- Executor registry loader (builtin prompt executor + stub action executor).
- Spec hashing utilities + tests (golden fixtures).

Phase 1: Core Engine (Linear)
- Support tool creation with ordered specs (edges implicit).
- Execute human/autonomous specs; action_journal for side_effect nodes.

Phase 2: Graph & Branching
- Add explicit edges & result_code routing.
- Provide ranking/priority semantics.

Phase 3: Profile & Versioning
- Profile + profile_version CRUD.
- Workspace binding & upgrade API.

Phase 4: Task–Session Binding
- Enforce single active persistent session per task.
- Implement force_start & client_state_id logic, idle sweeper.

Phase 5: Rules Extraction
- Implement classification routine (initial simple heuristic) and persistence of workspace_rule_facts.
- Inject rules into context for prompt specs.

Phase 6: External Executors
- Autodiscovery + manifest validation.
- Add example package (specly-executor-git) with 'ext.git.commit'.

Phase 7: Advanced Reliability
- Retry engine (respect retry_policy).
- Idempotency key fallback strategies & validation.

Phase 8: Polishing
- Export/import profile_version (reconstructing specs by hash).
- Telemetry counters (usageCount updates).
- Documentation & removal of any placeholders.

---

## 10. Open Decisions (Need Your Call)

1. Spec executor_version pinning: enforce exact version vs semver range? (Recommend: exact for determinism.)
2. Should we allow session reattachment without force_start after idle timeout (i.e., auto-release client_state_id)? (Current: requires matching client_state_id or force_start.)
3. For rules extraction, prefer LLM classification (cost) or deterministic pattern-first with optional LLM fallback? (Propose: start deterministic.)
4. Do we need a dedicated “draft” concept for tool versions or just allow building a tool_version hash offline then finalize? (Current: finalize when posted.)
5. Should transient sessions be queryable after GC (soft-delete) for 24h audits? (Currently: hard delete.)

---

## 11. Doc Patch Suggestions

You can update brainstorm.md (rename perhaps to `specly-architecture.md`) by:
- Replacing Section 4 (Architectural Pillars) versioning & flow control with new spec structure & hashing.
- Adding new “Executor Model & Security” section.
- Replacing session description with Task–Session Binding semantics.
- Removing post_flow_action references; add side_effect & journal model.
- Adding Profile Versioning section (snapshot manifest).
- Adding Rule Extraction section.

If you’d like, I can draft a patch file next turn.

---

## 12. Quality / Consistency Notes

- All hashed data must exclude runtime timestamps.
- Any future schema field added to specs must be categorized (hashed vs runtime) early to avoid accidental hash invalidation.
- Determinism test: given identical spec canonical JSON files in arbitrary key order, hash result must match (add unit test fixture set).
- Security: until sandboxing is in place, mark any non-prompt executor with network/filesystem usage as experimental.

---

## 13. Quick Example: Spec JSON (Canonical)

````json
{
  "executor_type": "builtin.llm.prompt",
  "executor_version": "1.0.0",
  "intent": "human",
  "side_effect": false,
  "content_template": "Analyze the task requirements...\n",
  "static_params": {},
  "input_schema": {
    "type": "object",
    "properties": {
      "initial_description": { "type": "string" }
    },
    "required": ["initial_description"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "refined_requirements": { "type": "string" }
    },
    "required": ["refined_requirements"]
  },
  "idempotency_key_template": null,
  "retry_policy": null,
  "show_output": true,
  "security": { "network": "none", "filesystem": "none" },
  "metadata": {
    "display_name": "Requirement Analysis",
    "tags": ["planning","feedback"]
  }
}
````

Hash = sha256(canonicalize(spec)).

---

## 14. Next Action Options

A) I draft doc patch content for `brainstorm.md`.  
B) Start Phase 0 schema + utilities (I’ll output migration + utility code).  
C) Decide open questions first.  
D) Add executor manifest example package snippet.

Let me know which path you want, and any decisions for the open items (1–5). I can proceed immediately with your choice.