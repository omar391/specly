import { createFileRoute, Link } from '@tanstack/react-router'
import { useTasks } from '@/hooks/useTasks'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Filter, Kanban, List as ListIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

export const Route = createFileRoute('/workspaces/$workspaceId/tasks')({
    component: TaskBoardPage,
})

import { TaskBoard } from '@/components/tasks/task-board'
import { useUpdateTaskGeneric } from '@/hooks/useTasks'

function TaskBoardPage() {
    const { workspaceId } = Route.useParams()
    const { data: tasksResponse, isLoading } = useTasks(workspaceId)
    const updateTask = useUpdateTaskGeneric(workspaceId)
    const [view, setView] = useState<'list' | 'board'>('list')

    if (isLoading) {
        return <div>Loading tasks...</div>
    }

    const tasks = tasksResponse?.tasks || []

    const handleUpdateStatus = (taskId: string, status: string) => {
        updateTask.mutate({
            taskId,
            updates: {
                field: 'status',
                value: status,
                reason: 'Board drag and drop'
            }
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Tasks</h2>
                    <p className="text-muted-foreground">Manage and track automation tasks</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="bg-secondary/50 p-1 rounded-lg flex items-center gap-1">
                        <Button
                            variant={view === 'list' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setView('list')}
                            className="h-7 px-2"
                        >
                            <ListIcon className="w-4 h-4 mr-1" /> List
                        </Button>
                        <Button
                            variant={view === 'board' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setView('board')}
                            className="h-7 px-2"
                        >
                            <Kanban className="w-4 h-4 mr-1" /> Board
                        </Button>
                    </div>
                    <Button variant="outline" size="sm">
                        <Filter className="w-4 h-4 mr-2" />
                        Filter
                    </Button>
                    <Button size="sm">
                        <Plus className="w-4 h-4 mr-2" />
                        New Task
                    </Button>
                </div>
            </div>

            {view === 'list' ? (
                <div className="space-y-2">
                    {tasks.map((task) => (
                        <Link
                            key={task.id}
                            to="/workspaces/$workspaceId/tasks/$taskId"
                            params={{ workspaceId, taskId: task.id }}
                            className="block"
                        >
                            <Card className="hover:bg-white/5 transition-colors cursor-pointer group">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        task.status === 'completed' ? "bg-green-500" :
                                            task.status === 'in_progress' ? "bg-blue-500 animate-pulse" :
                                                task.status === 'failed' ? "bg-red-500" :
                                                    "bg-slate-500"
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium truncate">{task.title}</span>
                                            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                                                {task.id}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground truncate">
                                            {task.description || "No description"}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                        <Badge variant="secondary" className="capitalize">
                                            {task.status.replace('_', ' ')}
                                        </Badge>
                                        <Badge variant={
                                            task.priority === 'high' ? 'destructive' :
                                                task.priority === 'medium' ? 'secondary' : 'outline'
                                        } className="capitalize">
                                            {task.priority}
                                        </Badge>
                                        <span className="w-20 text-right">{task.progress}%</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            ) : (
                <TaskBoard tasks={tasks} onUpdateStatus={handleUpdateStatus} />
            )}
        </div>
    )
}
