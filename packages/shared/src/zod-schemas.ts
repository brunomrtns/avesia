import { z } from 'zod';

import { PASSWORD_RULES, PHONE_REGEX } from './constants.js';

const emailSchema = z.string().email();
const passwordSchema = z.string().min(PASSWORD_RULES.MIN_LENGTH).max(PASSWORD_RULES.MAX_LENGTH);
const phoneSchema = z.string().regex(PHONE_REGEX);
const isoDateSchema = z.string().datetime().or(
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').transform((d) => `${d}T00:00:00.000Z`),
);
const idSchema = z.string().min(1);

export const registerSchema = z.object({
  organizationName: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const createPatientSchema = z.object({
  name: z.string().min(1).max(300),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  dateOfBirth: isoDateSchema.optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const updatePatientSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  dateOfBirth: isoDateSchema.nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

export const createSessionSchema = z.object({
  patientId: idSchema,
  professionalId: idSchema,
  scheduledAt: isoDateSchema,
  durationMinutes: z.number().int().min(1).max(480),
  type: z.enum(['INITIAL', 'FOLLOW_UP', 'EMERGENCY']),
  location: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']),
  notes: z.string().max(5000).optional(),
});

export const updateSessionSchema = z.object({
  scheduledAt: isoDateSchema.optional(),
  durationMinutes: z.number().int().min(1).max(480).optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  type: z.enum(['INITIAL', 'FOLLOW_UP', 'EMERGENCY']).optional(),
  location: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export const inviteUserSchema = z.object({
  email: emailSchema,
  name: z.string().min(1).max(200),
  role: z.enum(['OWNER', 'ADMIN', 'PROFESSIONAL']),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const patientListQuerySchema = paginationQuerySchema.extend({
  search: z.string().min(1).max(200).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

export const sessionListQuerySchema = paginationQuerySchema.extend({
  patientId: idSchema.optional(),
  professionalId: idSchema.optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;
export type PatientListQueryInput = z.infer<typeof patientListQuerySchema>;
export type SessionListQueryInput = z.infer<typeof sessionListQuerySchema>;
