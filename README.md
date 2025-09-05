# TaskPilot MCP Server

A comprehensive Model Context Protocol server for task management, project documentation, and development workflow automation. TaskPilot provides an integrated solution combining MCP protocol support, REST API, and web UI in a single unified server.

## 🚀 Quick Start

### Installation

```bash
git clone <repository-url>
cd taskpilot-mcp
npm install
npm run build
```

### Launch Integrated Server

```bash
# Start on default port 8989
npm run serve

# Or specify custom port
npm start -- --port=9000

# For development with TypeScript watch mode
npm run dev
```

**Access Points:**
- **Web UI**: http://localhost:8989/
- **REST API**: http://localhost:8989/api/
- **Health Check**: http://localhost:8989/health
- **MCP**: http://localhost:8989/mcp

## 🏗️ Architecture

TaskPilot runs as a unified server supporting multiple interaction modes:

### 1. MCP Protocol Support
- **STDIO Mode**: Full compatibility with MCP clients (Claude Desktop, etc.)
- **HTTP/SSE Mode**: Server-Sent Events transport for web-based MCP clients
- **All 11 Tools Available**: Complete feature parity across both transports

### 2. REST API
- **Workspace Management**: `/api/workspaces`
- **Task Operations**: `/api/workspaces/{id}/tasks`
- **Unified Tool Execution**: `POST /api/tools/{tool}/execute` (start or resume inferred) (replaces legacy tool-flows & feedback-steps)

### 3. Web UI
- **React-based Dashboard**: Modern interface for task management
- **Real-time Updates**: SSE integration for live task status
- **SPA Routing**: Full client-side navigation support

## 🛠️ Usage Modes

### MCP Client Integration (STDIO)

For Claude Desktop and other MCP clients:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "taskpilot": {
      "command": "/path/to/taskpilot-mcp/build/index.js",
      "args": ["--stdio"]
    }
  }
}
```

### Direct Command Line Usage

```bash
# STDIO mode (for MCP clients)
node build/index.js --stdio

# HTTP mode with custom port
node build/index.js --port=8989

# Development mode (additional logging)
node build/index.js --port=8989 --dev

# Show help
node build/index.js --help
```

## 📋 Available Tools

TaskPilot provides 11 comprehensive tools for project management:

1. **`taskpilot_init`** - Initialize workspace with .task folder structure
2. **`taskpilot_start`** - Begin TaskPilot session with project context
3. **`taskpilot_add`** - Orchestrate task creation with validation
4. **`taskpilot_create_task`** - Create validated tasks
5. **`taskpilot_status`** - Generate project status reports
6. **`taskpilot_update`** - Update task properties with audit trails
7. **`taskpilot_audit`** - Perform comprehensive project audits
8. **`taskpilot_focus`** - Focus on specific tasks with context
9. **`taskpilot_github`** - GitHub integration for issues and PRs
10. **`taskpilot_rule_update`** - Manage workspace-specific rules
11. **`taskpilot_remote_interface`** - External system integrations

## 🔧 Development

### Build Process

```bash
# Full build (TypeScript + UI)
npm run build

# TypeScript watch mode
npm run dev

# UI development (separate terminal)
cd ui && npm run dev
```

### Project Structure

```
.
├── src/                  # TypeScript source code
│   ├── tools/           # MCP tool implementations
│   ├── services/        # Core business logic
│   ├── database/        # Drizzle ORM setup
│   ├── server/          # Express server integration
│   ├── utils/           # Utility functions
│   └── api/             # REST API endpoints
├── ui/                  # React web interface
│   ├── src/             # React components
│   └── dist/            # Built UI assets
├── build/               # Compiled JavaScript
└── .task/               # TaskPilot workspace data
    ├── todo/            # Task tracking
    ├── rules/           # Workspace rules
    └── project.md       # Project documentation
```

### Database
### Seeding (Specly Baseline)

On startup the server automatically seeds the Specly baseline (specs, tools, root profile, workspace bindings) if it detects the root profile is missing.

Force a re-seed on startup using either:

```bash
TASKPILOT_FORCE_SEED=1 npm run serve
# or
node build/index.js --force-seed
```

Manual ad-hoc seed (idempotent – creates only what is missing):

```bash
npm run seed:specly
```

Successful initial or forced seeding emits a single JSON line:

```json
{"event":"specly_seed_summary","timestamp":"2025-09-03T00:00:00.000Z","specsCreated":2,"toolVersionsCreated":2,"profileCreated":true,"profileVersionsCreated":1,"toolsAttached":2,"workspaceBindings":1,"createdSpecHashes":["..."],"createdToolVersionHashes":["..."],"forced":false}
```

Subsequent runs (without force) produce no output unless new workspaces require binding.


TaskPilot uses SQLite with Drizzle ORM:
- **Global Database**: `~/.taskpilot/global.db`
- **Workspace Database**: `.task/workspace.db` (per project)
- **Schema**: Fully managed through TypeScript types

## 🚀 Deployment

### Local Deployment

```bash
npm run build
npm run serve
```

### Production Configuration

1. **Environment Variables**:
   ```bash
   NODE_ENV=production
   TASKPILOT_PORT=8989
   TASKPILOT_HOST=0.0.0.0
   ```

2. **Process Management**:
   ```bash
   # Using PM2
   pm2 start build/index.js --name "taskpilot" -- --port=8989
   
   # Using systemd (create service file)
   sudo systemctl enable taskpilot
   sudo systemctl start taskpilot
   ```

3. **Reverse Proxy** (nginx example):
   ```nginx
   server {
       listen 80;
       server_name taskpilot.example.com;
       
       location / {
           proxy_pass http://localhost:8989;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## 🔍 Troubleshooting

### Port Conflicts

TaskPilot automatically detects and resolves port conflicts:

```bash
# Check what's using port 8989
lsof -i :8989

# TaskPilot will automatically kill existing processes
npm run serve  # Auto-cleanup enabled
```

### STDIO Mode Issues

```bash
# Test STDIO directly
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node build/index.js --stdio

# Expected: JSON response with 11 tools
```

### HTTP Mode Issues

```bash
# Health check
curl http://localhost:8989/health

# Expected: {"status":"healthy",...}
```

### Database Issues

```bash
# Reset global database
rm ~/.taskpilot/global.db
npm run serve  # Auto-recreates

# Reset workspace database
rm .task/workspace.db
# Run taskpilot_init tool to recreate
```

## 📚 Documentation

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `--stdio` | STDIO mode for MCP clients | `node build/index.js --stdio` |
| `--port=N` | HTTP mode on port N | `node build/index.js --port=8989` |
| `--http` | Force HTTP mode (default) | `node build/index.js --http` |
| `--dev` | Development mode | `node build/index.js --dev` |
| `--help` | Show help | `node build/index.js --help` |
| `--no-kill` | Don't kill existing processes | `node build/index.js --no-kill` |

### API Reference

**Base URL**: `http://localhost:8989/api`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/workspaces` | GET | List all workspaces |
| `/workspaces/{id}/tasks` | GET, POST | Manage tasks |
| `/workspaces/{id}/tasks/{taskId}` | PUT | Update specific task |
| `/tools/{tool}/execute` | POST | Start execution (graph provided) or resume (resumeToken provided) |

Legacy endpoints `/tool-flows` and `/feedback-steps` have been removed (404). Use the unified execute endpoint.

#### Unified Execute Endpoint

Run (start new execution):
```bash
curl -X POST "http://localhost:8989/api/tools/specly_execute/execute" \
  -H 'Content-Type: application/json' \
  -d '{
    "graph": {
      "entry": "specA",
      "nodes": {
        "specA": {"intent": "autonomous"},
        "specHuman": {"intent": "human"},
        "specB": {"intent": "autonomous"}
      },
      "edges": [
        {"from": "specA", "to": "specHuman"},
        {"from": "specHuman", "to": "specB"}
      ]
    }
  }'
```

Possible Paused Response:
```json
{
  "status": "awaiting_input",
  "awaitingSpec": "specHuman",
  "resumeToken": "abc123",
  "executed": ["specA"],
  "results": {"specA": {"status": "completed"}}
}
```

Resume after providing human output:
```bash
curl -X POST "http://localhost:8989/api/tools/specly_execute/execute" \
  -H 'Content-Type: application/json' \
  -d '{
    "resumeToken": "abc123",
    "human_input": {"specHash": "specHuman", "output": {"text": "Ok, proceed"}},
    "graph": {
      "entry": "specA",
      "nodes": {
        "specA": {"intent": "autonomous"},
        "specHuman": {"intent": "human"},
        "specB": {"intent": "autonomous"}
      },
      "edges": [
        {"from": "specA", "to": "specHuman"},
        {"from": "specHuman", "to": "specB"}
      ]
    }
  }'
```

Completion Response:
```json
{
  "status": "completed",
  "executed": ["specA", "specHuman", "specB"],
  "results": { /* per spec statuses */ }
}
```

Error Mapping (current):
| Error Code | HTTP | Meaning |
|------------|------|---------|
| GRAPH_CYCLE | 422 | Cycle or self-loop detected |
| GRAPH_MISSING_NODE | 422 | Edge references missing node |
| LEASE_ACQUIRE_FAILED | 409 | Session ownership conflict |
| LEASE_RENEW_FAILED | 409 | Session lease renewal failed |
| RESUME_TOKEN_INVALID | 404 | Resume token not found or expired |
| ROUTE_DEAD_END | 500 | No executable path forward (unexpected dead-end) |
| EXECUTOR_FAILED | 500 | Tool execution runtime failure |
| (other) | 500 | Unclassified internal error |
| (none) | 200 | Completed or awaiting_input (success path) |

`tool_version_id` path is active: sending only that field (without graph or resumeToken) executes the persisted manifest. If both `graph` and `tool_version_id` are supplied the explicit `graph` wins. Supplying deprecated `mode` query param returns 400.

### Tool Schema

All tools accept JSON parameters and return structured responses:

```typescript
interface ToolResult {
  content: Array<{type: "text", text: string}>;
  isError: boolean;
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Build and test: `npm run build && npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 🧪 Testing

TaskPilot includes comprehensive test coverage with **114/114 tests passing (100% success rate)** (17 test files):

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

**Test Suites (representative breakdown):**
- ✅ **Instance Manager Integration**: 23/23 – process management, port conflict handling, multi-instance orchestration
- ✅ **Spec Engine Planning & Execution**: 8 (planner + execution loop)
- ✅ **Graph Validation**: 8 – structural invariants & normalization
- ✅ **Repository & Persistence**: 5 repository + 8 persistence + 3 seed + 2 schema + 2 specly-core schema (multiple files, total 20)
- ✅ **CLI & Tooling**: 17 cli + 4 base tool + 1 multi-step legacy + 1 tool-flow executor + 8 next-step generator (31) – legacy multi-step slated for removal
- ✅ **Hashing & Golden Vectors**: 4 hash + 2 golden (6)
- ✅ **Workspace Schema Investigations**: 3 – introspection & table guarantees
  (All remaining single-purpose investigative tests included in totals.)

**Test Environment:** Automated in-memory SQLite database with proper environment detection ensures isolated test runs.

### Test Environment (Specly Migration Note)
During the ongoing Specly migration some tests rely on the native `better-sqlite3` module. Running the suite with Bun currently triggers an ABI / symbol mismatch (e.g. "Module did not self-register" or similar native load error). Use Node + Vitest via `npm test` until we explicitly add Bun support.

Known symptoms when using Bun (do not open an issue – switch to Node):
- Native module load failure referencing `better-sqlite3`
- `vi.mock is not a function` due to mismatched test environment shims

Recommended commands:
```bash
npm install
npm test
```

Transitional API Note: Legacy tool-flow & feedback-step endpoints have been removed. This README now reflects the unified execution model; additional spec/tool/profile endpoints will arrive with SP-014/015 tasks. A broader docs overhaul remains scheduled under SP-201.

## 📄 License

[Add your license information here]

## 🆕 Migration from Separate Servers

If migrating from a setup with separate MCP and UI servers:

1. **Update MCP Client Config**: Change to single server endpoint
2. **Update API Calls**: Base URL is now `/api` instead of separate port
3. **Port Configuration**: Single port (8989) instead of multiple ports
4. **Process Management**: Single process instead of multiple services

---

**Built with**: TypeScript, Express, Drizzle ORM, React, MCP SDK
