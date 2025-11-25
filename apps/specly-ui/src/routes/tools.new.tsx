import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { GraphEditor } from '../components/tools/graph-editor';
import type { Spec } from '@/lib/types';
import { Loader2, Save } from 'lucide-react';
// import { useToast } from '../components/ui/use-toast'; // Not available, using alert for now or implement toast later

export const Route = createFileRoute('/tools/new')({
    component: CreateToolPage,
})

function CreateToolPage() {
    const navigate = useNavigate();
    // const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [basicInfo, setBasicInfo] = useState({
        name: '',
        description: '',
        command_alias: '',
    });
    const [graphData, setGraphData] = useState<{ nodes: any[], edges: any[] }>({
        nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'Entry Spec' }, type: 'custom' }],
        edges: []
    });

    const handleSubmit = async () => {
        if (!basicInfo.name) {
            alert("Validation Error: Tool name is required");
            return;
        }

        if (graphData.nodes.length === 0) {
            alert("Validation Error: At least one workflow step is required");
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. Create Tool
            await api.createTool(basicInfo);

            // 2. Create Specs (in parallel)
            // Map node IDs to real spec hashes
            const nodeIdToHash: Record<string, string> = {};

            const specHashes = await Promise.all(graphData.nodes.map(async (node) => {
                const specData: Spec = {
                    metadata: { name: node.data.label },
                    content_template: 'placeholder content',
                    executor_type: 'python',
                    executor_version: '3.9',
                    intent: 'process'
                };
                const res = await api.createSpec(specData);
                nodeIdToHash[node.id] = res.hash;
                return res.hash;
            }));

            // 3. Create Tool Version
            // Construct edges with hashes
            const graphEdges = graphData.edges.map(edge => ({
                from: nodeIdToHash[edge.source],
                to: nodeIdToHash[edge.target]
            }));

            // Construct layout
            const layout: Record<string, { x: number; y: number }> = {};
            graphData.nodes.forEach(node => {
                const hash = nodeIdToHash[node.id];
                if (hash) {
                    layout[hash] = { x: node.position.x, y: node.position.y };
                }
            });

            await api.createToolVersion(basicInfo.name, {
                ordered_specs: specHashes,
                entry_spec: specHashes[0], // Assuming first node is entry for now
                edges: graphEdges,
                layout: layout
            });

            // alert("Success: Tool created successfully");

            navigate({ to: '/tools/$tool', params: { tool: basicInfo.name } });
        } catch (error) {
            alert(`Error: ${(error as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-10">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Create New Tool</h1>
                <p className="text-muted-foreground mt-2">
                    Define a new tool and its initial workflow.
                </p>
            </div>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Basic Information</CardTitle>
                        <CardDescription>
                            General details about the tool.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Tool Name</Label>
                            <Input
                                id="name"
                                placeholder="e.g., data-analyzer"
                                value={basicInfo.name}
                                onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="alias">Command Alias (Optional)</Label>
                            <Input
                                id="alias"
                                placeholder="e.g., analyze"
                                value={basicInfo.command_alias}
                                onChange={(e) => setBasicInfo({ ...basicInfo, command_alias: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="What does this tool do?"
                                value={basicInfo.description}
                                onChange={(e) => setBasicInfo({ ...basicInfo, description: e.target.value })}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Workflow Definition</CardTitle>
                        <CardDescription>
                            Define the sequence of steps (specs) for this tool.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <GraphEditor initialNodes={graphData.nodes} onChange={setGraphData} />
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-4">
                    <Button variant="outline" onClick={() => navigate({ to: '/tools' })}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" />
                        Create Tool
                    </Button>
                </div>
            </div>
        </div>
    );
}
