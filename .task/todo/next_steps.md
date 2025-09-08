# Next Steps (as of 2025-09-08)

Focus: SP-002 Hashing & Canonicalization Optimization

Status: Completed in this cycle
- Implemented in-memory LRU cache with env knob TASKPILOT_HASH_CACHE_SIZE (default 500)
- Wired into `stableHash`, `hashSpec`, `hashToolVersion`
- Added tests verifying hit/miss and determinism (`src/__tests__/hash-cache.test.ts`)

Follow-ups (small, optional):
1. Observability integration:
   - Plumb `hash_cache_hits/misses` into MetricsCollector and expose via health endpoint (ties to SP-012)
2. Micro-benchmark script (optional dev-only) to compare cached vs uncached

Next primary focus candidates:
- SP-007 CLI Refactor (remove stepId; point CLI to unified execute) [Medium]
- SP-015 Profile & Workspace Binding Endpoints [High]

Upcoming SP-015 steps (incremental):
1) [Completed] Add explicit profile publish helper (attach tools to a new version) and tests for attachments + duplicate prevention.
2) [Completed] Validate parent_profile_version_id existence, enforce same-profile constraint, and add cycle detection (422 mapping in controller). Tests added and green.
3) [Completed] Extend GET /api/workspaces/:id/profile to include resolved profile name and version number via join for UI.
4) [Completed] Add POST /api/profiles/:profile/versions/:version/publish (validation-only publish). Route wired, controller added, integration tests passing.
