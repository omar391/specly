/**
 * API Types and Interfaces for TaskPilot REST API
 */

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
export interface WorkspaceSummary {
  id: string;
  name: string;
  path: string;
  status: 'connected' | 'disconnected' | 'error';
  last_activity: string;
  task_count: number;
  active_task: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspacesResponse {
  workspaces: WorkspaceSummary[];
}

// Task types
export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Backlog' | 'In-Progress' | 'Blocked' | 'Review' | 'Done' | 'Dropped';
  progress: number;
  parent_task_id: string | null;
  blocked_by_task_id: string | null;
  connected_files: string[];
  notes: string | null;
  github_issue_number: number | null;
  github_url: string | null;
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
  priority: 'High' | 'Medium' | 'Low';
  parent_task_id?: string | null;
}

export interface UpdateTaskRequest {
  field: 'title' | 'description' | 'priority' | 'status' | 'progress' | 'notes';
  value: string | number;
  reason: string;
}

// Legacy tool flow & feedback step interfaces removed (drastic migration).
// Placeholder for future spec/profile API response types.

// SSE Event types
export interface WorkspaceStatusChangedEvent {
  type: 'workspace.status_changed';
  data: {
    workspace_id: string;
    status: 'connected' | 'disconnected' | 'error';
    last_activity: string;
  };
}

export interface TaskUpdatedEvent {
  type: 'task.updated';
  data: {
    workspace_id: string;
    task: {
      id: string;
      status: string;
      progress: number;
      updated_at: string;
    };
  };
}

export interface TaskCreatedEvent {
  type: 'task.created';
  data: {
    workspace_id: string;
    task: {
      id: string;
      title: string;
      status: string;
      created_at: string;
    };
  };
}

export type SSEEvent = WorkspaceStatusChangedEvent | TaskUpdatedEvent | TaskCreatedEvent;

// Query parameters
export interface TasksQueryParams {
  status?: 'current' | 'history';
  limit?: number;
  offset?: number;
}

// Removed ToolFlowsQueryParams & FeedbackStepsQueryParams.
