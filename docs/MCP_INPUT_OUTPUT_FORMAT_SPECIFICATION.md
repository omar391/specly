# MCP Input/Output Format Specification for TaskPilot

## Overview

This document provides comprehensive details on the Model Context Protocol (MCP) input/output formats for **Tools** and **Resources**, based on the MCP 2025-06-18 specification. It then analyzes how TaskPilot's current implementation aligns with these standards.

## MCP Protocol Specification Summary

### 1. Tools

Tools in MCP are **model-controlled**, meaning the language model can discover and invoke tools automatically based on contextual understanding and user prompts.

#### 1.1 Tool Capabilities Declaration

Servers supporting tools MUST declare the `tools` capability:

```json
{
  "capabilities": {
    "tools": {
      "listChanged": true
    }
  }
}
```

#### 1.2 Tool Discovery (`tools/list`)

##### Request Format
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "cursor": "optional-cursor-value"
  }
}
```

##### Response Format
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "get_weather",
        "title": "Weather Information Provider",
        "description": "Get current weather information for a location",
        "inputSchema": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "City name or zip code"
            }
          },
          "required": ["location"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "temperature": {
              "type": "number",
              "description": "Temperature in celsius"
            },
            "conditions": {
              "type": "string",
              "description": "Weather conditions description"
            }
          },
          "required": ["temperature", "conditions"]
        }
      }
    ],
    "nextCursor": "next-page-cursor"
  }
}
```

#### 1.3 Tool Invocation (`tools/call`)

##### Request Format (tools/call)
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "location": "New York"
    }
  }
}
```

##### Response Format (tools/call)
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Current weather in New York:\nTemperature: 72°F\nConditions: Partly cloudy"
      }
    ],
    "isError": false,
    "structuredContent": {
      "temperature": 22.5,
      "conditions": "Partly cloudy",
      "humidity": 65
    }
  }
}
```

#### 1.4 Tool Content Types

Tools can return multiple content types:

1. **Text Content:**
```json
{
  "type": "text",
  "text": "Tool result text"
}
```

2. **Image Content:**
```json
{
  "type": "image", 
  "data": "base64-encoded-data",
  "mimeType": "image/png",
  "annotations": {
    "audience": ["user"],
    "priority": 0.9
  }
}
```

3. **Audio Content:**
```json
{
  "type": "audio",
  "data": "base64-encoded-audio-data", 
  "mimeType": "audio/wav"
}
```

4. **Resource Links:**
```json
{
  "type": "resource_link",
  "uri": "file:///project/src/main.rs",
  "name": "main.rs",
  "description": "Primary application entry point",
  "mimeType": "text/x-rust",
  "annotations": {
    "audience": ["assistant"],
    "priority": 0.9
  }
}
```

5. **Embedded Resources:**
```json
{
  "type": "resource",
  "resource": {
    "uri": "file:///project/src/main.rs",
    "title": "Project Rust Main File",
    "mimeType": "text/x-rust",
    "text": "fn main() {\n    println!(\"Hello world!\");\n}",
    "annotations": {
      "audience": ["user", "assistant"],
      "priority": 0.7,
      "lastModified": "2025-05-03T14:30:00Z"
    }
  }
}
```

#### 1.5 Error Handling

##### Protocol Errors (JSON-RPC errors)
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32602,
    "message": "Unknown tool: invalid_tool_name"
  }
}
```

##### Tool Execution Errors
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Failed to fetch weather data: API rate limit exceeded"
      }
    ],
    "isError": true
  }
}
```

### 2. Resources

Resources in MCP are **application-controlled** and provide contextual data to language models. Each resource is uniquely identified by a URI.

#### 2.1 Resource Capabilities Declaration

```json
{
  "capabilities": {
    "resources": {
      "subscribe": true,
      "listChanged": true
    }
  }
}
```

#### 2.2 Resource Discovery (`resources/list`)

##### Request Format (resources/list)
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list",
  "params": {
    "cursor": "optional-cursor-value"
  }
}
```

##### Response Format (resources/list)
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resources": [
      {
        "uri": "file:///project/src/main.rs",
        "name": "main.rs",
        "title": "Rust Software Application Main File",
        "description": "Primary application entry point",
        "mimeType": "text/x-rust",
        "size": 1024,
        "annotations": {
          "audience": ["user"],
          "priority": 0.8,
          "lastModified": "2025-01-12T15:00:58Z"
        }
      }
    ],
    "nextCursor": "next-page-cursor"
  }
}
```

#### 2.3 Resource Reading (`resources/read`)

##### Request Format (resources/read)
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "file:///project/src/main.rs"
  }
}
```

##### Response Format (resources/read)
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [
      {
        "uri": "file:///project/src/main.rs",
        "name": "main.rs", 
        "title": "Rust Software Application Main File",
        "mimeType": "text/x-rust",
        "text": "fn main() {\n    println!(\"Hello world!\");\n}",
        "annotations": {
          "audience": ["user", "assistant"],
          "priority": 0.7,
          "lastModified": "2025-05-03T14:30:00Z"
        }
      }
    ]
  }
}
```

#### 2.4 Resource Templates (`resources/templates/list`)

##### Request Format (resources/templates/list)
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/templates/list"
}
```

##### Response Format (resources/templates/list)
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "resourceTemplates": [
      {
        "uriTemplate": "file:///{path}",
        "name": "Project Files",
        "title": "📁 Project Files",
        "description": "Access files in the project directory",
        "mimeType": "application/octet-stream"
      }
    ]
  }
}
```

#### 2.5 Resource Content Types

##### Text Content
```json
{
  "uri": "file:///example.txt",
  "name": "example.txt",
  "title": "Example Text File",
  "mimeType": "text/plain",
  "text": "Resource content"
}
```

##### Binary Content
```json
{
  "uri": "file:///example.png",
  "name": "example.png", 
  "title": "Example Image",
  "mimeType": "image/png",
  "blob": "base64-encoded-data"
}
```

## TaskPilot Current Implementation Analysis

### Current Tool Implementation Status

#### ✅ Correctly Implemented

1. **Tool Registration Structure** - TaskPilot properly implements the tools/list response:
```typescript
async listTools() {
  return {
    tools: [
      {
        name: "taskpilot_init",
        description: "Initialize a TaskPilot workspace with .task folder structure and configuration",
        inputSchema: zodToJsonSchema(initToolSchema),
      },
      // ... 11 total tools
    ],
  };
}
```

2. **Input Schema Validation** - Using Zod schemas converted to JSON Schema:
```typescript
export const startToolSchema = z.object({
  workspace_path: z.string().describe('Absolute path to the workspace directory')
});
```

3. **Basic Tool Response Structure** - Returns valid MCP content arrays:
```typescript
return {
  content: [{
    type: 'text', 
    text: orchestrationResult.prompt_text
  }],
  isError: result.isError
};
```

4. **Error Handling** - Proper error responses with isError flag:
```typescript
return {
  content: [{
    type: 'text',
    text: `Error: ${error.message}`
  }],
  isError: true
};
```

#### ⚠️ Partially Compliant Issues

1. **Missing Tool Metadata:**
   - No `title` field (optional but recommended for UI display)
   - No `outputSchema` field (would help clients understand response structure)
   - No `annotations` field (for tool behavior metadata)

2. **Limited Content Types:**
   - Only supports `text` content type
   - No support for `image`, `audio`, `resource_link`, or `embedded_resource` content

3. **No Structured Content:**
   - Missing `structuredContent` field for machine-readable data
   - All responses are narrative text instead of structured data

#### ❌ Major Compliance Gaps

### 1. User-Oriented Response Problem

**Current Issue:** Tools return user-oriented narrative prompts rather than structured tool results.

#### Example from PromptOrchestrator.generateBasicPrompt()
```typescript
case 'taskpilot_init':
  return `# TaskPilot Project Initialization\n\n` +
         `Project: ${args.project_name || 'TaskPilot Project'}\n` +
         `Workspace: ${args.workspace_path || 'current directory'}\n` +
         `Tech Stack: ${args.tech_stack || 'Not specified'}\n` +
         `Requirements: ${args.project_requirements || 'No specific requirements'}\n\n` +
         `Ready to initialize project structure and rules.`;
```

**MCP Expectation:** Tools should return structured data that can be processed by the client/LLM, not formatted user messages.

### 2. Missing Resources Implementation

**❌ Complete Gap:** TaskPilot has NO resources implementation:

1. **No Capability Declaration:** Server doesn't declare `resources` capability
2. **No Resource Endpoints:** No `resources/list`, `resources/read`, or `resources/templates/list`  
3. **No Resource Handlers:** No MCP resource request handlers in server setup

#### Missing Implementation in `src/index.ts`
```typescript
// Current capabilities
{
  capabilities: {
    tools: {},
  },
}

// Should include:
{
  capabilities: {
    tools: {},
    resources: {
      subscribe: true,
      listChanged: true
    }
  },
}
```

### 3. Prompt Orchestration Architecture Issue

#### Current Flow
1. Tool receives input → 
2. PromptOrchestrator generates narrative text →
3. Returns narrative as tool result

##### MCP-Compliant Flow Should Be
1. Tool receives input →
2. Tool performs business logic →
3. Tool returns structured data + optional presentation text →
4. Client/LLM processes structured data

### 4. API vs MCP Response Inconsistency

**REST API** (in `src/api/tasks.ts`) correctly returns structured JSON:
```typescript
res.json(createSuccessResponse({
  task: {
    id: createdTask.id,
    title: createdTask.title,
    status: createdTask.status,
    // ... structured data
  }
}));
```

**MCP Tools** return narrative text:
```typescript
return {
  content: [{
    type: 'text',
    text: 'Task creation executed. Task details processed and stored.'
  }]
};
```

This inconsistency suggests the MCP implementation could follow the same structured approach as the REST API.

## Detailed Compliance Recommendations

### 1. Fix Tool Response Architecture

#### Priority: HIGH - Critical for MCP compliance

**Current Problem:** Tools return narrative text meant for users instead of structured data for LLMs.

#### Recommended Refactor

```typescript
// BEFORE (current implementation)
return {
  content: [{
    type: 'text',
    text: `# TaskPilot Project Initialization\n\nProject: ${args.project_name}\n...`
  }]
};

// AFTER (MCP-compliant)
return {
  content: [{
    type: 'text',
    text: 'TaskPilot workspace successfully initialized'
  }],
  structuredContent: {
    operation: 'init',
    workspace: {
      id: workspace.id,
      path: workspace.path,
      name: workspace.name
    },
    tasks_created: initialTasks.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status
    })),
    rules_applied: appliedRules,
    setup_complete: true
  },
  isError: false
};
```

#### Implementation Steps

1. **Separate Business Logic from Presentation** - Move prompt generation out of tools
2. **Return Structured Data** - Tools should return machine-readable results
3. **Add Output Schemas** - Define expected response structure

### 2. Implement Resources Capability

#### Priority: HIGH - Missing core MCP feature

#### Add Resources Support

```typescript
// 1. Update server capabilities in src/index.ts
{
  capabilities: {
    tools: {},
    resources: {
      subscribe: true,
      listChanged: true
    }
  }
}

// 2. Add resource handlers
import { 
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// 3. Implement resource list
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "taskpilot://workspace/current/tasks",
        name: "Current Tasks",
        title: "📋 Active Workspace Tasks", 
        description: "All tasks in the current workspace",
        mimeType: "application/json",
        annotations: {
          audience: ["assistant"],
          priority: 0.9
        }
      },
      {
        uri: "taskpilot://workspace/current/rules",
        name: "Workspace Rules",
        title: "📝 Project Rules & Guidelines",
        description: "Project-specific coding standards and rules",
        mimeType: "text/markdown",
        annotations: {
          audience: ["assistant"], 
          priority: 0.8
        }
      }
    ]
  };
});

// 4. Implement resource reading
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  if (uri === "taskpilot://workspace/current/tasks") {
    const tasks = await getCurrentWorkspaceTasks();
    return {
      contents: [{
        uri,
        name: "Current Tasks",
        mimeType: "application/json",
        text: JSON.stringify(tasks, null, 2)
      }]
    };
  }
  
  if (uri === "taskpilot://workspace/current/rules") {
    const rules = await getCurrentWorkspaceRules();
    return {
      contents: [{
        uri,
        name: "Workspace Rules", 
        mimeType: "text/markdown",
        text: rules
      }]
    };
  }
  
  throw new Error(`Resource not found: ${uri}`);
});
```

### 3. Add Output Schemas to Tools

#### Priority: MEDIUM - Improves client integration

```typescript
// Update tool definitions in src/index.ts
{
  name: "taskpilot_init",
  description: "Initialize a TaskPilot workspace with .task folder structure and configuration",
  inputSchema: zodToJsonSchema(initToolSchema),
  outputSchema: {
    type: "object",
    properties: {
      workspace: {
        type: "object",
        properties: {
          id: { type: "string" },
          path: { type: "string" },
          name: { type: "string" }
        },
        required: ["id", "path", "name"]
      },
      tasks_created: {
        type: "array",
        items: {
          type: "object", 
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            status: { type: "string" }
          }
        }
      },
      setup_complete: { type: "boolean" }
    },
    required: ["workspace", "tasks_created", "setup_complete"]
  }
}
```

### 4. Enhance Tool Metadata

#### Priority: MEDIUM - Better UX and discoverability

```typescript
// Add missing metadata to tools
{
  name: "taskpilot_init",
  title: "🚀 Initialize TaskPilot Workspace", // User-friendly title
  description: "Initialize a TaskPilot workspace with .task folder structure and configuration",
  inputSchema: zodToJsonSchema(initToolSchema),
  outputSchema: { /* ... */ },
  annotations: {
    category: "workspace-management",
    destructive: false,
    requiresConfirmation: false
  }
}
```

### 5. Implement Structured Content Support

#### Priority: MEDIUM - Enables richer client interactions

```typescript
// Update tools to return both text and structured content
export class InitTool {
  async execute(input: InitToolInput): Promise<TaskPilotToolResult> {
    // Perform initialization
    const initResult = await this.projectInitializer.initializeProject(input);
    
    // Return structured data AND human-readable text
    return {
      content: [{
        type: 'text',
        text: `TaskPilot workspace "${initResult.workspace.name}" initialized successfully. Created ${initResult.initialTasks.length} initial tasks.`
      }],
      structuredContent: {
        operation: 'workspace_init',
        workspace: {
          id: initResult.workspace.id,
          path: initResult.workspace.path,
          name: initResult.workspace.name,
          created_at: initResult.workspace.createdAt
        },
        tasks_created: initResult.initialTasks.map(task => ({
          id: task.id,
          title: task.title,
          priority: task.priority,
          status: task.status
        })),
        rules_initialized: initResult.rulesApplied,
        setup_complete: true,
        next_steps: [
          'Run taskpilot_start to begin a session',
          'Use taskpilot_add to create new tasks',
          'Check taskpilot_status for project overview'
        ]
      },
      isError: false
    };
  }
}
```

### 6. Separate Prompt Generation from Tool Logic

#### Priority: HIGH - Architectural improvement

**Current Flow:**
```text
Tool Input → PromptOrchestrator.orchestratePrompt() → Narrative Text → Return as Tool Result
```

**Recommended Flow:**
```text
Tool Input → Business Logic → Structured Data → Return to Client
                ↓
Client/LLM can request prompt generation separately via resources or dedicated prompt tools
```

**Implementation:**
```typescript
// Move prompt generation to resources
{
  uri: "taskpilot://prompts/init-success",
  name: "Initialization Success Prompt",
  description: "User-oriented prompt for successful workspace initialization"
}

// Or create dedicated prompt tools
{
  name: "taskpilot_generate_prompt",
  description: "Generate user-oriented prompts based on operation results",
  inputSchema: {
    type: "object",
    properties: {
      operation: { type: "string" },
      context: { type: "object" }
    }
  }
}
```

## Implementation Priority & Roadmap

### Phase 1: Critical Compliance (Immediate)

1. **✅ Tool Response Architecture Refactor**
   - **Files to modify:** `src/tools/*.ts`, `src/services/prompt-orchestrator.ts` 
   - **Goal:** Separate business logic from prompt generation
   - **Result:** Tools return structured data instead of narrative prompts

2. **✅ Add Output Schemas**
   - **Files to modify:** `src/index.ts` (tool definitions)
   - **Goal:** Define expected response structure for each tool
   - **Result:** Better client integration and validation

### Phase 2: Core MCP Features (High Priority)

3. **✅ Implement Resources Capability**
   - **Files to modify:** `src/index.ts`, create `src/resources/`
   - **Goal:** Add workspace data as MCP resources
   - **Resources to expose:**
     - `taskpilot://workspace/{id}/tasks` - Current tasks as JSON
     - `taskpilot://workspace/{id}/rules` - Workspace rules as Markdown
     - `taskpilot://workspace/{id}/status` - Project status summary
     - `taskpilot://workspace/{id}/files` - Connected files list

4. **✅ Add Structured Content Support**
   - **Files to modify:** All tool implementations
   - **Goal:** Return both human-readable text AND machine-readable data
   - **Result:** Clients can process data programmatically

### Phase 3: Enhanced Features (Medium Priority)

5. **Add Tool Metadata & Annotations**
   - **Goal:** Better UX and tool discoverability
   - **Add:** `title`, `annotations`, category information

6. **Support Additional Content Types**
   - **Goal:** Return images, files, resource links when relevant
   - **Use cases:** Status charts, file attachments, related resources

### Phase 4: Advanced Features (Low Priority)

7. **Resource Subscriptions**
   - **Goal:** Real-time updates when workspace data changes
   - **Implementation:** WebSocket-based notifications

8. **Resource Templates**
   - **Goal:** Dynamic resource discovery
   - **Template:** `taskpilot://workspace/{workspace_id}/tasks/{task_id}`

## Specific File Changes Needed

### 1. `/src/index.ts` - Server Setup

**Add Resources Capability:**
```typescript
// Current
{
  capabilities: {
    tools: {},
  },
}

// Updated
{
  capabilities: {
    tools: {},
    resources: {
      subscribe: true,
      listChanged: true
    }
  },
}
```

**Add Resource Handlers:**
```typescript
import { 
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Add after tool handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return await resourceManager.listResources();
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  return await resourceManager.readResource(request.params.uri);
});
```

### 2. Create `/src/resources/resource-manager.ts`

```typescript
export class TaskPilotResourceManager {
  constructor(private globalDb: GlobalDatabaseService) {}

  async listResources(): Promise<ResourceListResponse> {
    return {
      resources: [
        {
          uri: "taskpilot://workspaces",
          name: "All Workspaces",
          title: "🏢 TaskPilot Workspaces",
          description: "List of all registered workspaces",
          mimeType: "application/json"
        },
        // Dynamic workspace resources would be generated here
      ]
    };
  }

  async readResource(uri: string): Promise<ResourceReadResponse> {
    // Parse URI and return appropriate resource content
  }
}
```

### 3. Update Tool Implementations

**Example: `/src/tools/init.ts`**

```typescript
// Before
async execute(input: InitToolInput): Promise<TaskPilotToolResult> {
  const orchestrationResult = await this.orchestrator.orchestratePrompt(/*...*/);
  return {
    content: [{ type: 'text', text: orchestrationResult.prompt_text }]
  };
}

// After  
async execute(input: InitToolInput): Promise<TaskPilotToolResult> {
  const initResult = await this.projectInitializer.initializeProject(input);
  
  return {
    content: [{
      type: 'text',
      text: `Workspace "${initResult.workspace.name}" initialized with ${initResult.initialTasks.length} tasks.`
    }],
    structuredContent: {
      workspace: {
        id: initResult.workspace.id,
        path: initResult.workspace.path,
        name: initResult.workspace.name
      },
      tasks_created: initResult.initialTasks,
      rules_applied: initResult.rulesApplied,
      setup_complete: true
    },
    isError: false
  };
}
```

## Validation & Testing

### MCP Compliance Testing

1. **Tool Response Validation:**
   ```bash
   # Test tool responses match expected schema
   npm run test:mcp-tools
   ```

2. **Resource Access Testing:**
   ```bash
   # Test resource listing and reading
   npm run test:mcp-resources
   ```

3. **Client Integration Testing:**
   ```bash
   # Test with MCP client implementations
   npm run test:mcp-integration
   ```

### Backward Compatibility

- **REST API:** Existing API endpoints remain unchanged
- **UI Integration:** Frontend can continue using REST API
- **MCP Clients:** New structured responses provide better integration

This phased approach ensures TaskPilot becomes fully MCP-compliant while maintaining existing functionality and providing a clear upgrade path.

