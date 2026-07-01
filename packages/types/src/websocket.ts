import type { ClinicalSessionId, ISODateString, TranscriptId } from './common.js';
import type { SessionStatus } from './enums.js';

export interface SessionTranscriptProgress {
  readonly type: 'session:transcript:progress';
  readonly sessionId: ClinicalSessionId;
  readonly transcriptId: TranscriptId;
  readonly progress: number;
  readonly timestamp: ISODateString;
}

export interface SessionTranscriptComplete {
  readonly type: 'session:transcript:complete';
  readonly sessionId: ClinicalSessionId;
  readonly transcriptId: TranscriptId;
  readonly wordCount: number;
  readonly timestamp: ISODateString;
}

export interface SessionAIInsight {
  readonly type: 'session:ai:insight';
  readonly sessionId: ClinicalSessionId;
  readonly transcriptId: TranscriptId;
  readonly analysisType: string;
  readonly summary: string;
  readonly timestamp: ISODateString;
}

export interface SessionStatusEvent {
  readonly type: 'session:status';
  readonly sessionId: ClinicalSessionId;
  readonly status: SessionStatus;
  readonly timestamp: ISODateString;
}

export interface WorkerHeartbeat {
  readonly type: 'worker:heartbeat';
  readonly workerId: string;
  readonly queue: string;
  readonly activeJobs: number;
  readonly timestamp: ISODateString;
}

export type WSEvent =
  | SessionTranscriptProgress
  | SessionTranscriptComplete
  | SessionAIInsight
  | SessionStatusEvent
  | WorkerHeartbeat;
