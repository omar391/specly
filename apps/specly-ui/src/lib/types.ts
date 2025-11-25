// Common response wrapper
export interface ApiResponse<T = any> {
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
}

// Workspace types
export interface Workspace {
    id: string;
    name: string;
    path: string;
    status: 'active' | 'connected' | 'disconnected' | 'error';
    last_activity: string;
    task_count: number;
    active_task: string | null;
    created_at: string;
    updated_at: string;
}

export interface WorkspacesResponse {
    workspaces: Workspace[];
}

// Task types
export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'queued' | 'in_progress' | 'awaiting_input' | 'blocked' | 'paused' | 'completed' | 'failed';

export interface Task {
    id: string;
    title: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    progress: number;
    assets: string[];
    external_references: any[];
    metadata: Record<string, any>;
    tags: string[];
    notes: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

export interface TasksResponse {
    tasks: Task[];
    workspace: {
        id: string;
        name: string;
        path: string;
    };
    total: number;
    page: number;
}

export interface CreateTaskRequest {
    title: string;
    description: string;
    priority: TaskPriority;
    assets?: string[];
    external_references?: any[];
    metadata?: Record<string, any>;
    tags?: string[];
}

export interface UpdateTaskRequest {
    field: 'title' | 'description' | 'priority' | 'status' | 'progress' | 'notes';
    value: string | number;
    reason: string;
}

// Session types
export interface SessionSummary {
    id: string;
    workspace_id: string;
    is_active: boolean;
    last_activity: string;
    created_at: string;
}

export interface SessionsResponse {
    sessions: SessionSummary[];
}
export interface Tool {
    name: string;
    description?: string;
    commandAlias?: string;
    createdAt: string;
}

export interface Spec {
    hash?: string;
    executor_type: string;
    executor_version: string;
    intent: string;
    content_template?: string;
    static_params?: Record<string, any>;
    input_schema?: any;
    output_schema?: any;
    idempotency_key_template?: string;
    retry_policy?: any;
    show_output?: boolean;
    security?: any;
    metadata?: Record<string, any>;
}

export interface GraphEdge {
    from: string;
    to: string;
    condition_type?: 'always' | 'success' | 'failure' | 'json_path';
    condition_value?: string;
    priority?: number;
}

export interface GraphManifest {
    ordered_specs: string[]; // List of spec hashes
    entry_spec: string;
    edges: GraphEdge[];
    specs?: Record<string, Spec>; // Optional: map of hash -> Spec details for UI
    layout?: Record<string, { x: number; y: number }>; // Map of spec hash -> position
}

export interface ToolVersion {
    hash: string;
    toolName: string;
    graphManifest: GraphManifest;
    createdAt: string;
}

export interface ToolsResponse {
    tools: Tool[];
}

export interface ToolResponse {
    tool: Tool;
}

export interface ToolVersionsResponse {
    versions: ToolVersion[];
}
