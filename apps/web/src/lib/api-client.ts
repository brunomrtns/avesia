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

// ── Briefing / SOAP / Post-session analysis types ──────────────────────────

export interface BriefingResponse {
  content: string;
  generatedAt: string;
  hasHistory: boolean;
  tokensUsed?: number;
}

export interface SOAPContent {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  observations: string;
  tasks: string[];
}

export interface SOAPNoteResponse {
  noteId: string;
  content: SOAPContent;
  status: 'DRAFT';
  tokensUsed?: number;
  generatedAt: string;
}

export interface PostSessionAnalysisResponse {
  summary: string;
  analysis: string;
  summaryAnalysisId: string;
  clinicalAnalysisId: string;
  tokensUsed: {
    summary: number;
    analysis: number;
  };
  generatedAt: string;
}

// ── Dashboard stats ─────────────────────────────────────────────────────────

// ── Gap analysis types ──────────────────────────────────────────────────────

export interface GapAnalysisItem {
  topic: string;
  status: 'covered' | 'partial' | 'missing';
  confidence: number;
  suggestion?: string;
}

export interface GapAnalysis {
  items: GapAnalysisItem[];
  overallCoverage: number;
  generatedAt: string;
}

// ── Session recording (audio) types ─────────────────────────────────────────

export interface SessionRecording {
  id: string;
  sessionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  status: 'UPLOADED' | 'PROCESSING' | 'TRANSCRIBED' | 'FAILED';
  transcriptionProgress?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Consent types ───────────────────────────────────────────────────────────

export interface Consent {
  id: string;
  patientId: string;
  type: string;
  granted: boolean;
  notes?: string;
  grantedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Patient timeline / profile / memory types ───────────────────────────────

export interface TimelineEntry {
  id: string;
  type: 'SESSION' | 'NOTE' | 'ANALYSIS' | 'CONSENT' | 'ALERT';
  title: string;
  description?: string;
  date: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface PatientTimeline {
  entries: TimelineEntry[];
  totalSessions: number;
  totalNotes: number;
}

export interface PatientProfile {
  patientId: string;
  summary: string;
  keyThemes: string[];
  sessionCount: number;
  lastSessionDate?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  treatmentGoals?: string[];
}

export interface PatientMemory {
  patientId: string;
  summary: string;
  keyThemes: Array<{ theme: string; frequency: number; lastMentioned: string }>;
  importantEvents: Array<{ event: string; date: string }>;
  preferences?: string[];
  sessionCount: number;
}

// ── Onboarding types ────────────────────────────────────────────────────────

export interface OnboardingSuggestion {
  type: 'topic' | 'specialty' | 'document' | 'action';
  label: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface OnboardingSuggestions {
  suggestions: OnboardingSuggestion[];
  progress: {
    documentsUploaded: number;
    conceptsExtracted: number;
    topicsCreated: number;
    sessionsCreated: number;
    patientsCreated: number;
  };
  completedSteps: string[];
  pendingSteps: string[];
}

// ── Clinical alert types ────────────────────────────────────────────────────

export interface ClinicalAlert {
  id: string;
  patientId: string;
  patientName?: string;
  sessionId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  createdAt: string;
}

// ── API key types ───────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  revokedAt?: string;
}

export interface DashboardStats {
  patients: {
    total: number;
    active: number;
    newThisMonth: number;
  };
  sessions: {
    total: number;
    completed: number;
    scheduled: number;
    inProgress: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  notes: {
    total: number;
    thisMonth: number;
    finalized: number;
  };
  aiAnalyses: {
    total: number;
    soapNotesGenerated: number;
    summariesGenerated: number;
    briefingsGenerated: number;
    copilotAnalysesTotal: number;
    totalTokensUsed: number;
  };
  sessionsByType: Array<{ type: string; count: number }>;
  trend: Array<{ date: string; count: number }>;
  recentSessions: Array<{
    id: string;
    status: string;
    type: string;
    scheduledAt: string;
    patientName: string;
    professionalName: string;
  }>;
  recentAnalyses: Array<{
    id: string;
    type: string;
    provider: string;
    model: string;
    status: string;
    createdAt: string;
    sessionId: string;
  }>;
}

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Returns a valid (non-expired) access token, refreshing if necessary.
 * Use this for WebSocket connections where we can't rely on the 401-retry
 * mechanism (WS doesn't support retry after auth failure).
 */
export async function ensureFreshAccessToken(): Promise<string | null> {
  // Check if current token is still valid (with 30s buffer)
  if (accessToken) {
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1] ?? ''));
      const expiresAt = payload.exp * 1000; // seconds → ms
      const now = Date.now();
      const remaining = expiresAt - now;
      console.log('[auth] token check', { remaining: Math.round(remaining / 1000) + 's', valid: remaining > 30_000 });
      if (remaining > 30_000) {
        return accessToken; // Still valid
      }
    } catch (e) {
      console.warn('[auth] token decode failed', e);
    }
  }

  // Token expired or missing — refresh
  console.log('[auth] refreshing token...');
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  const result = await refreshPromise;
  console.log('[auth] refresh result', result ? 'success' : 'failed');
  return result;
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

/**
 * Returns auth headers for direct fetch calls (e.g. Blob downloads).
 */
export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = {};

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };
  if (body !== undefined) {
    fetchOptions.body = isFormData ? (body as FormData) : JSON.stringify(body);
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
        retryOptions.body = isFormData ? (body as FormData) : JSON.stringify(body);
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
    window.location.href = `${import.meta.env.BASE_URL}login`;
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
    getTimeline: (id: string): Promise<PatientTimeline> =>
      request<PatientTimeline>(`/patients/${id}/timeline`),
    getProfile: (id: string): Promise<PatientProfile> =>
      request<PatientProfile>(`/patients/${id}/profile`),
    getMemory: (id: string): Promise<PatientMemory> =>
      request<PatientMemory>(`/patients/${id}/memory`),
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
    // Briefing (pre-session)
    generateBriefing: (id: string): Promise<BriefingResponse> =>
      request<BriefingResponse>(`/sessions/${id}/briefing`, { method: 'POST' }),
    // SOAP note (auto-generate from transcript)
    generateSOAP: (id: string): Promise<SOAPNoteResponse> =>
      request<SOAPNoteResponse>(`/sessions/${id}/soap`, { method: 'POST' }),
    // Post-session analysis (summary + clinical analysis)
    generateAnalysis: (id: string): Promise<PostSessionAnalysisResponse> =>
      request<PostSessionAnalysisResponse>(`/sessions/${id}/analyze`, { method: 'POST' }),
    // Audio recordings
    uploadAudio: (id: string, file: File): Promise<SessionRecording> => {
      const formData = new FormData();
      formData.append('file', file);
      return request<SessionRecording>(`/sessions/${id}/audio`, { method: 'POST', body: formData });
    },
    listAudio: (id: string): Promise<SessionRecording[]> =>
      request<SessionRecording[]>(`/sessions/${id}/audio`),
    getAudio: (id: string, recordingId: string): Promise<SessionRecording> =>
      request<SessionRecording>(`/sessions/${id}/audio/${recordingId}`),
    deleteAudio: (id: string, recordingId: string): Promise<void> =>
      request<void>(`/sessions/${id}/audio/${recordingId}`, { method: 'DELETE' }),
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

  stats: {
    get: (): Promise<DashboardStats> => request<DashboardStats>('/stats'),
  },

  aiProviders: {
    list: <T>(): Promise<T> => request<T>('/ai-providers'),
    create: <T>(data: Record<string, unknown>): Promise<T> =>
      request<T>('/ai-providers', { method: 'POST', body: data }),
    update: <T>(id: string, data: Record<string, unknown>): Promise<T> =>
      request<T>(`/ai-providers/${id}`, { method: 'PUT', body: data }),
    delete: (id: string): Promise<void> =>
      request<void>(`/ai-providers/${id}`, { method: 'DELETE' }),
    activate: <T>(id: string): Promise<T> =>
      request<T>(`/ai-providers/${id}/activate`, { method: 'PUT' }),
    setFallback: <T>(id: string): Promise<T> =>
      request<T>(`/ai-providers/${id}/fallback`, { method: 'PUT' }),
    test: <T>(id: string): Promise<T> =>
      request<T>(`/ai-providers/${id}/test`, { method: 'POST' }),
  },

  gaps: {
    get: (): Promise<GapAnalysis> => request<GapAnalysis>('/gap-analysis'),
  },

  consents: {
    list: (patientId: string): Promise<Consent[]> =>
      request<Consent[]>(`/patients/${patientId}/consents`),
    create: (patientId: string, data: { type: string; granted: boolean; notes?: string }): Promise<Consent> =>
      request<Consent>(`/patients/${patientId}/consents`, { method: 'POST', body: data }),
    update: (id: string, data: Partial<Consent>): Promise<Consent> =>
      request<Consent>(`/consents/${id}`, { method: 'PATCH', body: data }),
  },

  reports: {
    sessionsCsv: (): Promise<Blob> =>
      fetch(buildUrl('/reports/sessions.csv'), { headers: authHeaders() }).then((r) => r.blob()),
    patientsCsv: (): Promise<Blob> =>
      fetch(buildUrl('/reports/patients.csv'), { headers: authHeaders() }).then((r) => r.blob()),
    clinicalNotesCsv: (): Promise<Blob> =>
      fetch(buildUrl('/reports/clinical-notes.csv'), { headers: authHeaders() }).then((r) => r.blob()),
  },

  onboarding: {
    getSuggestions: (): Promise<OnboardingSuggestions> =>
      request<OnboardingSuggestions>('/onboarding/suggestions'),
  },

  alerts: {
    list: (params?: { acknowledged?: boolean; patientId?: string; severity?: string }): Promise<ClinicalAlert[]> =>
      request<ClinicalAlert[]>('/alerts', params ? { params: params as Record<string, string | number | undefined> } : {}),
    acknowledge: (id: string): Promise<ClinicalAlert> =>
      request<ClinicalAlert>(`/alerts/${id}/acknowledge`, { method: 'PATCH' }),
  },

  apiKeys: {
    list: (): Promise<ApiKey[]> => request<ApiKey[]>('/api-keys'),
    create: (data: { name: string; expiresAt?: string }): Promise<{ apiKey: ApiKey; key: string }> =>
      request<{ apiKey: ApiKey; key: string }>('/api-keys', { method: 'POST', body: data }),
    revoke: (id: string): Promise<void> =>
      request<void>(`/api-keys/${id}`, { method: 'DELETE' }),
  },
};
