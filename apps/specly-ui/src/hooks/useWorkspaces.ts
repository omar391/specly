import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { WorkspacesResponse } from '../lib/types';

export function useWorkspaces() {
    return useQuery({
        queryKey: ['workspaces'],
        queryFn: async () => {
            const response = await api.get<any>('/workspaces');
            return response.data?.workspaces || [];
        },
    });
}
