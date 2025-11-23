import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface TaskDependency {
    taskId: string;
    dependsOnTaskId: string;
    type: 'blocks' | 'required_by'; // Simplified for UI
}

export function useTaskDependencies(workspaceId: string, taskId: string) {
    return useQuery({
        queryKey: ['task-dependencies', workspaceId, taskId],
        queryFn: async () => {
            const response = await api.get<{ dependencies: string[] }>(`/workspaces/${workspaceId}/tasks/${taskId}/dependencies`);
            return response.dependencies; // Returns array of task IDs this task depends on
        },
        enabled: !!workspaceId && !!taskId,
    });
}

export function useAddTaskDependency(workspaceId: string, taskId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (dependsOnTaskId: string) =>
            api.post(`/workspaces/${workspaceId}/tasks/${taskId}/dependencies`, { dependsOn: dependsOnTaskId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['task-dependencies', workspaceId, taskId] });
        },
    });
}

export function useRemoveTaskDependency(workspaceId: string, taskId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (dependsOnTaskId: string) =>
            api.delete(`/workspaces/${workspaceId}/tasks/${taskId}/dependencies/${dependsOnTaskId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['task-dependencies', workspaceId, taskId] });
        },
    });
}
