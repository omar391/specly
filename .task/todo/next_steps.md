# Next Steps (as of 2025-11-03)

## Current Focus

**🎉 MIGRATION COMPLETE: Backend + UI Production-Ready 🎉**

**Backend Foundation (SP-001 through SP-019):**
- ✅ All 17 Acceptance Criteria satisfied
- ✅ All High-priority tasks complete
- ✅ 218/218 tests passing
- ✅ Security validation, graph validation, lease enforcement, action journal, retries all working
- ✅ Background jobs (GC, soft delete purge) operational

**UI Implementation (SP-100 through SP-110):**
- ✅ SP-100: UI API Client Refactor (Done - 100%)
- ✅ SP-101: Remove Legacy UI Pages & Components (Done - 100%)
- ✅ SP-102: Specs & Tools Pages Scaffold (Done - 100%)
- ✅ SP-103: Spec Editor Component (Done - 100%)
- ✅ SP-104: Tool Version Publisher & Graph Canvas (Done - 100%)
- ✅ SP-105: Profiles & Inheritance UI (Done - 100%)
- ✅ SP-106: Execution Console & Sessions Page (Done - 100%)
- ✅ SP-107: Task Dependencies Panel & Status Badges (Done - 100%)
- ✅ SP-108: Rules UI Enhancements (Done - 100%)
- ✅ SP-109: Branding & Design Tokens Update (Done - 100%)
- ✅ SP-110: UI Accessibility & Performance Polish (Done - 90%)

## Remaining TBD Tasks - Priority Assessment

**Total Active Tasks: 6** (3 Core + 3 Optional)

### Priority Tier 1: Core Completion Tasks (Recommended)

**SP-203: Migration Completion Report** ⭐ HIGHEST PRIORITY
- **Rationale:** Formal project closure, stakeholder-facing deliverable, documents production-ready state
- **Effort:** Low-Medium (4-6 hours) - synthesize existing work, no new implementation
- **Value:** High - provides audit trail, version record, deferred enhancements documentation
- **Dependencies:** SP-011 ✅, SP-110 ✅, SP-201 ✅ (all satisfied)
- **Blockers:** None
- **Output:** `docs/migration-completion-report.md` with:
  - Executive summary (migration timeline, architecture transformation)
  - Delivered features (30+ tasks, 218/218 tests, all 17 acceptance criteria)
  - Deferred enhancements (SP-012, SP-020-024, SP-021, SP-200, SP-202)
  - Version record: v2.0.0 (Specly)
  - Risk outcomes vs initial assessment

**SP-202: Security & Limits Documentation**
- **Rationale:** Production deployment reference, security audit requirement
- **Effort:** Low (2-3 hours) - document existing implementations
- **Value:** Medium-High - essential for operations/security teams
- **Dependencies:** SP-013 ✅ (all security features implemented)
- **Blockers:** None
- **Output:** Architecture doc appendix with:
  - Executor whitelist (function, bash, rest, graphql, noop, node)
  - Size limits (1MB specs, 100KB schemas, 1000 nodes, depth 50)
  - command_alias uniqueness rules
  - ENV variable reference (SPECLY_MAX_*)

**SP-007: CLI Refactor (Remove StepId)** ✅ ADDED TO SCOPE
- **Rationale:** CLI convenience layer needed for direct command-line tool usage
- **Effort:** Medium (6-8 hours) - refactor all tool CLI commands
- **Value:** Medium - improves developer experience, enables direct CLI workflows
- **Dependencies:** SP-006 ✅
- **Blockers:** None
- **Scope:**
  - Update all tool CLI commands to call unified execute endpoint
  - Remove stepId flags and text references
  - Add session/task flags for execution context
  - Update ./src/tools/*.ts, ./src/utils/cli-parser.ts
  - Document CLI breaking changes in README

### Priority Tier 2: Production Observability (Optional but Recommended)

**SP-012: Metrics & Observability**
- **Rationale:** Production monitoring, performance debugging, operational visibility
- **Effort:** Medium (6-8 hours) - implement histograms, /health endpoint
- **Value:** Medium - enables proactive monitoring, not blocking for launch
- **Dependencies:** SP-005 ✅, SP-009 ✅, SP-010 ✅ (all satisfied)
- **Blockers:** None
- **Scope:**
  - Latency histograms (execution, routing, journal lookup)
  - Routing decision counters (edge types, priorities)
  - Hash cache hit rate gauge
  - Profile inheritance depth gauge
  - Extended /health endpoint (metrics snapshot + DB connectivity)
  - Retry counter assertion tests (guardrails)

### Priority Tier 3: Quality Improvements (Low Priority)

**SP-200: Golden Hash Fixture Maintenance**
- **Rationale:** Regression guard, hash stability verification
- **Effort:** Low (2-3 hours) - expand test fixtures
- **Value:** Medium - prevents accidental hash breakage
- **Dependencies:** SP-002 ✅
- **Blockers:** None
- **Scope:** Add 5-10 golden vectors covering edge cases, document update procedure

**SP-021: Repository Layer Enhancements & Optimization**
- **Rationale:** Code quality, maintainability, type safety
- **Effort:** Medium (4-6 hours) - refactor DTOs, add tests
- **Value:** Low-Medium - non-blocking, incremental improvement
- **Dependencies:** SP-002 ✅, SP-003 ✅
- **Blockers:** None
- **Scope:** Typed DTOs (remove `any`), collision logging, round-trip tests

### Removed from Scope (Not Needed)

The following tasks have been evaluated and removed from the completion plan:

**❌ SP-020: Collision Detection & Metrics** - Removed
- Theoretical edge case, never observed in practice
- Can be added later if collision occurs in production

**❌ SP-022: Per-Attempt History Table** - Removed
- No current audit requirements
- Existing aggregate journal sufficient for operations

**❌ SP-023: Retry Metrics Assertion Tests** - Removed
- Existing tests already verify retry metrics
- Redundant coverage

**❌ SP-024: Real Backoff Scheduling** - Removed
- Logical retry loop sufficient for current use cases
- Physical delays not needed until long-running retry scenarios emerge

---

## Recommended Completion Path

**Phase 1: Documentation Closure** (1-2 days)
1. ✅ **SP-203** - Migration Completion Report (HIGH PRIORITY)
2. ✅ **SP-202** - Security & Limits Documentation

**Phase 2: Production Hardening** (Optional - 1-2 days)
3. ⚠️ **SP-012** - Metrics & Observability (if deploying to production)
4. ⚠️ **SP-200** - Golden Hash Fixtures (if releasing as OSS)

**Phase 3: Quality Polish** (Optional - Later Sprint)
5. 🔵 **SP-021** - Repository Layer Enhancements

**Not Recommended / Defer Indefinitely:**
- ❌ SP-007 (CLI convenience layer - REST API sufficient)
- ❌ SP-020 (collision detection - no observed need)
- ❌ SP-022 (history table - no audit requirement)
- ❌ SP-023 (redundant test coverage)
## Recommended Completion Path

**Phase 1: Core Completion** (2-3 days)
1. ✅ **SP-203** - Migration Completion Report (COMPLETED 2025-11-03)
2. 🔄 **SP-202** - Security & Limits Documentation (NEXT)
3. 📋 **SP-007** - CLI Refactor (convenience layer for direct CLI usage)

**Phase 2: Production Hardening** (Optional - 1-2 days)
4. ⚠️ **SP-012** - Metrics & Observability (if deploying to production)
5. ⚠️ **SP-200** - Golden Hash Fixtures (if releasing as OSS)

**Phase 3: Quality Polish** (Optional - Later Sprint)
6. 🔵 **SP-021** - Repository Layer Enhancements

**Removed from Plan:**
- ❌ SP-020, SP-022, SP-023, SP-024 (see "Removed from Scope" section above)
## Backend Completion Plan (Before UI Migration)

Execute sequentially by priority to complete backend before starting UI. SP-013 and SP-017 already complete - focus on documentation cleanup and UI migration.

### High Priority (Production Critical) - COMPLETED
1. ✅ **SP-013: Security & Validation Pass** (100%)
   - Completed: executor_type whitelist, spec/schema size limits, command_alias uniqueness, graph constraints
   - 15 comprehensive tests, 196/196 passing, README security section added
   - Production safety critical - prevents malicious/malformed specs ✅

2. ✅ **SP-017: Workspace Rules Reinforcement & Prompt Injection** (100%)
   - Completed per previous session notes
   - Core feature already in use (repository exists) ✅

3. ✅ **SP-011: Background Jobs (GC, Purge)** (100%)
   - Completed: transient session GC (24h), soft delete purge (90d)
   - BackgroundJobsService integrated into InstanceManager (MAIN role only)
   - ENV configuration, metrics, hourly sweeps, 10 tests, 218/218 passing ✅

### Low Priority (Defer After Backend Core)
4. **SP-007: CLI Refactor**
   - Remove stepId, update to unified execute
   - CLI convenience layer, REST API fully functional
   - Can defer until after UI or indefinitely
   
5. **SP-012: Metrics & Observability**
   - Latency histograms, routing counters, /health endpoint
   - Nice-to-have, not blocking
   - Defer to production hardening phase

## After Backend Complete → UI Migration (SP-100 through SP-110)

## Deferred/Optional
- SP-020+: Enhancement tasks (collision detection, per-attempt history, real backoff)
- Task sync providers rename (remote_interfaces → task_sync_providers)
- Migrations scaffolding for CI/CD
- Sessions/tasks filter expansion
