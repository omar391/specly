# Specly Workspace-Specific Rules and Guidelines

## Coding Standards

### TypeScript Guidelines
- Enforce strict TS (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Prefer `type` for unions / composition; `interface` only when extending.
- Use `as const` for immutable manifests (ordered_specs, edges) pre-hash.
- Pure functions for hashing, graph validation, and canonicalization (no IO).
- Avoid broad `any`; use generics + discriminated unions for executor payloads.

### Server & Execution Standards
- Unified execute endpoint only (`POST /api/tools/:tool/execute`) — no legacy tool-flow / feedback endpoints.
- All spec & tool version hashes recomputed server-side; reject mismatch with client proposal.
- Logging: structured JSON lines with `ts`, `level`, `msg`, `task_id?`, `session_id?`, `spec_hash?`.
- Config via env with typed loader; fail fast on missing required vars.
- Input/output validation: Zod schemas for API; JSON Schema for spec IO definitions.
- No dynamic code execution for executors (whitelist enumerated executor_type values).

### React/Frontend Standards
- TypeScript everywhere (no `.jsx`).
- Components referencing spec / tool / profile data must treat hashes as opaque identifiers (never substring mutate).
- Use React Query (or TanStack Query) with query keys including hash or version to avoid stale collisions.
- SSE event names unified: `session.update`, `task.update`, `rule.update`.
- Provide skeleton/loading + error boundaries per page.

## Git Workflow

### Branch Naming
- `feature/SP-###-short-desc`
- `bugfix/SP-###-short-desc`
- `refactor/SP-###-short-desc`
- `docs/SP-###-short-desc`

### Commit Message Format
```
SP-###: Concise imperative summary

* Context / rationale (if needed)
* Notable design decisions
* Breaking changes + migration steps (if any)
```

### Git Commit Best Practices
- **NEVER use multi-line commit messages with special characters in terminal**
- Use single-line commit messages for terminal commits: `git commit -m "message"`
- For complex commits, write commit message in editor: `git commit` (opens editor)
- Avoid quotes, backticks, emojis in terminal commit messages
- Keep terminal commit messages under 80 characters
- Use `git commit --file=message.txt` for pre-written complex messages

### PR Process
- Link to task ID in PR description
- Require code review before merge
- Run all tests and linters
- Update task status after merge

### Human-in-the-Loop Commit Gate
- The assistant must present a concise summary and proposed diffs and obtain explicit user approval before committing any changes.
- No commits without prior approval, even if tests are green.
- Run linters/tests, re-check Documentation Integrity, then After approval commit with Task ID reference in the details if necessary.

### Commit Process: General Rule (2025-09-03)
After completing each discrete unit task or phase (e.g., journal seam, metrics seam):
1. Perform an internal PR-style review of the local diff (logic correctness, style adherence, rule compliance, dead code, naming consistency).
2. Only after review passes, run the full (or appropriately scoped) test suite.
3. Commit with a message referencing affected Task ID(s) and a concise summary of the change scope.
4. Push immediately (no batching unrelated tasks) to preserve atomic history and simplify audits.
This rule is mandatory and supersedes any ad-hoc commit practices.

## Testing Requirements

### Coverage Expectations
- ≥85% line coverage for SpecEngine, hashing, graph validation, profile inheritance, action journal.
- Golden hash fixture tests mandatory (fail build on drift).
- Graph validation negative tests (cycle, orphan, duplicate entry) required.
- Lease conflict tests (mismatched client_state_id) required.

### Testing Frameworks
- **Backend**: Vitest for unit/integration (unify stack) + supertest for API.
- **Frontend**: Vitest + React Testing Library.
- **E2E**: (Deferred) — mark scenarios; optional Playwright later.
- **Database**: Ephemeral SQLite file per test suite; wrap in transaction for rollback harness.

### Testing Policy (2025-09-09)
- Use pnpm + vitest/tsx for all tests and scripts.
- Do not rely on Bun for running tests.
- Do not add .vscode/tasks.json (no VS Code task files for test runs).
- This policy supersedes any conflicting guidance elsewhere in this document for test execution and developer scripts.

## Security Guidelines

### Authentication/Authorization
- (Current scope) Internal trusted environment — future auth placeholder.
- Validate and sanitize all inputs (Zod + custom guards); reject unknown fields (strip / error as appropriate).
- Rate limiting not yet required; document if external exposure planned.

### Data Handling
- No plaintext secrets in repo; env injection only.
- Parameterized queries (Drizzle) — never manual string concatenation.
- Session lease enforcement: mismatch → 409; `force_start` allowed only if prior lease exists.
- Log security-relevant events (lease conflict, invalid hash attempt).

## Performance Considerations

### Database Optimization
- Indices: (tool_versions.hash), (specs.hash), (profile_version_tools.profile_version_id, tool_name), (task_dependencies.task_id), (workspace_rules.workspace_id, relation).
- Use read-only transactions for pure queries.
- Avoid N+1: batch lookups for profile version tool resolution.
- Introduce simple in-memory hash cache (optional) with eviction on new spec insert.

### Frontend Performance
- Code-split heavy graph visualization components.
- Memoize derived DAG layout computations.
- Avoid re-render storms: batch SSE updates (max 10Hz UI refresh).
- Use hash prefix short display (first 8 chars) with copy full hash action.

## Custom Rules

### Spec & Executor Development
- All executable units are specs; legacy multi-step tool flow logic removed.
- Executors must be versioned; no implicit upgrades without new spec hash.
- NO hardcoded prompt templates inside code — templates live in `specs.content_template` only.
- Provide minimal executor output; formatting handled by downstream specs or UI.
- Use `{{context.variable}}` style only within stored templates (never inline code strings).

### Database Operations
- Wrap profile version publish & workspace upgrade in transactions.
- Destructive migration (legacy table removal) must precede seed script run in same release.
- Enforce foreign keys and unique constraints for integrity (fail fast).
- Soft delete tasks/sessions; purge on retention job schedule.

### Task Management Specific
- Task IDs follow SP-### (backend) & SP-1xx (UI) & SP-2xx (docs) scheme.
- Every PR references at least one SP Task ID in title or first line.
- Update `docs/task.md` progress % on merge; do not leave stale statuses.
- Maintain accurate dependency lists (no circular task dependency definitions).

### UI/UX Guidelines
- Consistent hash & status badge components across pages.
- Accessible colors (WCAG AA) for status & edge states.
- Keyboard navigation for spec editor & graph canvas (tab focus order logical).
- Provide JSON validation feedback inline in spec editor.

### Development Workflow
- Backend foundation (SP-001→SP-006) before new UI screens (SP-100+), except branding (SP-109) allowed later.
- No shadow mode; direct cutover only.
- Seed script idempotency mandatory before enabling UI listing pages.
- Add graph validation before accepting external tool version submissions.

### Test Environment Enforcement
- Follow "Testing Policy (2025-09-09)": use pnpm + vitest/tsx; do NOT use `bun test` (prevents ABI load errors & mocking issues like `vi.mock is not a function`).
- When total test counts change (files or tests), update the README Testing section in the same PR (maintain accurate public metrics).

### Error Handling
- Structured error JSON: `{ error: { code, message, details? } }` for API.
- Distinguish 409 vs 422 for conflict vs validation.
- React error boundaries around graph editor & execution console.
- Log stack traces only at debug level unless fatal.

### Documentation
- Keep `docs/specly-architecture.md` synchronized with any schema or execution model change (same PR).
- Add/update golden hash fixtures instructions in `docs/task.md` (SP-200 scope).
- README quickstart path: create spec → publish tool version → create profile version → execute.
- Document breaking changes in CHANGELOG.md and reference SP task.
 - Follow the Documentation Integrity Checklist defined in `.github/copilot-instructions.md` before committing.

## Technology Stack Constraints
- **Backend**: Node.js 18+, TypeScript 5+, Express, Drizzle ORM, SQLite3
- **Frontend**: React 18, Rsbuild, Tailwind CSS, React Query
- **Build Tools**: Rsbuild (UI) & tsc (backend)
- **Package Manager**: pnpm for tests/scripts; bun allowed for UI build/dev; npm fallback if necessary
- **Deployment**: Container image with deterministic build (lockfile pinned)

## Package Management Rules
- Prefer pnpm for workspace installs and backend scripts.
- Use bun only for UI dev/build commands; do not use bun for tests.
- Keep lockfiles committed; no manual edits.
- Add new dependency only with justification referencing SP task.
- Remove unused deps promptly (tracked in SP-201 doc overhaul if discovered).

## Specly-Specific Invariants
- Hash canonicalization must be stable across OS/locale.
- Exactly one entry_spec per tool version; reject if missing or multiple.
- No cycles in tool version graph; unreachable specs are a validation ERROR (publish rejected) unless an internal `allow_unreachable=true` flag is set for diagnostics.
- Profile version flatten ensures no runtime union operations.
- Action journal ensures at most one side-effect execution per (spec_hash, session_id, idempotency_key) tuple.
- Lease ownership changes only via `force_start` with prior lease mismatch.

## Rule Change Log
- 2025-09-02: Initial Specly rewrite of workspace rules replacing TaskPilot references.
- 2025-09-02: Added mandate for drastic migration — remove all legacy tool_flow / feedback_step code & tables immediately (no coexistence). Any PR retaining legacy paths is invalid.
- 2025-09-03: Commit process consolidated. See "Commit Process: General Rule (2025-09-03)" above. Commit message format remains as specified in "Commit Message Format".
- 2025-09-03: Always follow LLM assistant's recommended next steps
