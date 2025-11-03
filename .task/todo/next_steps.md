# Next Steps (as of 2025-11-03)

## Completed in Previous Session
- ✅ SP-018: Graph & Transition Validation (100%)
- ✅ SP-019: Session Lease & Force-Start Enforcement Tests (100%)
- ✅ SP-201: Documentation Overhaul (100%) - README, api-design.md, specly-architecture.md fully rebranded to Specly
- ✅ SP-009: Profile Inheritance (100%) - API complete in SP-015, CLI deferred
- ✅ Full test suite: 181/181 passing

## Backend Completion Plan (Before UI Migration)

Execute sequentially by priority to complete backend before starting UI:

### High Priority (Production Critical)
1. **SP-013: Security & Validation Pass** [NEXT]
   - Enforce command_alias uniqueness, spec size limits, executor_type whitelist
   - Production safety critical - prevents malicious/malformed specs
   - Dependencies: SP-006, SP-005 ✅
   - Status: TBD, 0%

2. **SP-017: Workspace Rules Reinforcement & Prompt Injection**
   - Implement reinforcement algorithm, retrieval ordering, prompt context integration
   - Add POST /api/rules and GET /api/rules endpoints
   - Core feature already in use (repository exists)
   - Dependencies: SP-003 ✅, SP-005 ✅
   - Status: TBD, 0%

3. **SP-011: Background Jobs (GC, Purge)**
   - Transient session GC (24h), soft delete purge (90d)
   - Prevents database bloat, operational necessity before production
   - Dependencies: SP-010 ✅
   - Status: TBD, 0%

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
