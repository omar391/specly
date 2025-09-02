# UI Migration Roadmap (Direct Specly Cutover)
No backward compatibility paths retained. All legacy ToolFlow / FeedbackStep pages and components are removed or repurposed immediately. This roadmap defines: target UX architecture, data flows, component responsibilities, state management, API mapping, and phased (rapid) implementation plan aligned with backend Specly model.

## 1. Target UX Architecture

### 1.1 Core Domains Surfaced
- Specs Catalog (immutable templates)
- Tool Versions (graph manifests) + visualization
- Profiles & Profile Versions (inheritance lineage, flattened view)
- Tasks (enhanced statuses, dependencies, soft delete)
- Sessions (live execution console, current spec, context)
- Workspace Rules (preference facts)

### 1.2 Navigation Information Architecture
Primary Nav: Dashboard | Tasks | Tools | Specs | Profiles | Rules | Sessions
Secondary (contextual): For a tool version → Graph, Specs list, Publish new version; For profile version → Tools, Inheritance lineage, Upgrade workspace.

### 1.3 State Management Strategy
Adopt minimal React Query layer for caching server entities:
- Query Keys: `['specs']`, `['toolVersions', toolName]`, `['profileVersions', profileId]`, `['workspaceProfile', workspaceId]`, `['tasks', workspaceId]`, `['sessions', workspaceId]`, `['rules', workspaceId]`.
- Mutation invalidation ensures consistency post-create/publish/upgrade.
No global Redux; ephemeral component state localised.

### 1.4 Real-time Updates (SSE)
Extend existing SSE to emit:
- `session.updated` (payload: session_id, current_spec_hash, status, task_id)
- `task.status_changed` (task_id, old_status, new_status)
- `rule.created`, `rule.reinforced`
UI subscribes via `useApiClient` and updates relevant query caches.

## 2. Data & Type Adjustments
| Legacy | New |
|--------|-----|
| ToolFlow / Flow Steps | ToolVersion (graphManifest.edges) + Specs |
| FeedbackStep | Spec (intent='human') |
| Task.status (backlog, in-progress...) | Task.status (queued, in_progress, awaiting_input, blocked, paused, completed, failed) |
| Task.dependencies JSON | task_dependencies table (fetched via separate endpoint) |
| StepId orchestration | Session.current_spec_hash driven |

Update client Task interface accordingly; remove legacy arrays.

## 3. Component Responsibilities
| Component | Responsibility |
|-----------|---------------|
| `spec-editor` | Create spec JSON with live hash preview; validates schema fields (basic structural + required fields). |
| `tool-version-publisher` | Assemble ordered spec list, add edges (inline form), preview DAG, compute hash client-side before submit. |
| `tool-graph-canvas` | Visualize tool version DAG (node color by intent; edge label condition_type/result_code). |
| `profile-version-creator` | Display parent flattened tools (inherited vs overridden); apply removals/additions. |
| `task-dependencies-panel` | CRUD dependencies; show blocked reason; highlight circular attempts (prevent). |
| `execution-console` | Live session view; show spec template rendered; context diff (prev vs current). |
| `rule-input-form` | Normalize rule text; preview uniqueness (warn if duplicate). |
| `status-badge` | Uniform badge for statuses with token-driven color scheme. |

## 4. API Mapping (Client Methods)
| Method | Endpoint | Notes |
|--------|----------|-------|
| createSpec | POST /api/specs | Returns spec hash |
| publishToolVersion | POST /api/tools/:tool/versions | Provide ordered_specs, edges, entry_spec |
| getToolGraph | GET /api/tools/:tool/graph | Manifest & resolved edges |
| createProfileVersion | POST /api/profile-versions | inheritance logic server side |
| upgradeWorkspaceProfile | POST /api/workspaces/:id/upgrade-profile | binds new version |
| executeTool | POST /api/tools/:tool/execute | multi-step management |
| getTasks | GET /api/workspaces/:id/tasks | statuses updated |
| addTaskDependency | POST /api/tasks/:id/dependencies | |
| removeTaskDependency | DELETE /api/tasks/:id/dependencies/:depId | |
| softDeleteTask | PATCH /api/tasks/:id/delete | sets deleted_at |
| getWorkspaceProfile | GET /api/workspaces/:id/profile-version | (new) workspace binding |

## 5. UX Flows
### 5.1 Publish New Tool Version
1. Open Tools page → select tool → "Publish Version".
2. ToolVersionPublisher: choose specs (multi-select + ordering), define edges (validated: DAG check, all nodes reachable from entry_spec).
3. Client pre-computes hash; compares with server on response (should match).
4. On success invalidates `['toolVersions', toolName]` + triggers toast.

### 5.2 Create Profile Version (Inheritance)
1. Open Profiles → choose parent version → "Create New Version".
2. Modal shows flattened tool list; checkboxes to remove; add section to override (pick different tool_version_hash) or add new tool.
3. Submit; server returns new profile_version_id; UI navigates to new version view.

### 5.3 Execute Tool Flow (Spec Engine)
1. User clicks "Run" on tool listing or from task view.
2. ExecutionConsole opens (drawer). First response may be human spec (awaiting_input) → show form dynamic fields (input_schema driven).
3. On submit → executeTool again; SSE updates show session progression.

### 5.4 Manage Task Dependencies
1. Open Task detail drawer → Dependencies tab.
2. Add dependency (search other tasks – filtered by not completed/failed). If cycle detected (server 409) show error.
3. Blocked status auto-reflected via tasks query refetch or SSE event.

## 6. Validation & Guards
- Tool Graph Client Validation: ensure no duplicate edges, all spec hashes valid length (≥7 chars), no self loops.
- Spec Editor: required fields: executor_type, executor_version, intent, side_effect boolean, metadata.display_name.
- Profile Version Creator: enforce unique command_alias within version; highlight conflicts before submit.

## 7. Performance Considerations
- Lazy load large catalogs (specs) with infinite scroll (hash prefix search server side later; placeholder client filter now).
- Memoize graph layout (use spec hash + edges stable key).
- Batched SSE updates (debounce 100ms) to avoid re-render storms during fast autonomous steps.

## 8. Accessibility & UX
- All interactive controls require keyboard navigation.
- DAG canvas: provide textual fallback list (ordered traversal) for screen readers.
- Color tokens accompanied by `aria-label` for status meaning.

## 9. Implementation Phases (Aggressive Direct Cutover)
| Phase | Scope | Duration Target |
|-------|-------|-----------------|
| UI-1 | API client refactor + remove legacy pages | 1 day |
| UI-2 | Core new pages: Tools, Specs, Profiles scaffold | 1 day |
| UI-3 | Spec Editor + Tool Version Publisher + Graph Canvas | 1–2 days |
| UI-4 | Profile Version Creator + Upgrade flow | 1 day |
| UI-5 | Execution Console + Sessions page + SSE extensions | 1–2 days |
| UI-6 | Task Dependencies Panel + Status badges overhaul | 1 day |
| UI-7 | Rules enhancements + Rule Form | 0.5 day |
| UI-8 | Polish: accessibility, performance, docs | 0.5 day |

(May overlap with backend phases; coordinate on endpoints availability.)

## 10. Risk & Mitigation
| Risk | Mitigation |
|------|-----------|
| Missing backend endpoint timing | Stub client with mock service, feature toggle display until live |
| DAG layout complexity | Use simple layered layout (topological order) initially; upgrade later |
| SSE burst overload | Debounce & only patch changed session nodes |
| Hash mismatch (client/server) | Log mismatch; show warning; rely on server authoritative hash |

## 11. Testing Strategy
- Unit: hash preview, DAG validation, alias uniqueness pre-submit.
- Component: Spec Editor form, Tool Publisher edge form, Execution Console state transitions.
- Integration (mock server): publish → execute linear flow.

## 12. Metrics (Optional Early)
- `ui_tool_publish_time_ms` (end-to-end form submit to success)
- `ui_session_step_latency_ms` (difference between SSE step updated and user submit)
- `ui_graph_render_ms`

## 13. Removal Inventory Checklist
- [ ] Remove tool-flow components
- [ ] Remove feedback-step pages
- [ ] Purge toolFlow & feedbackStep TS interfaces
- [ ] Update navigation items
- [ ] Rename API client

## 14. Open Enhancements (Post-Cutover)
- Graph edge editing with drag/drop
- Spec diff viewer (show canonical JSON diff)
- Workspaces multi-profile preview

This complements backend roadmap; tasks integrated into unified `docs/task.md` after update.
