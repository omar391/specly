# Next Steps (as of 2025-09-08)

Focus: SP-016 Task & Dependency API Endpoints (minimal slice complete; continue with dependencies)

Status: In progress
- Minimal slice shipped: GET single task and PATCH task status endpoints implemented with validation and tests; full suite green (172/172).

Immediate next actions:
1) Implement dependencies endpoints
   - POST /api/workspaces/:id/tasks/:taskId/dependencies { depends_on: string }
   - DELETE /api/workspaces/:id/tasks/:taskId/dependencies/:dependsOn
   - Enforce: no self-dependency, no cycles, idempotent add, 404 on missing tasks
   - Tests: create chain A->B->C, reject A->A, reject cycle C->A, delete dependency
2) Extend status validation
   - Blocked transitions: blocked→in_progress invalid until dependencies resolved
   - Ensure done sets completed_at, reverting from done clears completed_at (if allowed)
   - Add tests for negative transitions and timestamp behavior
3) Documentation
   - Update api-design.md with GET single task and PATCH status sections (added now), and add dependencies endpoints once implemented
4) Tracker & docs hygiene
   - Update .task/todo/current.md progress as endpoints land
   - Keep examples in api-design.md synced

Deferred follow-ups:
- Sessions listing endpoint under SP-016 scope
- Pagination and filtering for tasks list
