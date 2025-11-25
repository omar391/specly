import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Loader2, ArrowLeft, GitBranch, GitCommit } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { GraphEditor } from '../components/tools/graph-editor';
import type { ToolVersion } from '../lib/types';

export const Route = createFileRoute('/tools/$tool')({
  component: ToolDetailPage,
})

function ToolDetailPage() {
  const { tool: toolName } = Route.useParams();
  const [selectedVersion, setSelectedVersion] = useState<ToolVersion | null>(null);

  const { data: toolData, isLoading: isToolLoading } = useQuery({
    queryKey: ['tool', toolName],
    queryFn: () => api.getTool(toolName),
  });

  const { data: versionsData, isLoading: isVersionsLoading } = useQuery({
    queryKey: ['tool', toolName, 'versions'],
    queryFn: () => api.getToolVersions(toolName),
  });

  const isLoading = isToolLoading || isVersionsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const tool = toolData?.tool;
  const versions = versionsData?.versions || [];

  if (!tool) {
    return (
      <div className="p-4 text-center">
        <h2 className="text-xl font-bold text-red-500">Tool not found</h2>
        <Button variant="link" asChild className="mt-4">
          <Link to="/tools">Back to Tools</Link>
        </Button>
      </div>
    );
  }

  // ... tool not found check

  const getGraphData = (version: ToolVersion) => {
    const manifest = version.graphManifest;
    const nodes: any[] = manifest.ordered_specs.map((hash, index) => ({
      id: hash,
      position: manifest.layout?.[hash] || { x: index * 200, y: 100 }, // Fallback layout
      data: { label: manifest.specs?.[hash]?.metadata?.name || `Spec ${hash.substring(0, 8)}` },
      type: 'custom'
    }));

    const edges: any[] = manifest.edges.map((edge, index) => ({
      id: `e${index}`,
      source: edge.from,
      target: edge.to
    }));

    return { nodes, edges };
  };

  return (
    <div className="space-y-6">
      {/* ... header ... */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/tools">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {tool.name}
            {tool.commandAlias && (
              <Badge variant="outline" className="font-mono text-lg">
                {tool.commandAlias}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">{tool.description}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCommit className="w-5 h-5" />
                Versions (Workflows)
              </CardTitle>
              <CardDescription>
                Immutable snapshots of this tool's workflow graph.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {versions.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  No versions found for this tool.
                </div>
              ) : (
                versions.map((version) => (
                  <div
                    key={version.hash}
                    className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{version.hash.substring(0, 8)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                      <div className="text-sm">
                        <span className="font-medium">Entry Spec:</span>{' '}
                        <span className="font-mono text-xs text-muted-foreground">
                          {version.graphManifest.entry_spec.substring(0, 8)}...
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Nodes:</span>{' '}
                        {version.graphManifest.ordered_specs.length}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedVersion(version)}>
                      View Graph
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <span className="font-medium block text-muted-foreground">Created At</span>
                {new Date(tool.createdAt).toLocaleString()}
              </div>
              <div>
                <span className="font-medium block text-muted-foreground">Total Versions</span>
                {versions.length}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!selectedVersion} onOpenChange={(open) => !open && setSelectedVersion(null)}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Workflow Graph ({selectedVersion?.hash.substring(0, 8)})</DialogTitle>
          </DialogHeader>
          {selectedVersion && (
            <div className="flex-1 h-full min-h-[500px]">
              <GraphEditor
                readOnly
                initialNodes={getGraphData(selectedVersion).nodes}
                initialEdges={getGraphData(selectedVersion).edges}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
