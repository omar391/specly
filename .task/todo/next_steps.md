# Next Steps (as of 2025-09-08)

Focus: SP-008 Task & Session Model Upgrade (cut over to Specly tables), then SP-016 dependencies

Status: In progress
- Minimal SP-016 slice shipped: GET single task and PATCH status endpoints implemented with validation and tests; full suite green (172/172).

Immediate next actions:
1) SP-008: Migrate API to Specly task model (tasks)
   - Switch `WorkspaceDatabaseService` from legacy `tasks` to new `tasks` schema
   - Update `TasksController` to Specly statuses: queued|in_progress|awaiting_input|blocked|paused|completed|failed
   - Ensure completed_at set on transition to completed; clear on revert (if allowed)
   - Update existing tests to new statuses and add minimal negative transition tests
   - Acceptance: no references to legacy `tasks` remain; suite green
2) SP-016: Implement dependencies endpoints on `task_dependencies`
   - POST /api/workspaces/:id/tasks/:taskId/dependencies { depends_on: string }
   - DELETE /api/workspaces/:id/tasks/:taskId/dependencies/:dependsOn
   - Enforce: no self-dependency, no cycles, idempotent add, 404 on missing tasks
   - Tests: create chain A->B->C, reject A->A, reject cycle C->A, delete dependency
   - Enforce blocked→in_progress invalid until dependencies resolved
3) Documentation & cleanup
   - api-design.md stays Specly; remove any stale legacy references encountered
   - After SP-008 verified, drop any legacy task tables in programmatic migration
   - Update `.task/todo/current.md` progress as endpoints land

Deferred follow-ups:
- Sessions listing endpoint under SP-016 scope
- Pagination and filtering for tasks list
