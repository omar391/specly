# Specly - Design Specification v2.0

## 1. Project's eventual purpose

This project, **Specly** (renaming from specly), serves as a **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) server** that delivers structured instruction flows to MCP-compliant clients (e.g., GitHub Copilot, Cursor). Clients make a `tools/call`, and the server responds with a multi-step **spec flow**: a sequence of templated instructions. The client advances through them until all steps are consumed.

Backend-side logic, such as saving to a database or making third-party API calls, remains part of the internal implementation of **built-in tools** and is *not* part of the spec flow exposed to the client.

### Core Tools

#### Tool Flow Examples

These example flows are illustrative—actual built-in tool specs may differ, and spec flows will vary per profile.

- **`add_task` tool** (alias `//add`):
    1.  Requirement analysis
    2.  Implementation draft
    3.  Testing instructions
    - *Final (internal step): Save task details to database*

- **`start_task` tool** (alias `//go`):
    1.  Verify current task details
    2.  Break into unit-testable subtasks
    3.  Execute subtasks and update progress

Note: here alias refers to the shorthand command used to invoke the tool but this alias info will only be used in the tool's description. So when an mcp client fetches the tools list, it will see the alias alongside the tool name.

#### Core Tool Reference

- **`start_task`** (alias: `//go`) → Execute a task (next or specific ID). The initial step can establish the session and return base instructions. We aim to replace current `start`+`focus` tool with this combined `start_task` aka `//go` alias tool.
- **`add_task`** (alias: `//add`) → Add a new task.
- **`audit_task`** (alias: `//audit`) → Audit the last task or a specific task.
- **`status_project`** (alias: `//status`) → Show current project status.
- **`init_project`** (alias: `//init`) → Initialize project structure and set the profile.
- **`update_profile`** (alias: `//update`) → Update profile, steps, or tools.

## 2. Core Concepts & Customization

The system is built on a modular hierarchy. Each workspace is bound to a single profile, which builds on core tools and can be extended with custom tools and specs.

- A **Profile** is a collection of tools tailored for a specific domain or project type. Profiles can be shared or exported as JSON.
- A **Tool** is a directed, acyclic graph of specs representing a multi-step workflow. A tool's version is determined by a content hash of its ordered spec list.
- A **Spec** is an immutable, templated instruction block identified by a unique content hash (e.g., SHA-256). Specs are the fundamental building blocks of any tool and can be global (reusable across profiles) or profile-specific.

### Example Hierarchy

```text

Profile: "Task Manager Agent"
└── Tool: "add\_task" (hash: a4e9c1f)
├── Spec: "spec\_7b2d3f0" (Requirement analysis)
├── Spec: "spec\_e8a1b5c" (Implementation draft)
└── Spec: "spec\_c3f0a9d" (Testing instructions)

```

## 3. Goals

- Enable **project-specific tool sets** via profiles.
- Tools support **multi-step spec flows**, where specs are distinct, immutable templates.
- Profiles define tool collections, which may include both global and custom specs.
- Migrate all internal logic (like DB operations) out of spec flows and into the backend tool implementation.
- Enable the addition of **custom tools and specs** to profiles.

## 4. Architectural Pillars

### 4.1. Versioning: A Content-Hashed Approach

To ensure stability and reproducibility, both specs and tools are versioned using content hashes (SHA-256).

- **Spec Hash**: A hash of the spec's templated content. Any change creates a new spec with a new hash.
- **Tool Hash**: A hash of the concatenated, ordered list of its spec hashes. Any change to the composition or order of specs results in a new tool version with a new hash.

For user-facing display, a short 7-character prefix of the hash is used.

### 4.2. State Management: A Hybrid Model

Specly uses a dual-state model to balance stateless scalability with the need for persistent, resumable tasks.

- **Server-Side Session State**: For each task initiated (e.g., via a `//go` command), the server maintains a persistent session. This includes static context like workspace path, project settings, and progress tracking (`last_step_id`, `last_step_response`).
- **Client-Side Step Context**: The client is responsible for managing the transient context between steps. The output from Step `N` is passed by the client as the `arguments` in the tool call for Step `N+1`.

### 4.3. Flow Control: Hybrid "Structured Prose"

To combine the reliability of a workflow engine with the reasoning power of LLMs, Specly uses a hybrid flow control model.

- **Structured Graph**: Tools are defined as directed, acyclic graphs. The server knows the valid transitions between specs.
- **LLM-Driven Logic**: At branch points, the server provides the LLM client with both natural language instructions and a structured list of valid next steps. The LLM reasons over the instructions to choose the appropriate next action from the provided list.

#### Example: Branching API Response

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{
      "type": "text",
      "text": "The analysis is complete. Based on the findings, you can either draft the implementation directly or request user feedback for clarification."
    }],
    "next_steps": [
      { "tool_name": "add_task", "step_id": "spec_e8a1b5c", "description": "Choose this to draft the implementation." },
      { "tool_name": "add_task", "step_id": "spec_f9b2a1e", "description": "Choose this to ask the user for clarification." }
    ],
    "isError": false
  }
}
```

### 4.4. Context and Variable Management

Specs are templates that can be populated with data from multiple sources, resolved with the following precedence:

1.  **Runtime/Dynamic Input**: Data provided by the LLM client in the current `tools/call` arguments.
2.  **Session Context**: Static information held in the server-side session (e.g., workspace path).
3.  **Secrets**: Secure values managed by the backend.

#### Secrets Handling

Secrets (e.g., API keys) are **never** exposed to the client or the spec flow. They are stored securely (e.g., in a workspace `.env` file) and are only accessible by internal, server-side tool implementations. If a flow needs to interact with a third-party API, it will call a built-in tool (e.g., `api_call`) that executes the request on the backend.

### 4.5. Data Persistence Architecture

Specly uses a dual-database model with SQLite for persistence.

  - **Global Database (`~/.specly/global.db`)**: Stores global entities like profiles, global specs, and system-wide configurations.
  - **Workspace Database (`<project_path>/.specly/workspace.db`)**: Stores all data specific to a project, including tasks, progress, and session state. This makes each project a self-contained unit. The `.specly` directory should be added to the project's `.gitignore` file.

## 5\. Profile Examples

### Task Manager Agent (Profile)

  - **Core Tools**: `add_task`, `start_task`, `audit_task`, etc.
  - **Custom Tools/Specs**: `sprint_planning`, `backlog_grooming`.
  - Spec flows are tailored for project management and development task tracking.

### JobHunter Agent (Profile)

  - **Core Tools** plus:
      - `apply_task`, `resume_task`, `custom_feedback`.
  - **Custom Tools/Specs**: `recruiter_outreach`, `interview_prep`.
  - Spec flows are optimized for the job application lifecycle.
