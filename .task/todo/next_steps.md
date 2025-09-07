# Next Steps (as of 2025-09-07)

These steps focus on SP-018 maturity first, then SP-002 optimization and SP-200 golden maintenance.

1. Dead-end runtime classification review (SP-018)
   - Verify explicit ROUTE_DEAD_END assertion in existing SpecEngine tests; add a focused test if shallow or missing.
   - Ensure HTTP mapping remains 500 for runtime dead-ends.

2. Public validation error mapping utility (SP-018)
   - Create small helper (e.g., `src/utils/graph-error-map.ts`) mapping GraphValidationError codes → public API codes (`GRAPH_CYCLE`, `GRAPH_MISSING_NODE`, `GRAPH_INVALID`).
   - Refactor SP-014 publish endpoints to use this utility for consistent translation.

3. Documentation updates (SP-018)
   - Update `docs/specly-architecture.md` (§7, §13) with normalization guarantees (edge ordering, default priority) and error mapping table.
   - Add short pointer in README to the architecture sections.

4. Normalization guarantee tests (SP-018)
   - Add/extend tests to assert deterministic edge ordering & default priority fill affect hashing predictably.
   - Confirm unreachable-spec rejection tests are explicit and non-ambiguous.

5. Progress tracking update (SP-018)
   - After implementing steps 1–4, update `docs/task.md` SP-018 progress to ~65–70% with revised remaining items.

6. (Optional) CLI sanity deferral linkage
   - Note that CLI refactor work (SP-007) should consume the validated graph contracts; keep any CLI sanity checks deferred to SP-007 to avoid churn.
