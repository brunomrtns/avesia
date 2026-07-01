import { create } from 'zustand';
import type { InsightSource, AssistanceItem, CopilotSettings } from '@/lib/api-client';

type Speaker = 'THERAPIST' | 'PATIENT' | 'AUTO';

/** A timestamped assistance item in the copilot stream. */
interface CopilotStreamItem extends AssistanceItem {
  readonly id: string;
  readonly timestamp: number;
  readonly segmentSeqStart: number;
  readonly segmentSeqEnd: number;
  readonly conceptIds: readonly string[];
  readonly community: number | null;
}

type CopilotStatus = 'idle' | 'processing' | 'disabled';

interface SessionRoomState {
  // Recording state
  isRecording: boolean;
  isPaused: boolean;
  seconds: number;
  speechSupported: boolean;

  // Speaker
  activeSpeaker: Speaker;

  // Audio config
  isConfigOpen: boolean;
  isDualMicMode: boolean;
  devices: MediaDeviceInfo[];
  therapistDeviceId: string;
  patientDeviceId: string;
  therapistVolume: number;
  patientVolume: number;

  // Insights (legacy manual trigger)
  isGeneratingInsights: boolean;
  insightsContent: string | null;
  insightsSources: InsightSource[];
  insightsCommunity: number | null;

  // Copilot (real-time)
  copilotItems: CopilotStreamItem[];
  copilotStatus: CopilotStatus;
  copilotPendingSegments: number;
  copilotSettings: CopilotSettings | null;
  copilotError: string | null;
  copilotSettingsOpen: boolean;

  // Actions
  setIsRecording: (v: boolean) => void;
  setIsPaused: (v: boolean) => void;
  setSeconds: (fn: number | ((s: number) => number)) => void;
  setSpeechSupported: (v: boolean) => void;
  setActiveSpeaker: (s: Speaker) => void;
  setIsConfigOpen: (v: boolean) => void;
  setIsDualMicMode: (v: boolean) => void;
  setDevices: (d: MediaDeviceInfo[]) => void;
  setTherapistDeviceId: (id: string) => void;
  setPatientDeviceId: (id: string) => void;
  setTherapistVolume: (v: number) => void;
  setPatientVolume: (v: number) => void;
  setIsGeneratingInsights: (v: boolean) => void;
  setInsightsContent: (c: string | null) => void;
  setInsightsSources: (s: InsightSource[]) => void;
  setInsightsCommunity: (c: number | null) => void;

  // Copilot actions
  addCopilotItems: (items: AssistanceItem[], meta: { segmentSeqStart: number; segmentSeqEnd: number; conceptIds: string[]; community: number | null }) => void;
  setCopilotStatus: (status: CopilotStatus, pendingSegments: number) => void;
  setCopilotSettings: (settings: CopilotSettings | null) => void;
  setCopilotError: (msg: string | null) => void;
  setCopilotSettingsOpen: (open: boolean) => void;
  clearCopilotItems: () => void;

  reset: () => void;
}

const initialCopilotSettings: CopilotSettings = {
  enabled: true,
  intensity: 'medium',
  maxFrequencyMs: 30_000,
  autoGenerate: true,
};

const initialState = {
  isRecording: false,
  isPaused: false,
  seconds: 0,
  speechSupported: true,
  activeSpeaker: 'AUTO' as Speaker,
  isConfigOpen: false,
  isDualMicMode: false,
  devices: [] as MediaDeviceInfo[],
  therapistDeviceId: '',
  patientDeviceId: '',
  therapistVolume: 0,
  patientVolume: 0,
  isGeneratingInsights: false,
  insightsContent: null,
  insightsSources: [] as InsightSource[],
  insightsCommunity: null as number | null,
  copilotItems: [] as CopilotStreamItem[],
  copilotStatus: 'idle' as CopilotStatus,
  copilotPendingSegments: 0,
  copilotSettings: null as CopilotSettings | null,
  copilotError: null as string | null,
  copilotSettingsOpen: false,
};

let copilotItemId = 0;

export const useSessionStore = create<SessionRoomState>((set) => ({
  ...initialState,
  setIsRecording: (v) => set({ isRecording: v }),
  setIsPaused: (v) => set({ isPaused: v }),
  setSeconds: (fn) => set((state) => ({ seconds: typeof fn === 'function' ? fn(state.seconds) : fn })),
  setSpeechSupported: (v) => set({ speechSupported: v }),
  setActiveSpeaker: (s) => set({ activeSpeaker: s }),
  setIsConfigOpen: (v) => set({ isConfigOpen: v }),
  setIsDualMicMode: (v) => set({ isDualMicMode: v }),
  setDevices: (d) => set({ devices: d }),
  setTherapistDeviceId: (id) => set({ therapistDeviceId: id }),
  setPatientDeviceId: (id) => set({ patientDeviceId: id }),
  setTherapistVolume: (v) => set({ therapistVolume: v }),
  setPatientVolume: (v) => set({ patientVolume: v }),
  setIsGeneratingInsights: (v) => set({ isGeneratingInsights: v }),
  setInsightsContent: (c) => set({ insightsContent: c }),
  setInsightsSources: (s) => set({ insightsSources: s }),
  setInsightsCommunity: (c) => set({ insightsCommunity: c }),

  // Copilot
  addCopilotItems: (items, meta) => set((state) => {
    const newItems: CopilotStreamItem[] = items.map((item) => ({
      ...item,
      id: `copilot-${++copilotItemId}`,
      timestamp: Date.now(),
      segmentSeqStart: meta.segmentSeqStart,
      segmentSeqEnd: meta.segmentSeqEnd,
      conceptIds: meta.conceptIds,
      community: meta.community,
    }));
    // Cap at 50 items to prevent unbounded growth.
    const allItems = [...newItems, ...state.copilotItems].slice(0, 50);
    return { copilotItems: allItems, copilotError: null };
  }),
  setCopilotStatus: (status, pendingSegments) => set({ copilotStatus: status, copilotPendingSegments: pendingSegments }),
  setCopilotSettings: (settings) => set({ copilotSettings: settings }),
  setCopilotError: (msg) => set({ copilotError: msg }),
  setCopilotSettingsOpen: (open) => set({ copilotSettingsOpen: open }),
  clearCopilotItems: () => set({ copilotItems: [], copilotError: null }),

  reset: () => set({ ...initialState, copilotSettings: initialCopilotSettings }),
}));
