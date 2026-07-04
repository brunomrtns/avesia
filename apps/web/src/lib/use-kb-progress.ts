// ============================================================================
//  Web — Knowledge Base progress WebSocket hook
//
//  Subscribes to the API's WebSocket progress stream for a knowledge base and
//  invokes a callback for every pipeline progress event emitted by the worker
//  (via Redis pub/sub). Drives real-time graph/document updates in the UI.
//  Reconnects automatically with backoff.
// ============================================================================

import { useEffect, useRef } from 'react';
import { buildApiUrl, ensureFreshAccessToken } from './api-client.js';

export interface KbProgressEvent {
  readonly documentId: string;
  readonly knowledgeBaseId: string;
  readonly organizationId: string;
  readonly stage: string;
  readonly stageIndex: number;
  readonly stageTotal: number;
  readonly progress: number;
  readonly status: 'running' | 'completed' | 'failed';
  readonly message: string;
  readonly timestamp: string;
}

interface UseKbProgressOptions {
  readonly knowledgeBaseId: string | null | undefined;
  readonly onEvent: (event: KbProgressEvent) => void;
  readonly enabled?: boolean;
}

function buildWsUrl(knowledgeBaseId: string, token: string): string {
  // buildApiUrl returns an http(s) URL under /avesia/api/... ; convert to ws(s).
  const httpUrl = buildApiUrl(`/knowledge-bases/${knowledgeBaseId}/progress`);
  const url = new URL(httpUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  return url.toString();
}

export function useKbProgress({ knowledgeBaseId, onEvent, enabled = true }: UseKbProgressOptions): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !knowledgeBaseId) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByUs = false;
    let attempt = 0;

    const connect = async (): Promise<void> => {
      const token = await ensureFreshAccessToken();
      if (cancelled || !token) return;

      socket = new WebSocket(buildWsUrl(knowledgeBaseId, token));

      socket.onopen = () => {
        attempt = 0;
      };

      socket.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data as string) as KbProgressEvent;
          onEventRef.current(event);
        } catch {
          // ignore malformed payloads
        }
      };

      socket.onclose = () => {
        if (closedByUs) return;
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, 15_000);
        reconnectTimer = setTimeout(() => void connect(), delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    void connect();

    return () => {
      cancelled = true;
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [knowledgeBaseId, enabled]);
}
