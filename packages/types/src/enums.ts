export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  PROFESSIONAL: 'PROFESSIONAL',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const SessionStatus = {
  Scheduled: 'SCHEDULED',
  InProgress: 'IN_PROGRESS',
  Completed: 'COMPLETED',
  Cancelled: 'CANCELLED',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const SessionType = {
  Initial: 'INITIAL',
  FollowUp: 'FOLLOW_UP',
  Emergency: 'EMERGENCY',
} as const;
export type SessionType = (typeof SessionType)[keyof typeof SessionType];

export const SessionLocation = {
  InPerson: 'IN_PERSON',
  Video: 'VIDEO',
  Phone: 'PHONE',
} as const;
export type SessionLocation = (typeof SessionLocation)[keyof typeof SessionLocation];

export const RecordingStatus = {
  Uploaded: 'UPLOADED',
  Processing: 'PROCESSING',
  Completed: 'COMPLETED',
  Failed: 'FAILED',
} as const;
export type RecordingStatus = (typeof RecordingStatus)[keyof typeof RecordingStatus];

export const TranscriptStatus = {
  Pending: 'PENDING',
  Processing: 'PROCESSING',
  Completed: 'COMPLETED',
  Failed: 'FAILED',
  Edited: 'EDITED',
} as const;
export type TranscriptStatus = (typeof TranscriptStatus)[keyof typeof TranscriptStatus];

export const NoteStatus = {
  Draft: 'DRAFT',
  Finalized: 'FINALIZED',
} as const;
export type NoteStatus = (typeof NoteStatus)[keyof typeof NoteStatus];

export const AIAnalysisType = {
  Summary: 'SUMMARY',
  Topics: 'TOPICS',
  Keywords: 'KEYWORDS',
  Insights: 'INSIGHTS',
  TreatmentPlan: 'TREATMENT_PLAN',
} as const;
export type AIAnalysisType = (typeof AIAnalysisType)[keyof typeof AIAnalysisType];

export const ConsentType = {
  Recording: 'RECORDING',
  DataProcessing: 'DATA_PROCESSING',
  AIAnalysis: 'AI_ANALYSIS',
} as const;
export type ConsentType = (typeof ConsentType)[keyof typeof ConsentType];

export const PatientStatus = {
  Active: 'ACTIVE',
  Archived: 'ARCHIVED',
} as const;
export type PatientStatus = (typeof PatientStatus)[keyof typeof PatientStatus];

export const ConsentStatus = {
  Granted: 'GRANTED',
  Revoked: 'REVOKED',
  Expired: 'EXPIRED',
} as const;
export type ConsentStatus = (typeof ConsentStatus)[keyof typeof ConsentStatus];

export const AuditAction = {
  Create: 'CREATE',
  Update: 'UPDATE',
  Delete: 'DELETE',
  Read: 'READ',
  Export: 'EXPORT',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AttachmentKind = {
  Document: 'DOCUMENT',
  Image: 'IMAGE',
  Audio: 'AUDIO',
  Video: 'VIDEO',
  Other: 'OTHER',
} as const;
export type AttachmentKind = (typeof AttachmentKind)[keyof typeof AttachmentKind];
