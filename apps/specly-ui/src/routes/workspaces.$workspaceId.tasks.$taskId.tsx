
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTask, useUpdateTask } from '@/hooks/useTasks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Play, Pause, XCircle, RotateCcw, Plus } from 'lucide-react'
import { useTaskDependencies, useAddTaskDependency, useRemoveTaskDependency } from '@/hooks/useTaskDependencies'
import { useState } from 'react'

export const Route = createFileRoute('/workspaces/$workspaceId/tasks/$taskId')({
    component: TaskDetail,
})

function TaskDetail() {
    const { workspaceId, taskId } = Route.useParams()
    const { data: task, isLoading, error } = useTask(workspaceId, taskId)
    const updateTask = useUpdateTask(workspaceId, taskId)

    if (isLoading) return <div>Loading task details...</div>
    if (error || !task) return <div>Task not found</div>

    const handleStatusChange = (newStatus: string) => {
        updateTask.mutate({
            field: 'status',
            value: newStatus,
            reason: 'User action from UI'
        })
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link to="/workspaces/$workspaceId/tasks" params={{ workspaceId }}>
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold tracking-tight">{task.title}</h2>
                        <Badge variant="outline" className="font-mono">{task.id}</Badge>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {task.status === 'queued' && (
                        <Button size="sm" onClick={() => handleStatusChange('in_progress')}>
                            <Play className="w-4 h-4 mr-2" /> Start
                        </Button>
                    )}
                    {task.status === 'in_progress' && (
                        <Button size="sm" variant="secondary" onClick={() => handleStatusChange('paused')}>
                            <Pause className="w-4 h-4 mr-2" /> Pause
                        </Button>
                    )}
                    {task.status === 'paused' && (
                        <Button size="sm" onClick={() => handleStatusChange('in_progress')}>
                            <Play className="w-4 h-4 mr-2" /> Resume
                        </Button>
                    )}
                    {(task.status === 'failed' || task.status === 'completed') && (
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange('queued')}>
                            <RotateCcw className="w-4 h-4 mr-2" /> Retry
                        </Button>
                    )}
                    {['queued', 'in_progress', 'paused'].includes(task.status) && (
                        <Button size="sm" variant="destructive" onClick={() => handleStatusChange('failed')}>
                            <XCircle className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Overview</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                                <p className="text-sm leading-relaxed">{task.description || "No description provided."}</p>
                            </div>

                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-muted-foreground">Progress</span>
                                    <span className="font-medium">{task.progress}%</span>
                                </div>
                                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary transition-all duration-500"
                                        style={{ width: `${task.progress}% ` }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                                <div>
                                    <span className="text-xs text-muted-foreground block">Status</span>
                                    <Badge variant="secondary" className="mt-1 capitalize">
                                        {task.status.replace('_', ' ')}
                                    </Badge>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground block">Priority</span>
                                    <Badge variant={
                                        task.priority === 'high' ? 'destructive' :
                                            task.priority === 'medium' ? 'secondary' : 'outline'
                                    } className="mt-1 capitalize">
                                        {task.priority}
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Execution Log</CardTitle>
                            <CardDescription>Recent activity and events</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-white/10 rounded-lg">
                                No logs available yet.
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Metadata</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Created</span>
                                <span>{new Date(task.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Updated</span>
                                <span>{new Date(task.updated_at).toLocaleDateString()}</span>
                            </div>
                            {task.completed_at && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Completed</span>
                                    <span>{new Date(task.completed_at).toLocaleDateString()}</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Dependencies</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <TaskDependenciesList workspaceId={workspaceId} taskId={taskId} />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function TaskDependenciesList({ workspaceId, taskId }: { workspaceId: string, taskId: string }) {
    const { data: dependencies, isLoading } = useTaskDependencies(workspaceId, taskId)
    const addDependency = useAddTaskDependency(workspaceId, taskId)
    const removeDependency = useRemoveTaskDependency(workspaceId, taskId)
    const [newDepId, setNewDepId] = useState('')

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault()
        if (!newDepId.trim()) return
        addDependency.mutate(newDepId, { onSuccess: () => setNewDepId('') })
    }

    if (isLoading) return <div className="text-sm text-muted-foreground">Loading dependencies...</div>

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                {dependencies?.map((depId) => (
                    <div key={depId} className="flex items-center justify-between text-sm bg-secondary/20 p-2 rounded-md">
                        <span className="font-mono">{depId}</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeDependency.mutate(depId)}
                        >
                            <XCircle className="w-4 h-4" />
                        </Button>
                    </div>
                ))}
                {dependencies?.length === 0 && (
                    <div className="text-sm text-muted-foreground">No dependencies linked.</div>
                )}
            </div>

            <form onSubmit={handleAdd} className="flex gap-2">
                <Input
                    placeholder="Task ID..."
                    value={newDepId}
                    onChange={(e) => setNewDepId(e.target.value)}
                    className="h-8 text-xs"
                />
                <Button type="submit" size="sm" className="h-8" disabled={addDependency.isPending}>
                    <Plus className="w-3 h-3" />
                </Button>
            </form>
        </div>
    )
}

