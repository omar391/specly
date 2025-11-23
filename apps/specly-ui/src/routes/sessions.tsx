import { createFileRoute } from '@tanstack/react-router'
import { useSessions } from '@/hooks/useSessions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, Clock, Terminal } from 'lucide-react'

export const Route = createFileRoute('/sessions')({
    component: Sessions,
})

function Sessions() {
    const { data: sessions, isLoading, error } = useSessions()

    if (isLoading) return <div>Loading sessions...</div>
    if (error) return <div>Error loading sessions</div>

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Sessions</h2>
                <p className="text-muted-foreground">Active and past automation sessions</p>
            </div>

            <div className="grid gap-4">
                {sessions?.map((session) => (
                    <Card key={session.id} className="hover:bg-white/5 transition-colors">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <Terminal className="w-5 h-5 text-muted-foreground" />
                                    <CardTitle className="text-lg font-mono">{session.id}</CardTitle>
                                </div>
                                <Badge variant={session.is_active ? 'default' : 'secondary'}>
                                    {session.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                            </div>
                            <CardDescription>Workspace: {session.workspace_id}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Clock className="w-4 h-4" />
                                    Created: {new Date(session.created_at).toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Activity className="w-4 h-4" />
                                    Last Activity: {new Date(session.last_activity).toLocaleString()}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {sessions?.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        No sessions found.
                    </div>
                )}
            </div>
        </div>
    )
}
