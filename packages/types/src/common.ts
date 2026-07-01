declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type OrganizationId = Brand<string, 'OrganizationId'>;
export type UserId = Brand<string, 'UserId'>;
export type ProfessionalId = Brand<string, 'ProfessionalId'>;
export type SpecialtyId = Brand<string, 'SpecialtyId'>;
export type PatientId = Brand<string, 'PatientId'>;
export type ClinicalSessionId = Brand<string, 'ClinicalSessionId'>;
export type SessionRecordingId = Brand<string, 'SessionRecordingId'>;
export type TranscriptId = Brand<string, 'TranscriptId'>;
export type TranscriptSegmentId = Brand<string, 'TranscriptSegmentId'>;
export type ClinicalNoteId = Brand<string, 'ClinicalNoteId'>;
export type AIAnalysisId = Brand<string, 'AIAnalysisId'>;
export type AttachmentId = Brand<string, 'AttachmentId'>;
export type ConsentId = Brand<string, 'ConsentId'>;
export type AuditLogId = Brand<string, 'AuditLogId'>;

/** ISO 8601 date-time string, e.g. `2026-01-15T10:30:00.000Z`. */
export type ISODateString = Brand<string, 'ISODateString'>;

/** Opaque cursor token for cursor-based pagination. */
export type Cursor = Brand<string, 'Cursor'>;

export type UUID = Brand<string, 'UUID'>;

export type EmailAddress = Brand<string, 'EmailAddress'>;

/** E.164-ish phone; validated by Zod at trust boundaries. */
export type PhoneNumber = Brand<string, 'PhoneNumber'>;

/** JSON-serializable metadata bag. Values are primitives only. */
export type Metadata = Readonly<Record<string, string | number | boolean | null>>;

export interface Pagination {
  readonly page: number;
  readonly pageSize: number;
}

export interface CursorPagination {
  readonly limit: number;
  readonly cursor: Cursor | null;
}

export interface PaginatedResponse<T> {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly items: readonly T[];
}

export interface CursorPaginatedResponse<T> {
  readonly items: readonly T[];
  readonly nextCursor: Cursor | null;
  readonly hasMore: boolean;
}

export interface SoftDeletable {
  readonly deletedAt: ISODateString | null;
}

export interface Timestamped {
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface TenantScoped {
  readonly organizationId: OrganizationId;
}
