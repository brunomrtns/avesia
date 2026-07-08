import type {
  AIAnalysisId,
  AttachmentId,
  AuditLogId,
  ClinicalNoteId,
  ClinicalSessionId,
  ConsentId,
  EmailAddress,
  ISODateString,
  Metadata,
  OrganizationId,
  PatientId,
  PhoneNumber,
  ProfessionalId,
  SessionRecordingId,
  SoftDeletable,
  SpecialtyId,
  TenantScoped,
  Timestamped,
  TranscriptId,
  TranscriptSegmentId,
  UserId,
} from './common.js';
import type {
  AIAnalysisType,
  AuditAction,
  AttachmentKind,
  ConsentStatus,
  ConsentType,
  NoteStatus,
  PatientStatus,
  RecordingStatus,
  Role,
  SessionLocation,
  SessionStatus,
  SessionType,
  TranscriptStatus,
} from './enums.js';

export interface Organization extends Timestamped {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly isActive: boolean;
}

export interface User extends Timestamped, SoftDeletable {
  readonly id: UserId;
  readonly organizationId: OrganizationId;
  readonly email: EmailAddress;
  readonly name: string;
  readonly role: Role;
  readonly lastLoginAt: ISODateString | null;
  readonly mustChangePassword: boolean;
}

export interface Specialty extends Timestamped, TenantScoped {
  readonly id: SpecialtyId;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
}

export interface Professional extends Timestamped, TenantScoped {
  readonly id: ProfessionalId;
  readonly userId: UserId;
  readonly specialtyId: SpecialtyId;
  readonly licenseNumber: string;
  readonly bio: string | null;
}

export interface Patient extends Timestamped, TenantScoped, SoftDeletable {
  readonly id: PatientId;
  readonly fullName: string;
  readonly name: string;
  readonly email: EmailAddress | null;
  readonly phone: PhoneNumber | null;
  readonly dateOfBirth: ISODateString | null;
  readonly status: PatientStatus;
  readonly metadata: Metadata;
}

export interface ClinicalSession extends Timestamped, TenantScoped {
  readonly id: ClinicalSessionId;
  readonly patientId: PatientId;
  readonly professionalId: ProfessionalId;
  readonly scheduledAt: ISODateString;
  readonly durationMinutes: number;
  readonly status: SessionStatus;
  readonly type: SessionType;
  readonly location: SessionLocation;
  readonly notes: string | null;
}

export interface SessionRecording extends Timestamped, TenantScoped {
  readonly id: SessionRecordingId;
  readonly sessionId: ClinicalSessionId;
  readonly status: RecordingStatus;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly durationSeconds: number;
  readonly failureReason: string | null;
}

export interface Transcript extends Timestamped, TenantScoped {
  readonly id: TranscriptId;
  readonly recordingId: SessionRecordingId;
  readonly sessionId: ClinicalSessionId;
  readonly status: TranscriptStatus;
  readonly language: string;
  readonly wordCount: number;
  readonly failureReason: string | null;
}

export interface TranscriptSegment extends Timestamped {
  readonly id: TranscriptSegmentId;
  readonly transcriptId: TranscriptId;
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly speaker: string;
  readonly text: string;
  readonly confidence: number;
}

export interface ClinicalNote extends Timestamped, TenantScoped {
  readonly id: ClinicalNoteId;
  readonly sessionId: ClinicalSessionId;
  readonly patientId: PatientId;
  readonly professionalId: ProfessionalId;
  readonly version: number;
  readonly status: NoteStatus;
  readonly content: string;
  readonly finalizedAt: ISODateString | null;
}

export interface AIAnalysis extends Timestamped, TenantScoped {
  readonly id: AIAnalysisId;
  readonly sessionId: ClinicalSessionId;
  readonly transcriptId: TranscriptId;
  readonly type: AIAnalysisType;
  readonly model: string;
  readonly content: string;
  readonly confidence: number | null;
  readonly tokensUsed: number | null;
}

export interface Attachment extends Timestamped, TenantScoped {
  readonly id: AttachmentId;
  readonly sessionId: ClinicalSessionId | null;
  readonly patientId: PatientId | null;
  readonly uploadedById: UserId;
  readonly kind: AttachmentKind;
  readonly filename: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface Consent extends Timestamped, TenantScoped {
  readonly id: ConsentId;
  readonly patientId: PatientId;
  readonly type: ConsentType;
  readonly status: ConsentStatus;
  readonly grantedAt: ISODateString;
  readonly revokedAt: ISODateString | null;
  readonly expiresAt: ISODateString | null;
}

export interface AuditLog extends Timestamped, TenantScoped {
  readonly id: AuditLogId;
  readonly actorId: UserId;
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: string;
  readonly before: Metadata | null;
  readonly after: Metadata | null;
  readonly ipAddress: string | null;
}
