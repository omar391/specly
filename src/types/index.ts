export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Backlog' | 'In-Progress' | 'Blocked' | 'Review' | 'Done' | 'Dropped';
  progress: number;
  parent_task_id?: string;
  blocked_by_task_id?: string;
  connected_files: string[];
  notes?: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface Workspace {
  id: string;
  path: string;
  name: string;
  created_at: string;
  updated_at: string;
  last_activity?: string;
  is_active: boolean;
}

export interface Session {
  id: string;
  workspace_id: string;
  created_at: string;
  last_activity: string;
  is_active: boolean;
}

// Legacy ToolFlow / FeedbackStep types removed (Specly schema migration)

// Legacy prompt orchestration result type removed

export interface SpeclyToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

// Legacy multi-step tool flow types removed

export type WorkspaceRule = {
  id: string;
  category: string;
  type: string;
  content: string;
  confidence: number;
  created_at: string;
};