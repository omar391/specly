# TaskPilot UI Integration API Design

Note: Legacy TaskPilot task schema is deprecated. This document now reflects Specly’s new workspace schema (tasks_new, task_dependencies, sessions_new). Any references to the old `tasks` table are superseded by this design and will be removed during SP-008.

## Overview
This document defines the minimal REST API endpoints required for TaskPilot UI integration, based on analysis of UI pages: home, tasks, tool-flows, and feedback-steps.

## API Design Principles
- **Minimal endpoint set**: Target 6 core endpoints to avoid bloat
- **Resource-based URLs**: Follow RESTful conventions
- **Consistent response format**: Standardized JSON structure
- **Efficient data fetching**: Single endpoints return complete data needed per page
- **Real-time updates**: SSE events for dynamic content
- **On-demand expansion**: Audit during integration to add missing endpoints

## Core REST Endpoints

### 1. GET /api/workspaces
**Purpose**: List all workspaces with summary information
**Used by**: Home page
**Response**:
```json
{
  "workspaces": [
    {
      "id": "uuid",
      "name": "string",
      "path": "string", 
      "status": "connected|disconnected|error",
      "last_activity": "ISO8601",
      "task_count": "number",
      "active_task": "string|null",
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ]
}
```

### 2. GET /api/workspaces/{id}/tasks
Purpose: Get all tasks for a workspace with filtering (Specly status model)
Used by: Tasks page
Query params: `status=current|history`, `limit`, `offset`
Response:
```json
{
  "tasks": [
    {
      "id": "string",
      "title": "string",
      "description": "string|null",
      "priority": "high|medium|low",
      "status": "queued|in_progress|awaiting_input|blocked|paused|completed|failed",
      "progress": "number",
      "notes": "string|null",
      "blocked_reason": "string|null",
      "profile_version_id": "string|null",
      "deleted_at": "ISO8601|null",
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "completed_at": "ISO8601|null"
    }
  ],
  "workspace": {
    "id": "string",
    "name": "string",
    "path": "string"
  },
  "total": "number",
  "page": "number"
}
```

### 3. POST /api/tools/{tool}/execute
**Purpose**: Unified execution (start or resume) of a tool version graph via SpecEngine.

Execution intent is inferred:
- Provide `graph` (and no `resumeToken`) → start new run.
- Provide `resumeToken` + `human_input` (+ `graph` until persistence added) → resume paused run.
`mode` query param has been removed (was `run|resume`). Supplying it now returns HTTP 400.

Request Body (start new run):
```json
{
  "graph": {
    "entry": "specHash",
    "nodes": {
      "specHash": { "intent": "human|autonomous", "...": "(additional fields pass-through)" }
    },
    "edges": [ { "from": "specHash", "to": "specHash", "result_code": "string?" } ]
  },
  "tool_version_id": "uuid(optional – future path)",
  "session": { "id": "string(optional)", "client_id": "string(optional)", "force": false }
}
```

Validation Rules:
- Must supply `graph` OR `tool_version_id` (both allowed; if both present `graph` takes precedence). When `tool_version_id` provided server resolves stored graph manifest.
- `graph.entry` must exist in `graph.nodes`
- Minimal structural subset validated; full normalization handled upstream when persisted

Successful Autonomous Completion Response (200):
```json
{
  "status": "completed",
  "executed": ["specHash1", "specHash2"],
  "results": { "specHash1": {"status": "completed"}, "specHash2": {"status": "completed"} },
  "warnings": []
}
```

Paused (Awaiting Human) Response (200):
```json
{
  "status": "awaiting_input",
  "awaitingSpec": "specHashHuman",
  "resumeToken": "opaque-token",
  "executed": ["specHash1"],
  "results": { "specHash1": {"status": "completed"} },
  "warnings": []
}
```

Structural Error (422):
```json
{
  "status": "failed",
  "error": { "code": "GRAPH_CYCLE", "message": "Graph contains cycle" }
}
```

Tool Version Path (Resolved): supply only `tool_version_id` to execute latest stored manifest without resending graph.

Resume Run:

Request Body (resume):
```json
{
  "resumeToken": "opaque-token",
  "human_input": { "specHash": "specHashHuman", "output": { "text": "User answer" } },
  "graph": { /* same structure as run - required until persistence added */ },
  "session": { "id": "string(optional)", "client_id": "string(optional)", "force": false }
}
```

Invalid / Missing Token (404):
```json
{ "error": { "message": "resumeToken not found" } }
```

Successful Resume Completion (200):
```json
{
  "status": "completed",
  "executed": ["specHash1", "specHashHuman", "specHash2"],
  "results": { /* statuses for each spec */ },
  "warnings": []
}
```

Error Code → HTTP Mapping (current):
| Engine Error Code | HTTP Status | Notes |
|-------------------|-------------|-------|
| GRAPH_CYCLE | 422 | Includes self-loop & cycle detection |
| GRAPH_MISSING_NODE | 422 | Missing referenced spec in edges |
| LEASE_ACQUIRE_FAILED | 409 | Session ownership conflict |
| LEASE_RENEW_FAILED | 409 | Lost ownership during renewal |
| RESUME_TOKEN_INVALID | 404 | Stale or already-used resume token |
| ROUTE_DEAD_END | 500 | Dead-end encountered with remaining outgoing edges |
| (EXECUTOR_FAILED / other runtime) | 500 | Autonomous executor failure or unspecified runtime error |

Response Envelope Fields:
- `status`: `completed | awaiting_input | failed`
- `executed`: ordered list of spec hashes that have run
- `results`: per-spec execution metadata (subject to expansion)
- `awaitingSpec`: present only when `status=awaiting_input`
- `resumeToken`: present only when `status=awaiting_input`
- `error`: optional `{ code, message }` when failure detected

Planned Enhancements:
- Persisted `tool_version_id` resolution (removes need to send `graph` on run/resume)
- Extended error mapping (LEASE_RENEW_FAILED, ROUTE_DEAD_END, RESUME_TOKEN_INVALID)
- Richer `results` detail (timings, result codes)

Backward Compatibility: Legacy `/tool-flows` and `/feedback-steps` endpoints have been removed (404). Previous `mode` parameter removed—clients updated to rely on `resumeToken` presence.

### 3a. GET /api/workspaces/{id}/profile
Purpose: Fetch the workspace's currently bound profile version (enriched for UI)
Used by: Profile badge/info in UI

Response (200):
```json
{
  "workspace_id": "w1",
  "profile_version_id": "pv_123",
  "pinned_at": "2025-09-08T18:10:00.000Z",
  "profile_name": "bindprof",
  "version": 2
}
```

Errors:
- 404 when the workspace has no bound profile: `{ "error": "workspace profile not bound", "workspaceId": "w1" }`

Notes:
- `profile_name` and `version` are included for UI convenience via a join; no extra round-trip needed.

### 3b. POST /api/profiles/{profile}/versions/{version}/publish
Purpose: Validate and finalize a profile version for use (validation-only in current model)
Used by: Admin/Publishing UI

Request Body:
```json
{}
```

Response (200):
```json
{ "profile": "pub", "version": 1, "published": true }
```

Errors:
- 404 when profile or version not found: `{ "error": "profile version not found", "profile": "pub", "version": 99 }`
- 400 when path params invalid: `{ "error": "profile and numeric version required" }`

Notes:
- There is no persisted publish state yet; this endpoint serves as a validation gate and future hook. It ensures the target profile/version exist.

### 4. POST /api/workspaces/{id}/tasks
Purpose: Create new task (Specly model)
Used by: Tasks page (new task button)
Request body:
```json
{
  "title": "string",
  "description": "string",
  "priority": "high|medium|low",
  "profile_version_id": "string(optional)"
}
```
Response:
```json
{
  "task": {
    "id": "string",
    "title": "string",
    "description": "string",
    "priority": "high|medium|low",
    "status": "queued",
    "progress": 0,
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

### 4a. GET /api/workspaces/{id}/tasks/{taskId}
Purpose: Fetch a single task by id within a workspace (Specly model)
Used by: Task details view / drill-in

Response (200):
```json
{
  "task": {
    "id": "string",
    "title": "string",
    "description": "string|null",
    "priority": "high|medium|low",
    "status": "queued|in_progress|awaiting_input|blocked|paused|completed|failed",
    "progress": 0,
    "notes": "string|null",
    "blocked_reason": "string|null",
    "profile_version_id": "string|null",
    "deleted_at": "ISO8601|null",
    "created_at": "ISO8601",
    "updated_at": "ISO8601",
    "completed_at": "ISO8601|null"
  }
}
```

Errors:
- 404 when task not found in workspace: `{ "error": "task not found", "taskId": "TP-xyz" }`

### 4b. PATCH /api/workspaces/{id}/tasks/{taskId}/status
Purpose: Update only the task status (Specly model). Enforces allowed transitions and sets completed_at on completion.
Used by: Status dropdown in Tasks page

Request body:
```json
{ "status": "queued|in_progress|awaiting_input|blocked|paused|completed|failed" }
```

Response (200):
```json
{
  "task": { "id": "string", "status": "in_progress", "updated_at": "ISO8601", "completed_at": null }
}
```

Validation rules (Specly model outline):
- Example allowed transitions (finalized under SP-008):
  - queued → in_progress | blocked | paused
  - in_progress → awaiting_input | blocked | paused | completed | failed
  - awaiting_input → in_progress | paused
  - blocked → in_progress | paused
  - paused → in_progress | blocked
  - completed → (no forward transitions)
  - failed → (optional) queued | in_progress
- Setting `completed` sets `completed_at` to now; other transitions update `updated_at` only. Reverting from `completed` clears `completed_at` if allowed.

Errors:
- 422 on invalid transition with message: `Invalid status transition: {from} -> {to}`
- 404 when task not found.

### 5. PUT /api/workspaces/{id}/tasks/{taskId}
**Purpose**: Update task properties
**Used by**: Tasks page (task updates)
**Request body**:
```json
{
  "field": "title|description|priority|status|progress|notes",
  "value": "string|number",
  "reason": "string"
}
```
**Response**:
```json
{
  "task": {
    "id": "string",
    "updated_at": "ISO8601",
    "[field]": "updated_value"
  }
}
```

## Server-Sent Events (SSE)

### SSE Endpoint: /api/events
**Purpose**: Real-time updates for UI components
**Event types**:

#### workspace.status_changed
```json
{
  "type": "workspace.status_changed",
  "data": {
    "workspace_id": "string",
    "status": "connected|disconnected|error",
    "last_activity": "ISO8601"
  }
}
```

#### task.updated
```json
{
  "type": "task.updated", 
  "data": {
    "workspace_id": "string",
    "task": {
      "id": "string",
      "status": "string",
      "progress": "number",
      "updated_at": "ISO8601"
    }
  }
}
```

#### task.created
```json
{
  "type": "task.created",
  "data": {
    "workspace_id": "string", 
    "task": {
      "id": "string",
      "title": "string",
      "status": "string",
      "created_at": "ISO8601"
    }
  }
}
```

## Error Response Format
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": "object|null"
  }
}
```

### SpecEngine Error Codes (Consolidated)
Central reference for current and planned SpecEngine error codes surfaced via the unified execute endpoint.

| Code | Category | Description | HTTP | Retry Guidance |
|------|----------|-------------|------|----------------|
| GRAPH_CYCLE | Structural | Cycle or self-loop detected in provided graph | 422 | Fix graph definition |
| GRAPH_MISSING_NODE | Structural | Edge references a node not declared in `nodes` | 422 | Fix manifest |
| EXECUTOR_FAILED | Runtime | Autonomous executor threw an exception | 500 | Investigate; retry depends on idempotency |
| LEASE_ACQUIRE_FAILED | Runtime | Session ownership conflict (another client holds lease) | 409 | Retry with `force` or after releasing |
| LEASE_RENEW_FAILED | Runtime | Lease renewal failed mid-run | 409 | Re-run after ownership clarification |
| ROUTE_DEAD_END | Runtime | No valid transition despite outgoing edges | 500 | Inspect routing/graph definition |
| RESUME_TOKEN_INVALID | Runtime | Resume token stale, mismatched, or reused | 404 | Refetch state & resume again |

Legend: * denotes codes defined in engine design but not yet surfaced through HTTP mapping in this iteration; mapping will be finalized alongside SP-019 / SP-010 tasks.


## Status Codes
- `200` - Success
- `201` - Created  
- `400` - Bad Request
- `404` - Not Found
- `422` - Validation Error
- `500` - Internal Server Error

## Implementation Notes

### Database Mapping
- **Global data**: Use global database (`~/.taskpilot/global.db`)
- **Workspace data**: Use workspace database (`{workspace}/.taskpilot/task.db`)
- **Cross-database queries**: Use DatabaseService for coordinated access

### Caching Strategy
- **Workspaces list**: Cache for 30 seconds
- **Tasks**: Cache invalidated on updates
- **Tool flows/feedback steps**: Cache until modified

### Rate Limiting
- **GET endpoints**: 100 requests/minute per client
- **POST/PUT endpoints**: 30 requests/minute per client
- **SSE connections**: 5 concurrent connections per client

### Authentication
- **Development**: No authentication required
- **Production**: Token-based authentication when deployed

### CORS Configuration
- **Origins**: `http://localhost:*` for development
- **Methods**: `GET, POST, PUT, DELETE, OPTIONS`
- **Headers**: `Content-Type, Authorization`

## Future Endpoints (On-Demand)
These endpoints may be added during UI integration if needed:

- `GET /api/workspaces/{id}/github-config` - GitHub integration settings
- `POST /api/workspaces/{id}/tool-flows` - Create custom tool flow
- `DELETE /api/workspaces/{id}/tasks/{taskId}` - Delete task
- `GET /api/workspaces/{id}/remote-interfaces` - Remote integrations
- `POST /api/workspaces/{id}/feedback-steps` - Create workspace feedback step
- `GET /api/health` - Server health check (already implemented)

## OpenAPI Specification
A complete OpenAPI 3.0 specification will be generated automatically from the implemented endpoints using swagger-jsdoc and served at `/api/docs`.

## Implementation Priority
1. **Phase 1**: Endpoints 1-4 (read-only data)
2. **Phase 2**: Endpoints 5-6 (task creation/updates) 
3. **Phase 3**: SSE events for real-time updates
4. **Phase 4**: Additional endpoints based on integration needs
