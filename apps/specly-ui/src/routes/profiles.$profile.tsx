import { createFileRoute, useParams } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Loader2, Plus, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';

export const Route = createFileRoute('/profiles/$profile')({
  component: ProfileDetailPage,
})

function ProfileDetailPage() {
  const { profile: profileName } = Route.useParams();
  const queryClient = useQueryClient();
  const [selectedTool, setSelectedTool] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);

  // Fetch tools for selection
  const { data: toolsData } = useQuery({
    queryKey: ['tools'],
    queryFn: api.getTools,
  });

  // Fetch profile attachments (assuming version 1 for now as MVP)
  const { data: attachmentsData, isLoading } = useQuery({
    queryKey: ['profile-attachments', profileName, 1],
    queryFn: () => api.getProfileAttachments(profileName, 1),
  });

  const attachTool = useMutation({
    mutationFn: async () => {
      if (!selectedTool) return;
      // Fetch latest version of the tool to get hash
      const versionsRes = await api.getToolVersions(selectedTool);
      if (!versionsRes.versions.length) throw new Error('Tool has no versions');
      const latestVersion = versionsRes.versions[0]; // Assuming first is latest/default

      await api.attachToolToProfile(profileName, 1, [{
        tool_name: selectedTool,
        tool_version_hash: latestVersion.hash,
      }]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-attachments', profileName] });
      setIsAttaching(false);
      setSelectedTool('');
    },
  });

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{profileName}</h1>
        <p className="text-muted-foreground mt-2">
          Manage tools associated with this profile.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Attached Tools</CardTitle>
            <Dialog open={isAttaching} onOpenChange={setIsAttaching}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Attach Tool
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Attach Tool to Profile</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Select Tool</Label>
                    <Select value={selectedTool} onValueChange={setSelectedTool}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a tool..." />
                      </SelectTrigger>
                      <SelectContent>
                        {toolsData?.tools.map((tool) => (
                          <SelectItem key={tool.name} value={tool.name}>
                            {tool.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => attachTool.mutate()}
                    disabled={!selectedTool || attachTool.isPending}
                    className="w-full"
                  >
                    {attachTool.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Attach
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>
            Tools available in this profile (Version 1).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {attachmentsData?.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tools attached yet.
              </p>
            ) : (
              attachmentsData?.attachments.map((att: any) => (
                <div key={att.toolName} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-md">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium">{att.toolName}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {att.toolVersionHash.substring(0, 8)}
                      </p>
                    </div>
                  </div>
                  {/* Removal not yet implemented in backend API for this specific endpoint easily, skipping for MVP */}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
