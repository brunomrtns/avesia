import type { AuthTokens } from './auth.js';
import type {
  ClinicalSessionId,
  EmailAddress,
  ISODateString,
  OrganizationId,
  PaginatedResponse,
  PatientId,
  PhoneNumber,
  ProfessionalId,
  UserId,
} from './common.js';
import type {
  AIAnalysis,
  ClinicalNote,
  ClinicalSession,
  Consent,
  Organization,
  Patient,
  Professional,
  SessionRecording,
  Specialty,
  Transcript,
  User,
} from './domain.js';
import type { Role, SessionLocation, SessionStatus, SessionType } from './enums.js';

export interface RegisterRequest {
  readonly organizationName: string;
  readonly name: string;
  readonly email: EmailAddress;
  readonly password: string;
}

export interface RegisterResponse {
  readonly organization: Organization;
  readonly user: User;
}

export interface LoginRequest {
  readonly email: EmailAddress;
  readonly password: string;
}

export interface LoginResponse {
  readonly user: User;
  readonly tokens: AuthTokens;
}

export interface RefreshRequest {
  readonly refreshToken: string;
}

export interface RefreshResponse {
  readonly tokens: AuthTokens;
}

export interface MeResponse {
  readonly user: User;
}

export interface UpdateOrganizationRequest {
  readonly name?: string;
  readonly slug?: string;
  readonly isActive?: boolean;
}

export interface CreatePatientRequest {
  readonly name: string;
  readonly email?: EmailAddress;
  readonly phone?: PhoneNumber;
  readonly dateOfBirth?: ISODateString;
  readonly metadata?: Record<string, string | number | boolean | null>;
}

export interface UpdatePatientRequest {
  readonly name?: string;
  readonly email?: EmailAddress | null;
  readonly phone?: PhoneNumber | null;
  readonly dateOfBirth?: ISODateString | null;
  readonly status?: 'ACTIVE' | 'ARCHIVED';
}

export type PatientResponse = Patient;
export type PatientListResponse = PaginatedResponse<Patient>;

export interface CreateSessionRequest {
  readonly patientId: PatientId;
  readonly professionalId: ProfessionalId;
  readonly scheduledAt: ISODateString;
  readonly durationMinutes: number;
  readonly type: SessionType;
  readonly location: SessionLocation;
  readonly notes?: string;
}

export interface UpdateSessionRequest {
  readonly scheduledAt?: ISODateString;
  readonly durationMinutes?: number;
  readonly status?: SessionStatus;
  readonly type?: SessionType;
  readonly location?: SessionLocation;
  readonly notes?: string | null;
}

export type SessionResponse = ClinicalSession;
export type SessionListResponse = PaginatedResponse<ClinicalSession>;

export type RecordingResponse = SessionRecording;
export type TranscriptResponse = Transcript;
export type NoteResponse = ClinicalNote;
export type AnalysisResponse = AIAnalysis;

export type ProfessionalResponse = Professional;
export type ProfessionalListResponse = PaginatedResponse<Professional>;

export type SpecialtyResponse = Specialty;
export type SpecialtyListResponse = PaginatedResponse<Specialty>;

export type ConsentResponse = Consent;
export type ConsentListResponse = PaginatedResponse<Consent>;

export interface InviteUserRequest {
  readonly email: EmailAddress;
  readonly name: string;
  readonly role: Role;
}

export interface UserListQuery {
  readonly organizationId: OrganizationId;
  readonly role?: Role;
  readonly search?: string;
}

export type UserResponse = User;
export type UserListResponse = PaginatedResponse<User>;

export interface UserByIdParams {
  readonly userId: UserId;
}

export interface PatientListQuery {
  readonly search?: string;
  readonly status?: 'ACTIVE' | 'ARCHIVED';
  readonly page?: number;
  readonly pageSize?: number;
}

export interface SessionListQuery {
  readonly patientId?: PatientId;
  readonly professionalId?: ProfessionalId;
  readonly status?: SessionStatus;
  readonly from?: ISODateString;
  readonly to?: ISODateString;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface SessionByIdParams {
  readonly sessionId: ClinicalSessionId;
}
