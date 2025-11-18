# Specly MCP Server

A Model Context Protocol server for deterministic, hash-addressable multi-step automation. Specly provides immutable execution specs, versioned tool graphs, profile inheritance, and idempotent side-effect handling through an integrated MCP protocol, REST API, and web UI.

**Status**: Backend core complete (validation, execution, API endpoints). UI migration in progress.

## 🚀 Quick Start

### Installation

```bash
# Clone with submodules (recommended)
git clone --recurse-submodules <repository-url>
cd specly-mcp

# OR if already cloned without submodules
git clone <repository-url>
cd specly-mcp
make init-submodules  # or: git submodule update --init --recursive

# Install dependencies and build
pnpm install
pnpm build:all
```

**Note**: This repository uses `packages/mcp-kit` as a git submodule. You must initialize submodules after cloning, or clone with `--recurse-submodules` flag.

### Launch Integrated Server

```bash
# Build and start server on default port 8989
pnpm serve

# For development with TypeScript watch mode and UI hot reload
pnpm dev

# Or run server/UI separately
pnpm dev:server  # Server only
pnpm dev:ui      # UI only
```

**Access Points:**
- **Web UI**: <http://localhost:8989/>
- **REST API**: <http://localhost:8989/api/>
- **Health Check**: <http://localhost:8989/health>
- **MCP**: <http://localhost:8989/mcp>

## 🏗️ Architecture

Specly is built on three core concepts:

### 1. Hash-Addressable Specs
- **Immutable Definitions**: Each spec is content-addressed by hash
- **Deterministic Execution**: Same spec + input = same execution path
- **Profile Inheritance**: Workspaces bind to profiles which reference tool versions

### 2. Versioned Tool Graphs
- **DAG Structure**: Tool versions define directed acyclic graphs of spec execution
- **Validation**: Cycles, unreachable nodes, and invalid transitions rejected at publish time
- **Normalized Hashing**: Sorted edges ensure consistent graph hashes

### 3. Unified Execution Model
- **Single Endpoint**: `POST /api/tools/{tool}/execute` for all execution modes
- **Session Leases**: Ownership tracking prevents concurrent modification conflicts
- **Action Journal**: Idempotent side-effects with replay capability

### 4. Security & Validation
- **Executor Type Whitelist**: Only approved executor types (`function`, `bash`, `rest`, `graphql`, `noop`, `node`) accepted
- **Content Size Limits**: Configurable max sizes for spec content, input/output schemas
- **Graph Constraints**: Maximum depth and node count enforced on tool version creation
- **Command Alias Uniqueness**: Pre-checked globally to prevent collisions
- **Schema Validation**: Comprehensive validation with detailed error messages

See [`docs/specly-architecture.md`](./docs/specly-architecture.md) for detailed design documentation.

## 🛠️ Usage Modes

### Direct Command Line Usage

```bash
# HTTP mode (default, port 8989)
node build/index.js

# Custom port
node build/index.js --port=9000

# Force re-seed baseline specs/tools
node build/index.js --force-seed

# Development mode (additional logging)
node build/index.js --dev

# Show help
node build/index.js --help
```

### MCP Client Integration (STDIO)

**Note**: MCP STDIO support retained but primary focus is REST API for UI integration.

For Claude Desktop:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "specly": {
      "command": "/path/to/specly-mcp/build/index.js",
      "args": ["--stdio"]
    }
  }
}
```

## 🔄 Core Workflow

Specly uses a unified execution model via `POST /api/tools/{tool}/execute`:

```bash
# Create a spec (hash-addressable definition)
curl -X POST http://localhost:8989/api/specs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "create_user",
    "steps": [
      {"tool": "validate_email", "args": {"email": "{{input.email}}"}},
      {"tool": "hash_password", "args": {"password": "{{input.password}}"}},
      {"tool": "insert_user", "args": {"email": "{{input.email}}", "hash": "{{step1.output}}"}}
    ]
  }'

# Publish a tool version (versioned graph node)
curl -X POST http://localhost:8989/api/tools/create_user/versions \
  -H "Content-Type: application/json" \
  -d '{"specHash": "3a7f8...", "version": "1.0.0", "edges": []}'

# Execute the tool
curl -X POST http://localhost:8989/api/tools/create_user/execute \
  -H "Content-Type: application/json" \
  -d '{"input": {"email": "user@example.com", "password": "secret123"}}'
```

See [`docs/api-design.md`](./docs/api-design.md) for complete API reference.

## 🔧 Development

### Build Process

```bash
# Build all packages (mcp-kit, specly-server, specly-ui)
pnpm build:all

# Build individual packages
pnpm build:server
pnpm build:ui
pnpm build:mcp-kit

# Development with watch mode
pnpm dev           # Server + UI with hot reload
pnpm dev:server    # Server only
pnpm dev:ui        # UI only

# Nx graph visualization
pnpm graph
```

### Monorepo Structure

```text
.
├── packages/
│   ├── mcp-kit/              # 📦 Git submodule → github.com/omar391/mcp-kit
│   │   ├── src/              # Universal MCP toolkit (published independently)
│   │   │   ├── client.ts     # MCP client utilities
│   │   │   ├── server/
│   │   │   │   ├── core/     # 🌍 Universal Hono-based MCP core
│   │   │   │   │   ├── hono-mcp.ts    # Universal MCP server
│   │   │   │   │   ├── handlers.ts    # Type-safe tool handlers
│   │   │   │   │   ├── middleware.ts  # MCP protocol middleware
│   │   │   │   │   ├── runtime.ts     # Runtime detection
│   │   │   │   │   └── types.ts       # Shared types
│   │   │   │   ├── local/    # 🖥️  Node.js/Bun specific features
│   │   │   │   │   ├── node-instance/     # Multi-instance coordination
│   │   │   │   │   └── port-manager.ts    # Port management
│   │   │   │   ├── handlers.ts # Tool handler utilities
│   │   │   │   └── stdio.ts   # STDIO transport
│   │   │   └── index.ts       # Server exports
│   │   └── dist/              # Multi-target builds (universal/node/browser)
│   └── specly-server/        # 🖥️  Specly MCP server application
│   │   ├── src/
│   │   │   ├── api/          # REST API endpoints
│   │   │   ├── services/     # SpecEngine, validators, journal
│   │   │   ├── database/     # Drizzle ORM + migrations
│   │   │   ├── repositories/ # Data access layer
│   │   │   ├── server/       # Instance manager + Express setup
│   │   │   ├── tools/        # MCP tools (init, add, focus, etc.)
│   │   │   ├── utils/        # Hashing, graph validation
│   │   │   └── __tests__/    # 1688+ tests
│   │   └── dist/             # Compiled JavaScript
│   └── specly-ui/            # 🎨 React web interface
│       ├── src/              # React components & pages
│       └── dist/             # Built UI assets (served by main server)
├── docs/                     # 📚 Technical documentation
│   ├── specly-architecture.md
│   ├── mcp-kit-migration-v1.md  # 🚨 Breaking changes guide
│   └── task.md
└── pnpm-workspace.yaml       # Monorepo configuration
```

**Architecture Notes:**
- **Git Submodule**: `packages/mcp-kit` is a git submodule linked to [github.com/omar391/mcp-kit](https://github.com/omar391/mcp-kit)
  - Initialize submodules after cloning: `make init-submodules` or `git submodule update --init --recursive`
  - Update submodule to latest: `make update-submodules` or `git submodule update --remote`
  - See [Makefile](./Makefile) for submodule management commands
- **Universal Core**: `mcp-kit` now provides a Hono-based MCP server that works across all JavaScript runtimes
- **Runtime Detection**: Automatic detection of Node.js, Bun, Cloudflare Workers, Vercel Edge, etc.
- **Multi-Target Builds**: Separate optimized builds for universal, Node.js, and browser environments
- **Nx Orchestration**: Minimal Nx setup for coordinated builds across packages
- **pnpm Workspaces**: Shared dependencies with workspace protocol

### Database
### Seeding (Specly Baseline)

On startup the server automatically seeds the Specly baseline (specs, tools, root profile, workspace bindings) if it detects the root profile is missing.

Force a re-seed on startup using either:

```bash
SPECLY_FORCE_SEED=1 npm run serve
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


Specly uses SQLite with Drizzle ORM and programmatic migrations:
- **Database**: `~/.specly/specly.db`
- **Schema**: Fully managed through TypeScript types
- **Migrations**: Applied programmatically on startup (see `src/database/run-migrations.ts`)

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
   SPECLY_PORT=8989
   SPECLY_HOST=0.0.0.0
   
   # Security & validation limits (optional, defaults shown)
   SPECLY_MAX_SPEC_CONTENT_SIZE=1048576      # 1MB spec content limit
   SPECLY_MAX_INPUT_SCHEMA_SIZE=102400        # 100KB input schema limit
   SPECLY_MAX_OUTPUT_SCHEMA_SIZE=102400       # 100KB output schema limit
   SPECLY_MAX_GRAPH_DEPTH=50                   # Maximum graph depth from entry node
   SPECLY_MAX_GRAPH_NODES=1000                 # Maximum nodes per tool graph
   ```

2. **Garbage Collection & Retention** (optional, defaults shown):
   ```bash
   # Background job configuration
   SPECLY_GC_ENABLED=true                     # Enable/disable background jobs
   SPECLY_GC_TRANSIENT_SESSION_HOURS=24       # Hours before transient session cleanup
   SPECLY_GC_SOFT_DELETE_DAYS=90              # Days before soft-deleted entity purge
   ```
   
   GC runs hourly on the MAIN instance only:
   - **Transient Session GC**: Deletes sessions with no `task_id` after inactivity threshold
   - **Soft Delete Purge**: Hard deletes tasks/sessions marked `deleted_at` beyond retention period
   - **Metrics**: `specly_gc_transient_sessions_deleted_total`, `specly_gc_soft_delete_purged_total`

3. **Process Management**:
   ```bash
   # Using PM2
   pm2 start build/index.js --name "specly" -- --port=8989
   
   # Using systemd (create service file)
   sudo systemctl enable specly
   sudo systemctl start specly
   ```

4. **Reverse Proxy** (nginx example):
   ```nginx
   server {
       listen 80;
       server_name specly.example.com;
       
       location / {
           proxy_pass <http://localhost:8989>;
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

Specly automatically detects and resolves port conflicts:

```bash
# Check what's using port 8989
lsof -i :8989

# Specly will automatically kill existing processes
npm run serve  # Auto-cleanup enabled
```

### HTTP Mode Issues

```bash
# Health check
curl http://localhost:8989/health

# List all specs
curl http://localhost:8989/api/specs

# Check active sessions
curl http://localhost:8989/api/sessions

# Expected: {"status":"healthy",...}
```

### Database Issues

```bash
# Reset database (WARNING: destroys all data)
rm ~/.specly/specly.db
npm run serve  # Auto-recreates schema and seeds baseline
```

## 📚 Documentation

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `--stdio` | STDIO mode for MCP clients | `node build/index.js --stdio` |
| `--port=N` | HTTP mode on port N | `node build/index.js --port=8989` |
| `--http` | Force HTTP mode (default) | `node build/index.js --http` |
| `--dev` | Force development mode (overrides `NODE_ENV`) | `node build/index.js --dev` |
| `--help` | Show help | `node build/index.js --help` |
| `--no-kill` | Skip port cleanup; startup fails if port busy | `node build/index.js --no-kill` |
| `--force-seed` | Force re-seed of baseline specs/tools | `node build/index.js --force-seed` |

### API Reference

**Base URL**: `http://localhost:8989/api`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/specs` | GET, POST | Manage specs (hash-addressable definitions) |
| `/tools` | GET | List all tools |
| `/tools/{tool}/versions` | GET, POST | Manage tool versions |
| `/tools/{tool}/execute` | POST | Unified execute endpoint (start or resume) |
| `/workspaces` | GET, POST | Manage workspaces |
| `/workspaces/{id}/tasks` | GET, POST | Manage tasks |
| `/workspaces/{id}/profile/upgrade` | POST | Upgrade workspace profile |
| `/sessions` | GET | List active sessions |

See [`docs/api-design.md`](./docs/api-design.md) for complete endpoint documentation.

#### Execution Model

Specly uses a unified `POST /api/tools/{tool}/execute` endpoint that supports:
- **Start**: Provide `graph` to begin new execution
- **Resume**: Provide `resumeToken` + `human_input` to continue paused execution
- **Versioned**: Provide `tool_version_id` to execute persisted graph

**Error Codes:**

| Error Code | HTTP | Meaning |
|------------|------|---------|
| GRAPH_CYCLE | 422 | Cycle or self-loop detected |
| GRAPH_MISSING_NODE | 422 | Edge references missing node |
| LEASE_ACQUIRE_FAILED | 409 | Session ownership conflict |
| LEASE_RENEW_FAILED | 409 | Session lease renewal failed |
| RESUME_TOKEN_INVALID | 404 | Resume token not found or expired |
| ROUTE_DEAD_END | 500 | No executable path forward |
| EXECUTOR_FAILED | 500 | Tool execution runtime failure |

Complete examples available in [`docs/api-design.md`](./docs/api-design.md).

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Build and test: `npm run build && npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 🧪 Testing

Specly includes comprehensive test coverage with **≈1735 automated tests across packages**:

```bash
# Run all tests across packages
pnpm test:all

# Run server tests only
pnpm --filter specly-server test

# Run with coverage report
pnpm --filter specly-server test:coverage

# Run tests in watch mode
pnpm --filter specly-server test:watch
```

**Test Suites:**
- ✅ **Spec Engine**: Execution, retry logic, resume, journal persistence, metrics, lease enforcement (40+ tests)
- ✅ **Security & Validation**: Executor type whitelist, content size limits, graph constraints, command alias uniqueness (15 tests)
- ✅ **Graph Validation**: Cycles, unreachable specs, priority validation, normalization (9 tests)
- ✅ **Session Leases**: Ownership, force_start, idle state, conflict handling (5 tests)
- ✅ **API Endpoints**: Tasks, profiles, sessions, tool execution, specs/tools (25+ tests)
- ✅ **Repositories & Persistence**: CRUD operations, database migrations, seed management (15+ tests)
- ✅ **Hashing & Canonicalization**: Deterministic hashing, golden vectors (6 tests)
- ✅ **CLI & Tooling**: Multi-step tools, next-step generator, base tool (25+ tests)

**Test Environment:** In-memory SQLite with programmatic migrations ensures isolated test runs. Use Node.js + Vitest (Bun support pending due to native module compatibility).
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
