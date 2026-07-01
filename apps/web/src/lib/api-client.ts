import type {
  CreatePatientRequest,
  CreateSessionRequest,
  LoginRequest,
  LoginResponse,
  MeResponse,
  PatientListResponse,
  PatientListQuery,
  PatientResponse,
  RefreshResponse,
  SessionListQuery,
  SessionListResponse,
  SessionResponse,
  UpdatePatientRequest,
  UpdateSessionRequest,
} from '@avesia/types';

const VITE_API_URL = import.meta.env.VITE_API_URL;
const API_PREFIX = '/avesia/api';
export const REFRESH_ENDPOINT = `${API_PREFIX}/auth/refresh`;
export const REFRESH_TOKEN_KEY = 'avesia_refresh_token';

export interface InsightSource {
  chunkId: string;
  documentId: string;
  section: string | null;
  headingPath: string[];
  score: number;
}

export interface SessionInsightsResponse {
  content: string;
  sources?: InsightSource[];
  conceptIds?: string[];
  community?: number | null;
  tokensUsed?: number;
}

// ── Copilot types ──────────────────────────────────────────────────────────

export type AssistanceType = 'insight' | 'hypothesis' | 'question' | 'attention' | 'connection';
export type Confidence = 'high' | 'medium' | 'low';

export interface AssistanceItem {
  type: AssistanceType;
  content: string;
  confidence: Confidence;
  sourceConcepts?: string[];
  sourceDocuments?: string[];
}

export interface CopilotSettings {
  enabled: boolean;
  intensity: 'low' | 'medium' | 'high';
  maxFrequencyMs: number;
  autoGenerate: boolean;
}

export interface CopilotAssistanceEvent {
  type: 'assistance';
  sessionId: string;
  timestamp: number;
  data: {
    items: AssistanceItem[];
    segmentSeqStart: number;
    segmentSeqEnd: number;
    conceptIds: string[];
    community: number | null;
    tokensUsed: number;
    durationMs: number;
    sufficientContext: boolean;
    contextNote?: string;
  };
}

export interface CopilotStatusEvent {
  type: 'status';
  sessionId: string;
  timestamp: number;
  data: {
    status: 'idle' | 'processing' | 'disabled';
    pendingSegments: number;
  };
}

export interface CopilotErrorEvent {
  type: 'error';
  sessionId: string;
  timestamp: number;
  data: {
    message: string;
    code: string;
  };
}

export type CopilotEvent = CopilotAssistanceEvent | CopilotStatusEvent | CopilotErrorEvent | {
  type: 'settings_update';
  sessionId: string;
  timestamp: number;
  data: CopilotSettings;
};

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly params?: Record<string, string | number | undefined>;
}

export function buildApiUrl(path: string): string {
  if (VITE_API_URL) {
    if (VITE_API_URL.startsWith('http://') || VITE_API_URL.startsWith('https://')) {
      return `${VITE_API_URL}${path}`;
    }
    return `${window.location.origin}${VITE_API_URL}${path}`;
  }
  return `${window.location.origin}${API_PREFIX}${path}`;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(buildApiUrl(path));
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      setRefreshToken(null);
      return null;
    }

    const data = (await res.json()) as RefreshResponse;
    accessToken = data.tokens.accessToken;
    setRefreshToken(data.tokens.refreshToken);
    return data.tokens.accessToken;
  } catch {
    setRefreshToken(null);
    return null;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };
  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  } else if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    fetchOptions.body = JSON.stringify({});
  }

  const res = await fetch(buildUrl(path, params), fetchOptions);

  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const newToken = await refreshPromise;
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      const retryOptions: RequestInit = {
        method,
        headers,
      };
      if (body !== undefined) {
        retryOptions.body = JSON.stringify(body);
      } else if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
        retryOptions.body = JSON.stringify({});
      }
      const retryRes = await fetch(buildUrl(path, params), retryOptions);
      if (!retryRes.ok) {
        throw new ApiError(retryRes.status, retryRes.statusText, await safeParseJson(retryRes));
      }
      return (await retryRes.json()) as T;
    }

    setAccessToken(null);
    setRefreshToken(null);
    window.location.href = '/login';
    throw new ApiError(401, 'Session expired', null);
  }

  if (!res.ok) {
    throw new ApiError(res.status, res.statusText, await safeParseJson(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

async function safeParseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export const api = {
  auth: {
    login: (data: LoginRequest): Promise<LoginResponse> =>
      request<LoginResponse>('/auth/login', { method: 'POST', body: data }),
    me: (): Promise<MeResponse> => request<MeResponse>('/auth/me'),
    refresh: (): Promise<RefreshResponse> =>
      request<RefreshResponse>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: getRefreshToken() },
      }),
  },

  patients: {
    list: (query?: PatientListQuery): Promise<PatientListResponse> =>
      request<PatientListResponse>('/patients', query ? { params: query as Record<string, string | number | undefined> } : {}),
    get: (id: string): Promise<PatientResponse> =>
      request<PatientResponse>(`/patients/${id}`),
    create: (data: CreatePatientRequest): Promise<PatientResponse> =>
      request<PatientResponse>('/patients', { method: 'POST', body: data }),
    update: (id: string, data: UpdatePatientRequest): Promise<PatientResponse> =>
      request<PatientResponse>(`/patients/${id}`, { method: 'PATCH', body: data }),
    delete: (id: string): Promise<void> =>
      request<void>(`/patients/${id}`, { method: 'DELETE' }),
  },

  sessions: {
    list: (query?: SessionListQuery): Promise<SessionListResponse> =>
      request<SessionListResponse>('/sessions', query ? { params: query as Record<string, string | number | undefined> } : {}),
    get: (id: string): Promise<SessionResponse> =>
      request<SessionResponse>(`/sessions/${id}`),
    create: (data: CreateSessionRequest): Promise<SessionResponse> =>
      request<SessionResponse>('/sessions', { method: 'POST', body: data }),
    update: (id: string, data: UpdateSessionRequest): Promise<SessionResponse> =>
      request<SessionResponse>(`/sessions/${id}`, { method: 'PATCH', body: data }),
    listProfessionals: (): Promise<{ items: Array<{ id: string; fullName: string }> }> =>
      request<{ items: Array<{ id: string; fullName: string }> }>('/sessions/professionals'),
    addSegment: (id: string, data: { text: string; speaker: string; startTime?: number; endTime?: number }): Promise<Record<string, unknown>> =>
      request<Record<string, unknown>>(`/sessions/${id}/segments`, { method: 'POST', body: data }),
    transcribeChunk: (id: string): Promise<Record<string, unknown>[]> =>
      request<Record<string, unknown>[]>(`/sessions/${id}/transcribe-chunk`, { method: 'POST' }),
    getInsights: (id: string): Promise<SessionInsightsResponse> =>
      request<SessionInsightsResponse>(`/sessions/${id}/insights`, { method: 'POST' }),
    diarize: (id: string): Promise<{ success: boolean; updatedCount: number }> =>
      request<{ success: boolean; updatedCount: number }>(`/sessions/${id}/diarize`, { method: 'POST' }),
    // Copilot
    getCopilotSettings: (id: string): Promise<CopilotSettings> =>
      request<CopilotSettings>(`/sessions/${id}/copilot/settings`),
    updateCopilotSettings: (id: string, data: Partial<CopilotSettings>): Promise<CopilotSettings> =>
      request<CopilotSettings>(`/sessions/${id}/copilot/settings`, { method: 'PUT', body: data }),
    getCopilotAnalyses: (id: string): Promise<Record<string, unknown>[]> =>
      request<Record<string, unknown>[]>(`/sessions/${id}/copilot/analyses`),
  },

  organization: {
    get: <T>(): Promise<T> => request<T>('/organization'),
    update: <T>(data: { name?: string; slug?: string }): Promise<T> =>
      request<T>('/organization', { method: 'PATCH', body: data }),
    listContextDocuments: <T>(): Promise<T> =>
      request<T>('/organization/context-documents'),
    createContextDocument: <T>(data: { fileName: string }): Promise<T> =>
      request<T>('/organization/context-documents', { method: 'POST', body: data }),
    deleteContextDocument: (id: string): Promise<void> =>
      request<void>(`/organization/context-documents/${id}`, { method: 'DELETE' }),
  },

  health: {
    check: <T>(): Promise<T> => request<T>('/health/ai'),
  },
};
