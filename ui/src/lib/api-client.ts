/**
 * Specly API Client (UI-only)
 * 
 * Provides typed API access to the Specly REST API with:
 * - Type-safe requests and responses
 * - Typed error handling with backend error codes
 * - Real-time updates via Server-Sent Events (SSE)
 * - Loading state management
 */

import type {
  WorkspaceMetadata,
  Task,
  TaskDependency,
  HealthStatus,
  Spec,
  SpecCreateRequest,
  SpecCreateResponse,
  Tool,
  ToolCreateRequest,
  ToolCreateResponse,
  ToolVersion,
  ToolVersionCreateRequest,
  ToolVersionCreateResponse,
  Profile,
  ProfileCreateRequest,
  ProfileCreateResponse,
  ProfileVersionCreateRequest,
  ProfileVersionCreateResponse,
  ProfileVersionPublishResponse,
  ProfileAttachmentRequest,
  ProfileAttachmentResponse,
  WorkspaceProfileBinding,
  WorkspaceProfileUpgradeRequest,
  WorkspaceProfileUpgradeResponse,
  Session,
  SessionQueryParams,
  ToolExecuteRequest,
  ToolExecuteResponse,
  WorkspaceRule,
  RuleCreateRequest,
  RuleCreateResponse,
  RuleListResponse,
  ApiResponse,
  SSEEvent,
  SSEEventHandler,
  SSEEventType,
  ApiClientConfig,
} from './api-types.js'

// Import throwTypedError as a value (not type)
import { throwTypedError } from './api-types.js'

// Re-export types for convenience
export type {
  WorkspaceMetadata,
  Task,
  TaskDependency,
  HealthStatus,
  ApiResponse,
  SSEEvent,
  SSEEventHandler,
  ApiClientConfig,
}

// ========================================
// API Client Implementation
// ========================================

export class SpeclyApiClient {
  private baseUrl: string
  private timeout: number
  private retryAttempts: number
  private retryDelay: number
  private sseConnection: EventSource | null = null
  private sseEventHandlers: Map<string, Set<SSEEventHandler>> = new Map()

  constructor(config: ApiClientConfig = {}) {
    // Use environment variable or fallback to config or default
    // Handle case where import.meta.env might be undefined
    const envApiUrl = typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_API_BASE_URL
      ? import.meta.env.VITE_API_BASE_URL
      : null;

    this.baseUrl = config.baseUrl ||
      envApiUrl ||
      'http://localhost:8989'
    this.timeout = config.timeout || 10000
    this.retryAttempts = config.retryAttempts || 3
    this.retryDelay = config.retryDelay || 1000

    console.log(`Specly API Client initialized with base URL: ${this.baseUrl}`)
  }

  // ========================================
  // Core HTTP Methods
  // ========================================

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeout)

        const response = await fetch(url, {
          ...defaultOptions,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          // Parse error body and throw typed error
          const errorBody = await response.json().catch(() => ({}))
          throwTypedError(response.status, errorBody)
        }

        const data = await response.json()
        return data as ApiResponse<T>

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')

        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * Math.pow(2, attempt))
        }
      }
    }

    return {
      data: null as any,
      error: `Failed after ${this.retryAttempts + 1} attempts: ${lastError?.message}`,
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ========================================
  // Workspace API
  // ========================================

  async getWorkspaces(): Promise<ApiResponse<{ workspaces: WorkspaceMetadata[] }>> {
    return this.makeRequest<{ workspaces: WorkspaceMetadata[] }>('/api/workspaces')
  }

  // ========================================
  // Task API
  // ========================================

  async getTasks(workspaceId: string): Promise<ApiResponse<{ tasks: Task[] }>> {
    return this.makeRequest<{ tasks: Task[] }>(`/api/workspaces/${workspaceId}/tasks`)
  }

  async createTask(workspaceId: string, task: Partial<Task>): Promise<ApiResponse<{ task: Task }>> {
    return this.makeRequest<{ task: Task }>(`/api/workspaces/${workspaceId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task),
    })
  }

  async updateTask(workspaceId: string, taskId: string, updates: Partial<Task>): Promise<ApiResponse<{ task: Task }>> {
    return this.makeRequest<{ task: Task }>(`/api/workspaces/${workspaceId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  }

  // (Legacy tool flows / feedback steps API removed)

  // ========================================
  // Health Check API
  // ========================================

  async getHealth(): Promise<ApiResponse<HealthStatus>> {
    return this.makeRequest<HealthStatus>('/health')
  }

  // ========================================
  // Specs & Tools Listing (best-effort; 404-safe)
  // ========================================

  async getSpecs(): Promise<ApiResponse<{ specs: Array<{ hash: string; intent?: string; executor_type?: string }> }>> {
    const res = await this.makeRequest<{ specs: Array<{ hash: string; intent?: string; executor_type?: string }> }>(
      `/api/specs`
    )
    // If backend returns 404 as error text in makeRequest, normalize to empty
    if (res.error && /404/.test(res.error)) return { data: { specs: [] } }
    if (!res.data) return { data: { specs: [] }, error: res.error }
    return res
  }

  async getTools(): Promise<ApiResponse<{ tools: string[] }>> {
    const res = await this.makeRequest<{ tools: string[] }>(`/api/tools`)
    if (res.error && /404/.test(res.error)) return { data: { tools: [] } }
    if (!res.data) return { data: { tools: [] }, error: res.error }
    return res
  }

  async getToolVersions(toolName: string): Promise<ApiResponse<{ versions: Array<{ hash: string; entry_spec?: string }> }>> {
    const res = await this.makeRequest<{ versions: Array<{ hash: string; entry_spec?: string }> }>(
      `/api/tools/${encodeURIComponent(toolName)}/versions`
    )
    if (res.error && /404/.test(res.error)) return { data: { versions: [] } }
    if (!res.data) return { data: { versions: [] }, error: res.error }
    return res
  }

  // ========================================
  // Spec Creation API
  // ========================================

  async createSpec(spec: SpecCreateRequest): Promise<ApiResponse<SpecCreateResponse>> {
    return this.makeRequest<SpecCreateResponse>('/api/specs', {
      method: 'POST',
      body: JSON.stringify(spec),
    })
  }

  // ========================================
  // Tool Management API
  // ========================================

  async createTool(tool: ToolCreateRequest): Promise<ApiResponse<ToolCreateResponse>> {
    return this.makeRequest<ToolCreateResponse>('/api/tools', {
      method: 'POST',
      body: JSON.stringify(tool),
    })
  }

  async createToolVersion(
    toolName: string,
    version: ToolVersionCreateRequest
  ): Promise<ApiResponse<ToolVersionCreateResponse>> {
    return this.makeRequest<ToolVersionCreateResponse>(
      `/api/tools/${encodeURIComponent(toolName)}/versions`,
      {
        method: 'POST',
        body: JSON.stringify(version),
      }
    )
  }

  // ========================================
  // Tool Execution API
  // ========================================

  async executeTool(
    toolName: string,
    params: ToolExecuteRequest
  ): Promise<ApiResponse<ToolExecuteResponse>> {
    return this.makeRequest<ToolExecuteResponse>(
      `/api/tools/${encodeURIComponent(toolName)}/execute`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    )
  }

  // ========================================
  // Profile Management API
  // ========================================

  async createProfile(profile: ProfileCreateRequest): Promise<ApiResponse<ProfileCreateResponse>> {
    return this.makeRequest<ProfileCreateResponse>('/api/profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    })
  }

  async createProfileVersion(
    profileName: string,
    data: ProfileVersionCreateRequest
  ): Promise<ApiResponse<ProfileVersionCreateResponse>> {
    return this.makeRequest<ProfileVersionCreateResponse>(
      `/api/profiles/${encodeURIComponent(profileName)}/versions`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )
  }

  async publishProfileVersion(
    profileName: string,
    version: number
  ): Promise<ApiResponse<ProfileVersionPublishResponse>> {
    return this.makeRequest<ProfileVersionPublishResponse>(
      `/api/profiles/${encodeURIComponent(profileName)}/versions/${version}/publish`,
      {
        method: 'POST',
      }
    )
  }

  async attachToolsToProfile(
    profileName: string,
    version: number,
    attachments: ProfileAttachmentRequest
  ): Promise<ApiResponse<ProfileAttachmentResponse>> {
    return this.makeRequest<ProfileAttachmentResponse>(
      `/api/profiles/${encodeURIComponent(profileName)}/versions/${version}/attachments`,
      {
        method: 'POST',
        body: JSON.stringify(attachments),
      }
    )
  }

  async getProfileAttachments(
    profileName: string,
    version: number
  ): Promise<ApiResponse<ProfileAttachmentResponse>> {
    return this.makeRequest<ProfileAttachmentResponse>(
      `/api/profiles/${encodeURIComponent(profileName)}/versions/${version}/attachments`
    )
  }

  // ========================================
  // Workspace Profile Binding API
  // ========================================

  async upgradeWorkspaceProfile(
    workspaceId: string,
    data: WorkspaceProfileUpgradeRequest
  ): Promise<ApiResponse<WorkspaceProfileUpgradeResponse>> {
    return this.makeRequest<WorkspaceProfileUpgradeResponse>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/profile/upgrade`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )
  }

  async getWorkspaceProfile(workspaceId: string): Promise<ApiResponse<WorkspaceProfileBinding>> {
    return this.makeRequest<WorkspaceProfileBinding>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/profile`
    )
  }

  // ========================================
  // Session Management API
  // ========================================

  async getSessions(params: SessionQueryParams): Promise<ApiResponse<{ sessions: Session[] }>> {
    const queryString = new URLSearchParams({
      workspace_id: params.workspace_id,
      ...(params.task_id && { task_id: params.task_id }),
    }).toString()

    return this.makeRequest<{ sessions: Session[] }>(`/api/sessions?${queryString}`)
  }

  // ========================================
  // Rules Management API
  // ========================================

  async createRule(rule: RuleCreateRequest): Promise<ApiResponse<RuleCreateResponse>> {
    return this.makeRequest<RuleCreateResponse>('/api/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    })
  }

  async getRules(workspaceId: string): Promise<ApiResponse<RuleListResponse>> {
    return this.makeRequest<RuleListResponse>(
      `/api/rules?workspace_id=${encodeURIComponent(workspaceId)}`
    )
  }

  // ========================================
  // Task Dependencies API
  // ========================================

  async addTaskDependency(
    workspaceId: string,
    taskId: string,
    dependsOn: string
  ): Promise<ApiResponse<{ created: boolean }>> {
    return this.makeRequest<{ created: boolean }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/dependencies`,
      {
        method: 'POST',
        body: JSON.stringify({ depends_on: dependsOn }),
      }
    )
  }

  async removeTaskDependency(
    workspaceId: string,
    taskId: string,
    dependsOn: string
  ): Promise<ApiResponse<{ removed: boolean }>> {
    return this.makeRequest<{ removed: boolean }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/dependencies/${encodeURIComponent(dependsOn)}`,
      {
        method: 'DELETE',
      }
    )
  }

  async getTaskDependencies(
    workspaceId: string,
    taskId: string
  ): Promise<ApiResponse<{ dependencies: TaskDependency[] }>> {
    return this.makeRequest<{ dependencies: TaskDependency[] }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/dependencies`
    )
  }

  async patchTaskStatus(
    workspaceId: string,
    taskId: string,
    status: Task['status']
  ): Promise<ApiResponse<{ task: Task }>> {
    return this.makeRequest<{ task: Task }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    )
  }

  // ========================================
  // Server-Sent Events (Real-time Updates)
  // ========================================

  connectSSE(clientId?: string): void {
    if (this.sseConnection) {
      this.disconnectSSE()
    }

    // Use environment variable for SSE URL or construct from base URL
    const envSseUrl = typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_MCP_SSE_URL
      ? import.meta.env.VITE_MCP_SSE_URL
      : null;

    const sseUrl = envSseUrl || `${this.baseUrl}/mcp`
    const url = `${sseUrl}${clientId ? `?clientId=${clientId}` : ''}`

    console.log(`Connecting to SSE: ${url}`)
    this.sseConnection = new EventSource(url)

    this.sseConnection.onopen = () => {
      console.log('SSE connection opened')
      this.emitEvent('connection.status', { status: 'connected' })
    }

    this.sseConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.emitEvent(data.type, data)
      } catch (error) {
        console.error('Failed to parse SSE event:', error)
      }
    }

    this.sseConnection.onerror = (error) => {
      console.error('SSE connection error:', error)
      this.emitEvent('connection.status', { status: 'error', error })
    }
  }

  disconnectSSE(): void {
    if (this.sseConnection) {
      this.sseConnection.close()
      this.sseConnection = null
      this.emitEvent('connection.status', { status: 'disconnected' })
    }
  }

  onSSEEvent(eventType: string, handler: SSEEventHandler): () => void {
    if (!this.sseEventHandlers.has(eventType)) {
      this.sseEventHandlers.set(eventType, new Set())
    }

    this.sseEventHandlers.get(eventType)!.add(handler)

    // Return cleanup function
    return () => {
      const handlers = this.sseEventHandlers.get(eventType)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          this.sseEventHandlers.delete(eventType)
        }
      }
    }
  }

  private emitEvent(eventType: string, data: any): void {
    const handlers = this.sseEventHandlers.get(eventType)
    if (handlers) {
      const event: SSEEvent = {
        type: eventType as any,
        data,
        timestamp: new Date().toISOString(),
      }
      handlers.forEach(handler => handler(event))
    }
  }

  // ========================================
  // Cleanup
  // ========================================

  destroy(): void {
    this.disconnectSSE()
    this.sseEventHandlers.clear()
  }
  // (Legacy helper methods removed)
}

// ========================================
// React Hook for API Client
// ========================================

import { useState, useEffect, useRef } from 'react'

export interface UseApiClientOptions extends ApiClientConfig {
  autoConnectSSE?: boolean
  sseClientId?: string
}

export function useApiClient(options: UseApiClientOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const clientRef = useRef<SpeclyApiClient | null>(null)

  useEffect(() => {
    const client = new SpeclyApiClient(options)
    clientRef.current = client

    if (options.autoConnectSSE !== false) {
      // Set up connection status monitoring
      const unsubscribe = client.onSSEEvent('connection.status', (event) => {
        setIsConnected(event.data.status === 'connected')
        setConnectionError(event.data.status === 'error' ? event.data.error : null)
      })

      // Connect to SSE
      client.connectSSE(options.sseClientId)

      return () => {
        unsubscribe()
        client.destroy()
      }
    }

    return () => {
      client.destroy()
    }
  }, [])

  return {
    client: clientRef.current,
    isConnected,
    connectionError,
  }
}

// ========================================
// Singleton API Client Instance
// ========================================

// Create API client without automatic SSE connection
export const apiClient = new SpeclyApiClient({
  // Disable auto-connect by default
  autoConnectSSE: false
})
