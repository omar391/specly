import { QueryClient } from '@tanstack/react-query';

export type SSEEventType = 'workspace.status_changed' | 'task.updated' | 'task.created' | 'connection.established';

export interface SSEEvent<T = any> {
    type: SSEEventType;
    data: T;
}

class SSEClient {
    private eventSource: EventSource | null = null;
    private listeners: Map<SSEEventType, Set<(data: any) => void>> = new Map();
    private queryClient: QueryClient | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;

    constructor() { }

    init(queryClient: QueryClient) {
        this.queryClient = queryClient;
        this.connect();
    }

    private connect() {
        if (this.eventSource?.readyState === EventSource.OPEN) return;

        this.eventSource = new EventSource('/api/sse');

        this.eventSource.onopen = () => {
            console.log('SSE Connected');
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
        };

        this.eventSource.onmessage = (event) => {
            try {
                const parsed = JSON.parse(event.data);
                this.handleEvent(parsed);
            } catch (err) {
                console.error('Failed to parse SSE message:', err);
            }
        };

        this.eventSource.onerror = (err) => {
            console.error('SSE Error:', err);
            this.eventSource?.close();
            this.eventSource = null;
            this.attemptReconnect();
        };
    }

    private attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max SSE reconnect attempts reached');
            return;
        }

        setTimeout(() => {
            this.reconnectAttempts++;
            this.reconnectDelay *= 1.5; // Exponential backoff
            this.connect();
        }, this.reconnectDelay);
    }

    private handleEvent(event: SSEEvent) {
        // Notify listeners
        if (this.listeners.has(event.type)) {
            this.listeners.get(event.type)?.forEach(listener => listener(event.data));
        }

        // Global Query Invalidation Logic
        if (this.queryClient) {
            switch (event.type) {
                case 'workspace.status_changed':
                    this.queryClient.invalidateQueries({ queryKey: ['workspaces'] });
                    break;
                case 'task.updated':
                case 'task.created':
                    const workspaceId = event.data.workspace_id;
                    if (workspaceId) {
                        this.queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] });
                        this.queryClient.invalidateQueries({ queryKey: ['workspaces'] }); // Update task counts
                        if (event.type === 'task.updated') {
                            this.queryClient.invalidateQueries({ queryKey: ['task', workspaceId, event.data.task.id] });
                        }
                    }
                    break;
            }
        }
    }

    subscribe<T = any>(type: SSEEventType, callback: (data: T) => void) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type)?.add(callback);

        return () => {
            this.listeners.get(type)?.delete(callback);
        };
    }
}

export const sseClient = new SSEClient();
