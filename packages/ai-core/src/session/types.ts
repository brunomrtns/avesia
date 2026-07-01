// ============================================================================
//  Avesia AI Core — Session Copilot Types
//
//  All types used by the real-time clinical copilot: structured assistance
//  output, incremental session memory, trigger events, and settings.
// ============================================================================

/** Type of clinical assistance the copilot can produce. */
export type AssistanceType =
  | 'insight'
  | 'hypothesis'
  | 'question'
  | 'attention'
  | 'connection';

/** Confidence level — always present, never assertive. */
export type Confidence = 'high' | 'medium' | 'low';

/** A single assistance item produced by the copilot. */
export interface AssistanceItem {
  readonly type: AssistanceType;
  readonly content: string;
  readonly confidence: Confidence;
  /** Concept names from the KB that grounded this item (if any). */
  readonly sourceConcepts?: readonly string[];
  /** Document headings from the KB that grounded this item (if any). */
  readonly sourceDocuments?: readonly string[];
}

/** Structured output from one copilot processing cycle. */
export interface CopilotAssistance {
  readonly items: readonly AssistanceItem[];
  readonly memoryUpdate: SessionMemoryUpdate;
  /** Whether the copilot had enough context to produce meaningful output. */
  readonly sufficientContext: boolean;
  /** Optional note when context is insufficient. */
  readonly contextNote?: string;
}

/** Incremental update to the session memory. */
export interface SessionMemoryUpdate {
  readonly newThemes?: readonly string[];
  readonly newSymptoms?: readonly string[];
  readonly newHypotheses?: readonly HypothesisEntry[];
  readonly resolvedQuestions?: readonly string[];
  readonly newOpenQuestions?: readonly string[];
  readonly newRelevantDocs?: readonly RelevantDocRef[];
  readonly newUsedConcepts?: readonly string[];
}

/** A hypothesis tracked in memory. */
export interface HypothesisEntry {
  readonly description: string;
  readonly confidence: Confidence;
  readonly status: 'open' | 'refined' | 'discarded';
}

/** Reference to a KB document that was found relevant. */
export interface RelevantDocRef {
  readonly documentId: string;
  readonly heading: string;
  readonly score: number;
}

/** The full incremental memory of a session. */
export interface SessionMemory {
  /** Accumulated clinical context summary (1-2 sentences, updated incrementally). */
  readonly contextSummary: string;
  readonly themes: readonly string[];
  readonly symptoms: readonly string[];
  readonly hypotheses: readonly HypothesisEntry[];
  readonly openQuestions: readonly string[];
  readonly relevantDocs: readonly RelevantDocRef[];
  readonly usedConcepts: readonly string[];
  /** Sequence number of the last processed segment. */
  readonly lastProcessedSeq: number;
  /** Timestamp of the last processing cycle. */
  readonly lastProcessedAt: number;
  /** Embedding of the last processed topic (for change detection). */
  readonly lastTopicEmbedding: readonly number[] | null;
}

/** Per-session copilot settings. */
export interface CopilotSettings {
  readonly enabled: boolean;
  readonly intensity: CopilotIntensity;
  readonly maxFrequencyMs: number;
  readonly autoGenerate: boolean;
}

export type CopilotIntensity = 'low' | 'medium' | 'high';

/** A transcript segment passed to the engine. */
export interface SegmentInput {
  readonly id: string;
  readonly sequence: number;
  readonly speaker: 'THERAPIST' | 'PATIENT' | 'UNKNOWN';
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly createdAt: number;
}

/** Why the engine decided to process now. */
export type TriggerReason =
  | 'topic_change'
  | 'pause_detected'
  | 'content_threshold'
  | 'manual'
  | 'session_start';

/** Result of trigger evaluation. */
export interface TriggerResult {
  readonly shouldProcess: boolean;
  readonly reason: TriggerReason | null;
  /** Segments that are new since last processing. */
  readonly pendingSegments: readonly SegmentInput[];
  /** Estimated tokens in pending segments. */
  readonly pendingTokens: number;
}

/** Result of a copilot processing cycle. */
export interface CopilotCycleResult {
  readonly assistance: CopilotAssistance;
  readonly memory: SessionMemory;
  readonly segmentSeqStart: number;
  readonly segmentSeqEnd: number;
  readonly tokensUsed: number;
  readonly durationMs: number;
  readonly conceptIds: readonly string[];
  readonly community: number | null;
}

/** Empty memory (session start). */
export function emptyMemory(): SessionMemory {
  return {
    contextSummary: '',
    themes: [],
    symptoms: [],
    hypotheses: [],
    openQuestions: [],
    relevantDocs: [],
    usedConcepts: [],
    lastProcessedSeq: 0,
    lastProcessedAt: 0,
    lastTopicEmbedding: null,
  };
}

/** Default settings. */
export function defaultSettings(): CopilotSettings {
  return {
    enabled: true,
    intensity: 'medium',
    maxFrequencyMs: 30_000,
    autoGenerate: true,
  };
}
