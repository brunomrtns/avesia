// ============================================================================
//  Web — Session Copilot WebSocket hook
//
//  Subscribes to the API's WebSocket copilot stream for a clinical session.
//  Receives real-time assistance items, status updates, and errors from the
//  SessionAIEngine (via Redis pub/sub). Drives the continuous copilot UI.
//
//  Reconnects automatically with backoff (same pattern as useKbProgress).
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';
import { buildApiUrl, getAccessToken, type CopilotEvent, type CopilotSettings } from './api-client.js';

interface UseSessionCopilotOptions {
  readonly sessionId: string | null | undefined;
  readonly enabled?: boolean;
  readonly onAssistance?: (event: Extract<CopilotEvent, { type: 'assistance' }>) => void;
  readonly onStatus?: (event: Extract<CopilotEvent, { type: 'status' }>) => void;
  readonly onError?: (event: Extract<CopilotEvent, { type: 'error' }>) => void;
  readonly onSettingsUpdate?: (settings: CopilotSettings) => void;
}

function buildCopilotWsUrl(sessionId: string, token: string): string {
  const httpUrl = buildApiUrl(`/sessions/${sessionId}/copilot`);
  const url = new URL(httpUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  return url.toString();
}

export function useSessionCopilot({
  sessionId,
  enabled = true,
  onAssistance,
  onStatus,
  onError,
  onSettingsUpdate,
}: UseSessionCopilotOptions): void {
  // Use refs to avoid reconnection when callbacks change.
  const onAssistanceRef = useRef(onAssistance);
  const onStatusRef = useRef(onStatus);
  const onErrorRef = useRef(onError);
  const onSettingsUpdateRef = useRef(onSettingsUpdate);

  onAssistanceRef.current = onAssistance;
  onStatusRef.current = onStatus;
  onErrorRef.current = onError;
  onSettingsUpdateRef.current = onSettingsUpdate;

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const token = getAccessToken();
    if (!token) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByUs = false;
    let attempt = 0;

    const connect = (): void => {
      socket = new WebSocket(buildCopilotWsUrl(sessionId, token));

      socket.onopen = () => {
        attempt = 0;
      };

      socket.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data as string) as CopilotEvent;
          switch (event.type) {
            case 'assistance':
              onAssistanceRef.current?.(event);
              break;
            case 'status':
              onStatusRef.current?.(event);
              break;
            case 'error':
              onErrorRef.current?.(event);
              break;
            case 'settings_update':
              onSettingsUpdateRef.current?.(event.data);
              break;
          }
        } catch {
          // ignore malformed payloads
        }
      };

      socket.onclose = () => {
        if (closedByUs) return;
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, 15_000);
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [sessionId, enabled]);
}

// ── Helper hook for managing copilot settings via REST ─────────────────────

export function useCopilotSettings(_sessionId: string | null | undefined) {
  const loadSettings = useCallback(async (id: string) => {
    const { api } = await import('./api-client.js');
    return api.sessions.getCopilotSettings(id);
  }, []);

  const saveSettings = useCallback(async (id: string, settings: Partial<CopilotSettings>) => {
    const { api } = await import('./api-client.js');
    return api.sessions.updateCopilotSettings(id, settings);
  }, []);

  return { loadSettings, saveSettings };
}
