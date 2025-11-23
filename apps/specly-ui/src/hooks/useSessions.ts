import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SessionsResponse } from '../lib/types';

export function useSessions() {
    return useQuery({
        queryKey: ['sessions'],
        queryFn: async () => {
            const response = await api.get<SessionsResponse>('/sessions');
            return response.sessions;
        },
    });
}
