import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useWorkspaceProfile } from '@/hooks/useProfile'
import { FileCode, Box } from 'lucide-react'

export const Route = createFileRoute('/workspaces/$workspaceId')({
    component: WorkspaceLayout,
})

function WorkspaceLayout() {
    const { workspaceId } = Route.useParams()

    return (
        <div className="h-full grid lg:grid-cols-4 gap-6 p-6">
            <div className="lg:col-span-1 space-y-6">
                <WorkspaceProfile workspaceId={workspaceId} />

                <Card className="bg-white/5 border-white/10 p-4">
                    {/* Additional content for the card could go here */}
                    <p className="text-white/70">Workspace specific header or context provider could go here.</p>
                </Card>
            </div>
            <div className="lg:col-span-3">
                <Outlet />
            </div>
        </div>
    )
}

function WorkspaceProfile({ workspaceId }: { workspaceId: string }) {
    const { data: profile, isLoading } = useWorkspaceProfile(workspaceId)

    if (isLoading) return <div className="h-20 animate-pulse bg-white/5 rounded-lg" />
    if (!profile) return null

    return (
        <Card className="bg-white/5 border-white/10">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <FileCode className="w-5 h-5 text-primary" />
                    Workspace Profile
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <div className="text-sm font-medium text-muted-foreground">Active Profile</div>
                    <div className="text-lg font-mono">{profile.name || 'Default'}</div>
                </div>
                <div>
                    <div className="text-sm font-medium text-muted-foreground">Version</div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">v{profile.version || '1.0.0'}</Badge>
                    </div>
                </div>
                {profile.tools && profile.tools.length > 0 && (
                    <div>
                        <div className="text-sm font-medium text-muted-foreground mb-2">Enabled Tools</div>
                        <div className="flex flex-wrap gap-2">
                            {profile.tools.map((tool: string) => (
                                <Badge key={tool} variant="secondary" className="text-xs">
                                    <Box className="w-3 h-3 mr-1" />
                                    {tool}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
