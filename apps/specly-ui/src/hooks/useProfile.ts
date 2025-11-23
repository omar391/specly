import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Profile {
    id: string;
    name: string;
    description: string;
    version: string;
    tools: string[];
}

export function useWorkspaceProfile(workspaceId: string) {
    return useQuery({
        queryKey: ['workspace-profile', workspaceId],
        queryFn: async () => {
            // Note: The backend returns the profile directly or wrapped. 
            // Adjusting based on standard API response patterns.
            const response = await api.get<any>(`/workspaces/${workspaceId}/profile`);
            return response;
        },
        enabled: !!workspaceId,
    });
}
