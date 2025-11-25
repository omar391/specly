import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Box, Activity, Clock, ArrowRight } from 'lucide-react'
import { FadeIn } from '@/components/ui/fade-in'


export const Route = createFileRoute('/')({
    component: Index,
})

function Index() {
    const { data: workspaces, isLoading, error } = useWorkspaces()
    const navigate = useNavigate()

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-48 rounded-xl bg-white/5 animate-pulse" />
                ))}
            </div>
        )
    }

    if (error) {
        // If we can't fetch workspaces, likely not connected
        // In a real app we'd distinguish 401/403 vs connection refused
        return (
            <div className="text-center py-12 space-y-4">
                <p className="text-destructive">Failed to load workspaces</p>
                <Button onClick={() => navigate({ to: '/connect' })}>
                    Check Connection
                </Button>
            </div>
        )
    }

    return (
        <FadeIn className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-gradient">Workspaces</h2>
                    <p className="text-muted-foreground">Manage your automation environments</p>
                </div>
                <div className="flex gap-3">
                    <Link to="/profiles">
                        <Button variant="outline" className="gap-2">
                            <Activity className="w-4 h-4" />
                            Manage Profiles
                        </Button>
                    </Link>
                </div>
            </div>

            {workspaces?.length === 0 ? (
                <Card className="glass-card border-dashed border-white/20 flex flex-col items-center justify-center min-h-[300px] space-y-4">
                    <div className="bg-white/5 p-4 rounded-full">
                        <Box className="w-12 h-12 text-muted-foreground opacity-50" />
                    </div>
                    <div className="text-center space-y-1">
                        <h3 className="text-lg font-medium">No workspaces yet</h3>
                        <p className="text-muted-foreground max-w-xs mx-auto">
                            Create your first workspace to start managing tasks and tools.
                        </p>
                    </div>
                    <Button asChild>
                        <Link to="/workspaces/new">Create Workspace</Link>
                    </Button>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {workspaces?.map((workspace) => (
                        <Card key={workspace.id} className="glass-card hover:border-primary/50 transition-colors group cursor-pointer">
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <div className="bg-primary/10 p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
                                        <Box className="w-5 h-5 text-primary" />
                                    </div>
                                    <Badge variant={workspace.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                                        {workspace.status}
                                    </Badge>
                                </div>
                                <CardTitle className="mt-4">{workspace.name}</CardTitle>
                                <CardDescription className="font-mono text-xs truncate">
                                    {workspace.path}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground flex items-center gap-1.5">
                                            <Activity className="w-3.5 h-3.5" />
                                            Active Tasks
                                        </span>
                                        <span className="font-medium">{workspace.task_count}</span>
                                    </div>

                                    {workspace.active_task && (
                                        <div className="bg-white/5 rounded-md p-2 text-xs">
                                            <span className="text-primary font-medium block mb-0.5">Running:</span>
                                            <span className="truncate block">{workspace.active_task}</span>
                                        </div>
                                    )}

                                    <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(workspace.last_activity || workspace.updated_at).toLocaleDateString()}
                                        </span>
                                        <Button variant="ghost" size="sm" className="h-6 px-2 -mr-2 hover:bg-primary/10 hover:text-primary" asChild>
                                            <Link to="/workspaces/$workspaceId/tasks" params={{ workspaceId: workspace.id }}>
                                                Open <ArrowRight className="w-3 h-3 ml-1" />
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </FadeIn>
    )
}
