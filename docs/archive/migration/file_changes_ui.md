# UI Planned File-by-File Changes (Direct Specly Cutover)
No backward compatibility required; remove legacy ToolFlow & FeedbackStep concepts immediately. Frontend pivots to Spec / Tool Version / Profile Version model and new execution API.

Legend:
- [R] Remove file
- [M] Modify existing
- [N] New file
- [S] Split/refactor into multiple

## Root Config & Meta
- `ui/package.json` [M]: Update scripts (remove legacy naming), add env vars `VITE_SPEC_API_BASE`, remove unused tool-flow endpoints, add build step for design token extraction if needed.
- `ui/rsbuild.config.ts` [M]: Ensure alias imports for `@specly/*` (new modules) if introduced.
- `ui/tailwind.config.js` [M]: Add tokens for task status chips (queued, in_progress, awaiting_input, blocked, paused, completed, failed).
- `ui/eslint.config.js` [M]: Add rule for exhaustive-deps & custom alias import ordering.
- `ui/index.html` [M]: Update app name branding Specly → Specly.
- `.env`, `.env.production` [M]: Replace SPECLY variables with SPECLY prefix.
- `README.md` [M]: Rewrite conceptual doc to reflect Specly profiles & spec engine.

## Global Assets & Styles
- `ui/src/design-system.json` [M]: Extend tokens (statuses, session states, profile badges, inheritance depth colors).
- `ui/src/index.css` [M]: Add status-specific utility classes; remove obsolete tool flow classes.
- `ui/src/App.css` [M]: Clean dead selectors referencing tool-flow or feedback-step.

## Entry & Routing
- `ui/src/main.tsx` [M]: Provide React Query / TanStack Query (if adopted) or fetch caching wrapper; pass `SpeclyApiClient` provider.
- `ui/src/router.tsx` [M]: Replace `/tool-flows`, `/feedback-steps` routes with `/tools`, `/specs`, `/profiles`; add `/profile-versions/:id`.

## API Layer
- `ui/src/lib/api-client.ts` [M]:
  - Rename class `SpeclyApiClient`.
  - Remove ToolFlow & FeedbackStep types and methods.
  - Add methods: `getToolGraph(toolName)`, `executeTool(toolName, body)`, `createSpec`, `publishToolVersion`, `createProfileVersion`, `upgradeWorkspaceProfile`, `getWorkspaceProfile`, `getTasks` (updated enums), `addTaskDependency`, `removeTaskDependency`, `softDeleteTask`.
  - Update Task status enum and remove `dependencies` array field (use separate dependency fetch if needed).
  - SSE events: add `session.updated`, `task.status_changed`.

## Lib Utilities
- `ui/src/lib/design-system.ts` [M]: Add mappings for new statuses to colors & icons.
- `ui/src/lib/utils.ts` [M]: Add formatting helpers for profile inheritance depth, spec hash shortener.

## Components (Replace Legacy Domain)
### Remove Legacy-Specific
- `components/tool-flow-card.tsx` [R]
- `components/feedback-editor.tsx` [R]
- `pages/tool-flows.tsx` [R]
- `pages/feedback-steps.tsx` [R]

### Modify / Repurpose
- `components/workflow-canvas.tsx` [M]: Transform into `tool-graph-canvas.tsx` showing spec DAG (nodes: spec_hash short, color-coded intent). Rename file to `tool-graph-canvas.tsx` [S].
- `components/task-creation-dialog.tsx` [M]: Integrate immediate spec session start option (checkbox "Start execution now").
- `components/connection-status.tsx` [M]: Include spec engine status & migration phase (fetched via new health endpoint field `spec_engine_phase`).
- `components/workspace-rules-display.tsx` [M]: Adjust to new relation types (always-do, never-do, is-a, has-a) & uniqueness; add add-rule form hitting new endpoint.
- `components/workspace-card.tsx` [M]: Show bound profile version & upgrade CTA.
- `components/workspace-header.tsx` [M]: Add profile version badge & session count.
- `components/getting-started.tsx` [M]: Update steps referencing spec creation & tool publishing instead of feedback step creation.
- `components/membership-card.tsx` [M]: Possibly drop if obsolete (evaluate; mark [M] minimal or [R] if unused).
- `components/floating-nav.tsx` [M]: Replace navigation entries (Tools, Profiles, Rules, Tasks).
- `components/page-header.tsx` [M]: Generic breadcrumb aware of tool/spec route.
- `components/theme-provider.tsx` [M]: Add status color CSS variables.

### New Components
- `components/spec-editor.tsx` [N]: Create/edit spec JSON (with validation + hash preview pre-submit).
- `components/tool-version-publisher.tsx` [N]: Select ordered specs & edges; preview resulting graph; compute hash client-side.
- `components/profile-version-creator.tsx` [N]: Show parent profile version flattened tool list; allow add/remove/override.
- `components/task-dependencies-panel.tsx` [N]: Manage dependencies for a task via new API.
- `components/execution-console.tsx` [N]: Live session view (current spec, rendered template, context diff, next state).
- `components/rule-input-form.tsx` [N]: Add new rule with deterministic normalization preview.

### UI Primitives (`components/ui/*`)
- Most can remain; update any naming referencing legacy statuses.
- Add new `status-badge.tsx` [N] specialized for new task statuses.
- Enhance `tabs.tsx` to lazy-mount heavy panels.

## Pages
- `pages/home.tsx` [M]: Dashboard cards change (Specs count, Tool Versions, Profiles, Active Sessions, Pending Tasks by status).
- `pages/tasks.tsx` [M]: New columns (Status chip, Dependencies count). Add filter for status multi-select.
- `pages/profiles.tsx` [N]: List profiles & latest version; upgrade action.
- `pages/profile-version.tsx` [N]: Detailed view (flattened tool list with inheritance markers).
- `pages/tools.tsx` [N]: Replace tool flows listing; show tool versions & publish button.
- `pages/specs.tsx` [N]: Catalog of specs (search by executor_type, intent, hash prefix).

## State Management
- Introduce lightweight client cache (React Query or custom) for specs/tool versions/profile versions.
  - Add `lib/query-client.ts` [N] if using React Query.

## Routing & Navigation
- Adjust side nav & top nav: direct entities (Specs, Tools, Profiles, Tasks, Rules, Sessions).

## Misc
- `vite-env.d.ts` [M]: Add new env var types.
- Remove any CSS referencing removed components.

## Testing (If Present / To Add)
- Add component tests for spec-editor validation & hash preview.
- Snapshot tests for tool-graph-canvas layout deterministic ordering.

## Removal Summary
Immediate deletes: tool-flow-card, feedback-editor, tool-flows page, feedback-steps page.

## New Files Summary (UI)
- components/spec-editor.tsx
- components/tool-version-publisher.tsx
- components/profile-version-creator.tsx
- components/task-dependencies-panel.tsx
- components/execution-console.tsx
- components/rule-input-form.tsx
- components/status-badge.tsx
- pages/profiles.tsx
- pages/profile-version.tsx
- pages/tools.tsx
- pages/specs.tsx
- lib/query-client.ts (optional)

All aligned with direct cutover (no legacy toggles).
