# Next Steps (as of 2025-11-03)

## Current Focus
**SP-101: Remove Legacy UI Pages & Components** (Done - 100%) ✅
- Prerequisite SP-100 complete: All 18 API methods implemented, typed errors, api-types.ts extracted ✅
- Completed: (1) Deleted 4 legacy files (tool-flows.tsx, feedback-steps.tsx, tool-flow-card.tsx, feedback-editor.tsx) ✅
- Router already cleaned (line 69 comment) ✅
- Navigation already updated (floating-nav.tsx clean) ✅
- Verification: grep searches confirmed no code dependencies ✅
- Ready for git commit

**Next Task: SP-102 - Specs & Tools Pages Scaffold** (TBD - 0%)
- Prerequisites: SP-100 complete ✅, SP-101 complete ✅
- Description: Create pages/specs.tsx & pages/tools.tsx listing specs (hash, intent) and tool versions (hash, entry_spec)
- Next Steps:
  1. Review SP-102 requirements in current.md and docs/task.md
  2. Plan component structure for specs and tools pages
  3. Implement basic list/table views with API integration (createSpec, createTool methods available)
  4. Add simple search by hash prefix
  5. Update router with new routes
  6. Test with backend endpoints

## Completed in Current Session
- ✅ SP-011: Background Jobs (GC, Purge & Retry Scheduling) (100%) - BackgroundJobsService with hourly sweeps, ENV config, 10 comprehensive tests, all 218/218 tests passing

## Completed in Previous Session
- ✅ SP-018: Graph & Transition Validation (100%)
- ✅ SP-019: Session Lease & Force-Start Enforcement Tests (100%)
- ✅ SP-201: Documentation Overhaul (100%) - README, api-design.md, specly-architecture.md fully rebranded to Specly
- ✅ SP-009: Profile Inheritance (100%) - API complete in SP-015, CLI deferred

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
