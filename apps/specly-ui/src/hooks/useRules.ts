import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Rule {
    id: string;
    content: string;
    created_at: string;
}

export interface CreateRuleRequest {
    content: string;
}

export function useRules() {
    return useQuery({
        queryKey: ['rules'],
        queryFn: async () => {
            const response = await api.get<{ rules: Rule[] }>('/rules');
            return response.rules;
        },
    });
}

export function useCreateRule() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CreateRuleRequest) => api.post<Rule>('/rules', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rules'] });
        },
    });
}
