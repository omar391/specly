import type { ToolsResponse, ToolResponse, ToolVersionsResponse } from './types';

const API_BASE = '/api';

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        throw new ApiError(response.status, await response.text());
    }

    return response.json();
}

export const api = {
    get: <T>(endpoint: string) => request<T>(endpoint),
    post: <T>(endpoint: string, body: any) => request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
    put: <T>(endpoint: string, body: any) => request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
    patch: <T>(endpoint: string, body: any) => request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
    getTools: () => request<ToolsResponse>('/tools'),
    getTool: (name: string) => request<ToolResponse>(`/tools/${name}`),
    getToolVersions: (name: string) => request<ToolVersionsResponse>(`/tools/${name}/versions`),
    createTool: (data: { name: string; description?: string; command_alias?: string }) => request<{ name: string; created: boolean }>('/tools', { method: 'POST', body: JSON.stringify(data) }),
    createToolVersion: (toolName: string, data: { ordered_specs: string[]; entry_spec: string; edges?: any[]; layout?: any }) => request<{ hash: string; created: boolean }>(`/tools/${toolName}/versions`, { method: 'POST', body: JSON.stringify(data) }),
    createSpec: (spec: any) => request<{ hash: string; created: boolean }>('/specs', { method: 'POST', body: JSON.stringify(spec) }),
    attachToolToProfile: (profileName: string, version: number, attachments: Array<{ tool_name: string; tool_version_hash: string; command_alias?: string }>) => request<{ attached: any[] }>(`/profiles/${profileName}/versions/${version}/attachments`, { method: 'POST', body: JSON.stringify({ attachments }) }),
    getProfileAttachments: (profileName: string, version: number) => request<{ attachments: any[] }>(`/profiles/${profileName}/versions/${version}/attachments`),
};
