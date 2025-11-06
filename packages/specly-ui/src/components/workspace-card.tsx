import { Button } from '@/components/ui/button'
import { Folder, Clock, Activity, Wifi, WifiOff, AlertTriangle } from 'lucide-react'

interface WorkspaceCardProps {
  workspace: {
    id: string
    name: string
    path: string
    status: 'connected' | 'disconnected' | 'error'
    lastActivity?: string
    taskCount?: number
    activeTask?: string
  }
  onConnect?: (id: string) => void
  onDisconnect?: (id: string) => void
}

export function WorkspaceCard({ workspace, onConnect, onDisconnect }: WorkspaceCardProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'connected':
        return {
          color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
          icon: Wifi,
          pulse: 'bg-emerald-500'
        }
      case 'disconnected':
        return {
          color: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
          icon: WifiOff,
          pulse: 'bg-gray-400'
        }
      case 'error':
        return {
          color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
          icon: AlertTriangle,
          pulse: 'bg-red-500'
        }
      default:
        return {
          color: 'bg-gray-100 text-gray-600',
          icon: WifiOff,
          pulse: 'bg-gray-400'
        }
    }
  }

  const formatLastActivity = (timestamp?: string) => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return `${Math.floor(diffMins / 1440)}d ago`
  }

  const statusConfig = getStatusConfig(workspace.status)
  const StatusIcon = statusConfig.icon

  return (
    <div className="modern-card">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Folder size={20} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-lg truncate">{workspace.name}</h3>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {workspace.path}
              </p>
            </div>
          </div>
          
          <div className={`status-indicator ${statusConfig.color}`}>
            <StatusIcon size={12} />
            {workspace.status}
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
              <Clock size={14} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">
              {formatLastActivity(workspace.lastActivity)}
            </span>
          </div>
          
          {workspace.taskCount !== undefined && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                <Activity size={14} className="text-muted-foreground" />
              </div>
              <span className="text-muted-foreground">
                {workspace.taskCount} tasks
              </span>
            </div>
          )}
        </div>

        {/* Active Task */}
        {workspace.activeTask && (
          <div className="p-3 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 text-xs text-primary font-medium mb-1">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
              ACTIVE TASK
            </div>
            <p className="text-sm font-medium text-foreground">
              {workspace.activeTask}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {workspace.status === 'connected' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDisconnect?.(workspace.id)}
              className="flex-1 rounded-xl"
            >
              Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onConnect?.(workspace.id)}
              className="flex-1 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              Connect
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
