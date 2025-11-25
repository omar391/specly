import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Loader2, Wrench, Plus } from 'lucide-react';

export const Route = createFileRoute('/tools/')({
    component: ToolsPage,
})

function ToolsPage() {
    const { data, isLoading, error } = useQuery({
        queryKey: ['tools'],
        queryFn: api.getTools,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-red-500 bg-red-50 rounded-md">
                Failed to load tools: {(error as Error).message}
            </div>
        );
    }

    const tools = data?.tools || [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Tools</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage available tools and their workflow definitions.
                    </p>
                </div>
                <Button asChild>
                    <Link to="/tools/new">
                        <Plus className="w-4 h-4 mr-2" />
                        Create Tool
                    </Link>
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {tools.length === 0 ? (
                    <div className="col-span-full text-center p-8 border rounded-lg bg-muted/20">
                        <Wrench className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">No tools found</h3>
                        <p className="text-muted-foreground mt-2">
                            Tools are registered via the API or CLI.
                        </p>
                    </div>
                ) : (
                    tools.map((tool) => (
                        <Link
                            key={tool.name}
                            to="/tools/$tool"
                            params={{ tool: tool.name }}
                            className="block transition-transform hover:scale-[1.02]"
                        >
                            <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <CardTitle className="truncate pr-4">{tool.name}</CardTitle>
                                        {tool.commandAlias && (
                                            <Badge variant="secondary" className="font-mono text-xs">
                                                {tool.commandAlias}
                                            </Badge>
                                        )}
                                    </div>
                                    <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                                        {tool.description || 'No description provided'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xs text-muted-foreground">
                                        Created {new Date(tool.createdAt).toLocaleDateString()}
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
