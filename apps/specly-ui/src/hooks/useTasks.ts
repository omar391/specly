import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TasksResponse, Task, CreateTaskRequest, UpdateTaskRequest } from '../lib/types';

export function useTasks(workspaceId: string) {
    return useQuery({
        queryKey: ['tasks', workspaceId],
        queryFn: async () => {
            const response = await api.get<TasksResponse>(`/workspaces/${workspaceId}/tasks`);
            return response;
        },
        enabled: !!workspaceId,
    });
}

export function useTask(workspaceId: string, taskId: string) {
    return useQuery({
        queryKey: ['task', workspaceId, taskId],
        queryFn: async () => {
            const response = await api.get<{ task: Task }>(`/workspaces/${workspaceId}/tasks/${taskId}`);
            return response.task;
        },
        enabled: !!workspaceId && !!taskId,
    });
}

export function useCreateTask(workspaceId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CreateTaskRequest) =>
            api.post<{ task: Task }>(`/workspaces/${workspaceId}/tasks`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] });
        },
    });
}

export function useUpdateTask(workspaceId: string, taskId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: UpdateTaskRequest) =>
            api.put<{ task: Task }>(`/workspaces/${workspaceId}/tasks/${taskId}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] });
            queryClient.invalidateQueries({ queryKey: ['task', workspaceId, taskId] });
        },
    });
}

export function useUpdateTaskGeneric(workspaceId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ taskId, updates }: { taskId: string, updates: UpdateTaskRequest }) =>
            api.put<{ task: Task }>(`/workspaces/${workspaceId}/tasks/${taskId}`, updates),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] });
            queryClient.invalidateQueries({ queryKey: ['task', workspaceId, variables.taskId] });
        },
    });
}
