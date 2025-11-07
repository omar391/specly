import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import { Link } from '@tanstack/react-router'
import { SectionWithContent } from '@/components/ui/section-with-content'
import { Folder, Zap, Moon } from 'lucide-react'
import { tailwindClasses, designSystem } from '@/lib/design-system'
import { apiClient, type WorkspaceMetadata } from '@/lib/api-client'
import { GettingStarted } from '@/components/getting-started'
import { ConnectionStatus } from '@/components/connection-status'

export function HomePage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error' | 'connecting'>('connecting')

  // Load workspaces from API
  useEffect(() => {
    const loadWorkspaces = async () => {
      setLoading(true)
      setError(null)
      setConnectionStatus('connecting')
      
      try {
        const response = await apiClient.getWorkspaces()
        
        if (response.error) {
          setError(response.error)
          setConnectionStatus('error')
        } else {
          setWorkspaces(response.data.workspaces)
          setConnectionStatus('connected')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workspaces')
        setConnectionStatus('error')
      } finally {
        setLoading(false)
      }
    }

    loadWorkspaces()

    // Set up real-time updates via SSE
    const unsubscribeWorkspaceUpdates = apiClient.onSSEEvent('workspace.status_changed', (event) => {
      setWorkspaces(prev => {
        const workspaceId = event.data.workspaceId
        return prev.map(ws => 
          ws.id === workspaceId 
            ? { ...ws, ...event.data.changes }
            : ws
        )
      })
    })

    return () => {
      unsubscribeWorkspaceUpdates()
    }
  }, [])



  
  const totalTasks = workspaces.reduce((sum, ws) => sum + (ws.task_count || 0), 0)
  
  const activeWorkspaces = workspaces.filter(ws => ws.status === 'active')
  const inactiveWorkspaces = workspaces.filter(ws => ws.status !== 'active')

  return (
    <div className="space-y-8">
      {/* Connection Status */}
      <div className="flex justify-end">
        <ConnectionStatus 
          status={connectionStatus}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
        />
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
          <div className="text-center py-12">
            <div 
              className="h-12 w-12 mx-auto rounded-full border-4 border-gray-200 border-t-blue-500 animate-spin mb-4"
            />
            <p className={tailwindClasses.typography.subtitle}>Loading workspaces...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm" style={{ borderColor: designSystem.colors.accent.orange }}>
          <div className="text-center py-12">
            <div 
              className="h-12 w-12 mx-auto rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: `${designSystem.colors.accent.orange}20` }}
            >
              <span className="text-2xl">⚠️</span>
            </div>
            <h3 
              className={`${tailwindClasses.typography.title} mb-3`}
              style={{ color: designSystem.colors.accent.orange }}
            >
              Failed to Load Workspaces
            </h3>
            <p className={`${tailwindClasses.typography.subtitle} mb-4`}>
              {error}
            </p>
            <Button 
              onClick={() => window.location.reload()}
              className="rounded-xl"
              style={{
                backgroundColor: designSystem.colors.accent.orange,
                color: 'white'
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Content - only show when not loading and no error */}
      {!loading && !error && (
        <>
          {/* No Workspaces - Prominent Getting Started Hint */}
          {workspaces.length === 0 && <GettingStarted />}

          {/* Show Active Workspaces first if any exist */}
      {activeWorkspaces.length > 0 && (
        <SectionWithContent
          icon={<Zap className="h-5 w-5" />}
          iconBgColor="bg-green-100"
          iconTextColor="text-green-600"
          title="Active Workspaces"
          description={`${activeWorkspaces.length} workspace${activeWorkspaces.length !== 1 ? 's' : ''} connected • ${totalTasks} total tasks`}
          hasContent={true}
        >
          <div className="space-y-4">
            {activeWorkspaces.map((workspace) => (
              <Link
                key={workspace.id}
                to="/workspace/$workspaceId/tasks"
                params={{ workspaceId: workspace.id }}
                className="block group"
              >
                <Card className="border-l-4 border-l-green-500 transition-all duration-200 group-hover:shadow-lg group-hover:bg-accent/5 cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center shrink-0 transition-colors group-hover:bg-green-200">
                        <Folder size={20} className="text-green-600" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-xl truncate text-gray-900 mb-1">
                          {workspace.name}
                        </CardTitle>
                        <CardDescription className="font-mono text-sm truncate" title={workspace.path}>
                          {workspace.path}
                        </CardDescription>
                      </div>
                      
                      {workspace.task_count && (
                        <div className="text-right shrink-0">
                          <div className="text-2xl font-bold text-green-600">
                            {workspace.task_count}
                          </div>
                          <div className="text-xs text-green-600 uppercase tracking-wide">
                            tasks
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {workspace.active_task && (
                      <div className="mt-4 p-3 rounded-lg border bg-green-50 border-green-200">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-2 w-2 rounded-full animate-pulse bg-green-600" />
                          <span className="text-xs font-medium uppercase tracking-wide text-green-600">
                            ACTIVE TASK
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900">
                          {workspace.active_task}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
              ))}
            </div>
          </SectionWithContent>
      )}

      {/* Available Workspaces - only show if there are inactive workspaces */}
      {inactiveWorkspaces.length > 0 && (
        <SectionWithContent
          icon={<Moon className="h-5 w-5" />}
          iconBgColor="bg-gray-100"
          iconTextColor="text-gray-600"
          title="Available Workspaces"
          description={`${inactiveWorkspaces.length} workspace${inactiveWorkspaces.length !== 1 ? 's' : ''} ready to connect`}
          hasContent={true}
        >
          <div className="space-y-4">
            {inactiveWorkspaces.map((workspace) => (
                <Link
                  key={workspace.id}
                  to="/workspace/$workspaceId/tasks"
                  params={{ workspaceId: workspace.id }}
                  className="block group"
                >
                  <Card className="border-l-4 border-l-gray-300 transition-all duration-200 group-hover:shadow-lg group-hover:bg-accent/5 cursor-pointer">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 transition-colors group-hover:bg-gray-200">
                          <Folder size={20} className="text-gray-600" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-xl truncate text-gray-900 mb-1">
                            {workspace.name}
                          </CardTitle>
                          <CardDescription className="font-mono text-sm truncate" title={workspace.path}>
                            {workspace.path}
                          </CardDescription>
                          {workspace.last_activity && (
                            <CardDescription className="text-xs mt-1">
                              Last active: {formatLastActivity(workspace.last_activity)}
                            </CardDescription>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 shrink-0">
                          {workspace.status === 'error' && (
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-orange-500" />
                              <span className="text-xs text-orange-500 font-medium">
                                Error
                              </span>
                            </div>
                          )}
                          
                          {workspace.task_count && (
                            <div className="text-right">
                              <div className="text-lg font-bold text-gray-600">
                                {workspace.task_count}
                              </div>
                              <div className="text-xs text-gray-600 uppercase tracking-wide">
                                tasks
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </SectionWithContent>
      )}
        </>
      )}
    </div>
  )

  function formatLastActivity(timestamp: string) {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return `${Math.floor(diffMins / 1440)}d ago`
  }
}
