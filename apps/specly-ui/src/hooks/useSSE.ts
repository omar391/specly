import { useEffect } from 'react';
import { sseClient, type SSEEventType } from '../lib/sse';

export function useSSE<T = any>(type: SSEEventType, callback: (data: T) => void) {
    useEffect(() => {
        return sseClient.subscribe(type, callback);
    }, [type, callback]);
}
