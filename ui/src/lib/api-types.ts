/**
 * Specly API Types
 * 
 * Comprehensive type definitions for API requests/responses matching backend schema
 */

// ========================================
// Core Domain Types
// ========================================

export interface WorkspaceMetadata {
  id: string
  name: string
  path: string
  status: 'active' | 'idle' | 'inactive' | 'disconnected' | 'error'
  last_activity: string
  task_count: number
  active_task: string | null
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  title: string
  description: string
  status: 'backlog' | 'in-progress' | 'blocked' | 'review' | 'done' | 'dropped'
  priority: 'high' | 'medium' | 'low'
  progress: number
  notes: string
  connected_files: string[]
  created_at: string
  updated_at: string
  // Note: dependencies array removed - use getTaskDependencies() instead
}

export interface TaskDependency {
  task_id: string
  depends_on: string
  created_at: string
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  activeMCPConnections: number
  activeSSEClients: number
  timestamp: string
}

// ========================================
// Spec & Tool Types
// ========================================

export interface Spec {
  hash: string
  executor_type: string
  executor_version: string
  intent: 'human' | 'autonomous'
  side_effect?: boolean
  content_template?: string
  input_schema?: Record<string, any>
  output_schema?: Record<string, any>
  routing_priority?: number
  idempotency_key_template?: string
  retry_policy?: string
  created_at: string
}

export interface SpecCreateRequest {
  executor_type: string
  executor_version: string
  intent: 'human' | 'autonomous'
  side_effect?: boolean
  content_template?: string
  input_schema?: Record<string, any>
  output_schema?: Record<string, any>
  routing_priority?: number
  idempotency_key_template?: string
  retry_policy?: string
}

export interface SpecCreateResponse {
  hash: string
  created: boolean
}

export interface Tool {
  name: string
  description?: string
  command_alias?: string
  created_at: string
}

export interface ToolCreateRequest {
  name: string
  description?: string
  command_alias?: string
}

export interface ToolCreateResponse {
  name: string
  created: boolean
}

export interface ToolVersion {
  hash: string
  tool: string
  ordered_specs: string[]
  entry_spec: string
  edges: ToolEdge[]
  created_at: string
}

export interface ToolEdge {
  from: string
  to: string
  condition_type: 'result_code' | 'always' | 'error'
  condition_value?: string
}

export interface ToolVersionCreateRequest {
  ordered_specs: string[]
  entry_spec: string
  edges: ToolEdge[]
}

export interface ToolVersionCreateResponse {
  hash: string
  tool: string
  created: boolean
}

// ========================================
// Profile Types
// ========================================

export interface Profile {
  id: number
  name: string
  description?: string
  parent_profile_id?: number
  created_at: string
}

export interface ProfileCreateRequest {
  name: string
  description?: string
  parent_profile_id?: number
}

export interface ProfileCreateResponse {
  id: number
  name: string
  created: boolean
}

export interface ProfileVersion {
  id: number
  profile_id: number
  version: number
  parent_profile_version_id?: number
  created_at: string
}

export interface ProfileVersionCreateRequest {
  parent_profile_version_id?: number
}

export interface ProfileVersionCreateResponse {
  id: number
  version: number
  created: boolean
}

export interface ProfileVersionPublishResponse {
  profile: string
  version: number
  published: boolean
}

export interface ProfileAttachment {
  profile_version_id: number
  tool_name: string
  tool_version_hash: string
  command_alias?: string
  created_at: string
}

export interface ProfileAttachmentRequest {
  attachments: Array<{
    tool_name: string
    tool_version_hash: string
    command_alias?: string
  }>
}

export interface ProfileAttachmentResponse {
  profile: string
  version: number
  attached: number
  attachments: ProfileAttachment[]
}

export interface WorkspaceProfileBinding {
  workspace_id: string
  profile_version_id: number
  pinned_at: string
  profile_name?: string
  version?: number
}

export interface WorkspaceProfileUpgradeRequest {
  profile: string
  version?: number
}

export interface WorkspaceProfileUpgradeResponse {
  workspace_id: string
  profile_version_id: number
  pinned_at: string
}

// ========================================
// Session Types
// ========================================

export interface Session {
  id: number
  workspace_id: string
  task_id?: string
  client_state_id?: string
  session_status: 'active' | 'awaiting_input' | 'paused' | 'completed' | 'failed'
  current_spec_hash?: string
  context?: Record<string, any>
  created_at: string
  last_active_at: string
  completed_at?: string
}

export interface SessionQueryParams {
  workspace_id: string
  task_id?: string
}

// ========================================
// Execution Types
// ========================================

export interface ToolExecuteRequest {
  task_id?: string
  session_id?: number
  client_state_id?: string
  force_start?: boolean
  human_input?: Record<string, any>
  graph?: {
    ordered_specs: string[]
    entry_spec: string
    edges: ToolEdge[]
  }
  tool_version_id?: string
}

export interface ExecutionResult {
  spec_hash: string
  result_code: string
  output: any
  executed_at: string
}

export interface ToolExecuteResponse {
  session_id: number
  task_id?: string
  status: 'active' | 'awaiting_input' | 'paused' | 'completed' | 'failed'
  executed: ExecutionResult[]
  results: Record<string, any>
  awaitingSpec?: {
    spec_hash: string
    content_template: string
    input_schema?: Record<string, any>
  }
  resumeToken?: string
  warnings?: string[]
  error?: {
    code: string
    message: string
    details?: any
  }
}

// ========================================
// Rules Types
// ========================================

export interface WorkspaceRule {
  id: number
  workspace_id: string
  relation: string
  rule: string
  original_text?: string
  confidence: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface RuleCreateRequest {
  workspace_id: string
  relation: string
  rule: string
  original_text?: string
  confidence?: number
  active?: boolean
}

export interface RuleCreateResponse {
  id: number
  created: boolean
}

export interface RuleListResponse {
  rules: WorkspaceRule[]
}

// ========================================
// Generic API Response Wrapper
// ========================================

export interface ApiResponse<T> {
  data: T
  error?: string
}

// ========================================
// SSE Event Types
// ========================================

export type SSEEventType = 
  | 'workspace.status_changed'
  | 'task.updated'
  | 'task.created'
  | 'task.status_changed'
  | 'session.updated'
  | 'connection.status'

export interface SSEEvent {
  type: SSEEventType
  data: any
  timestamp: string
}

export type SSEEventHandler = (event: SSEEvent) => void

// ========================================
// API Client Configuration
// ========================================

export interface ApiClientConfig {
  baseUrl?: string
  timeout?: number
  retryAttempts?: number
  retryDelay?: number
  autoConnectSSE?: boolean
}

// ========================================
// Error Classes (Typed Errors Matching Backend)
// ========================================

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, '422_VALIDATION_ERROR', 422, details)
    this.name = 'ValidationError'
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, code: string, details?: any) {
    super(message, code, 409, details)
    this.name = 'ConflictError'
  }
}

export class DependencyCycleError extends ConflictError {
  constructor(message: string, details?: any) {
    super(message, '409_DEPENDENCY_CYCLE', details)
    this.name = 'DependencyCycleError'
  }
}

export class LeaseConflictError extends ConflictError {
  constructor(message: string, details?: any) {
    super(message, '409_LEASE_CONFLICT', details)
    this.name = 'LeaseConflictError'
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, '404_NOT_FOUND', 404, details)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, '401_UNAUTHORIZED', 401, details)
    this.name = 'UnauthorizedError'
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, '429_RATE_LIMIT', 429, details)
    this.name = 'RateLimitError'
  }
}

/**
 * Parse error response and throw appropriate typed error
 */
export function throwTypedError(statusCode: number, body: any): never {
  const message = body?.error?.message || body?.message || `HTTP ${statusCode}`
  const code = body?.error?.code || `${statusCode}_ERROR`
  const details = body?.error?.details || body?.details

  // Map status codes to error classes
  if (statusCode === 422) {
    throw new ValidationError(message, details)
  }
  
  if (statusCode === 409) {
    if (code.includes('CYCLE')) {
      throw new DependencyCycleError(message, details)
    }
    if (code.includes('LEASE')) {
      throw new LeaseConflictError(message, details)
    }
    throw new ConflictError(message, code, details)
  }

  if (statusCode === 404) {
    throw new NotFoundError(message, details)
  }

  if (statusCode === 401) {
    throw new UnauthorizedError(message, details)
  }

  if (statusCode === 429) {
    throw new RateLimitError(message, details)
  }

  // Generic API error for other cases
  throw new ApiError(message, code, statusCode, details)
}
