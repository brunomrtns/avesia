import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AuthError, ConflictError, hashPassword, generateId } from '@avesia/shared';
import { Role } from '@avesia/types';

import { requireAuth } from '../plugins/auth.js';
import { requireSuperAdmin } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).optional(),
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(200).optional(),
  adminPassword: z.string().min(8).max(128).optional(),
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
  role: z.enum(['OWNER', 'ADMIN', 'PROFESSIONAL']),
  password: z.string().min(8).max(128).optional(),
});

const updateOrgStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripPasswordHash(user: Record<string, unknown>): Record<string, unknown> {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

const adminRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All admin routes require auth + SUPER_ADMIN
  app.addHook('onRequest', requireAuth);
  app.addHook('onRequest', requireSuperAdmin);

  // ── GET /admin/organizations ──────────────────────────────────────────
  app.get('/admin/organizations', async (_request: FastifyRequest) => {
    const organizations = await app.prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: { where: { deletedAt: null } },
            patients: { where: { deletedAt: null } },
            clinicalSessions: true,
          },
        },
      },
    });

    return {
      organizations: organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        createdAt: org.createdAt,
        userCount: org._count.users,
        patientCount: org._count.patients,
        sessionCount: org._count.clinicalSessions,
      })),
    };
  });

  // ── POST /admin/organizations ─────────────────────────────────────────
  app.post('/admin/organizations', async (request: FastifyRequest, reply) => {
    const body = createOrganizationSchema.parse(request.body);

    // Generate slug if not provided
    const slug = body.slug ?? slugify(body.name);
    const finalSlug = `${slug}-${generateId().slice(0, 6)}`;

    // Check slug uniqueness
    const existingSlug = await app.prisma.organization.findUnique({
      where: { slug: finalSlug },
    });
    if (existingSlug) {
      throw new ConflictError('Organization slug already in use');
    }

    // Check email uniqueness
    const existingEmail = await app.prisma.user.findFirst({
      where: { email: body.adminEmail, deletedAt: null },
    });
    if (existingEmail) {
      throw new ConflictError('Email already registered');
    }

    // Generate temp password if not provided
    const tempPassword = body.adminPassword ?? `Temp${generateId().slice(0, 8)}!`;
    const hashedPassword = await hashPassword(tempPassword);

    const orgId = generateId();
    const userId = generateId();

    const result = await app.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          id: orgId,
          name: body.name,
          slug: finalSlug,
          status: 'ACTIVE',
          settings: {
            timezone: 'America/Sao_Paulo',
            locale: 'pt-BR',
            features: {
              aiAnalysis: true,
              transcription: true,
            },
          },
        },
      });

      const user = await tx.user.create({
        data: {
          id: userId,
          organizationId: orgId,
          email: body.adminEmail,
          passwordHash: hashedPassword,
          role: Role.OWNER,
          status: 'ACTIVE',
          mustChangePassword: true,
        },
      });

      return { organization, user, tempPassword };
    });

    void writeAuditLog(app.prisma, {
      organizationId: result.organization.id,
      userId: request.userId,
      action: 'CREATE',
      resource: 'organization',
      resourceId: result.organization.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return reply.status(201).send({
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
        status: result.organization.status,
      },
      adminUser: stripPasswordHash(result.user as unknown as Record<string, unknown>),
      tempPassword: result.tempPassword,
    });
  });

  // ── GET /admin/organizations/:orgId/users ─────────────────────────────
  app.get('/admin/organizations/:orgId/users', async (request: FastifyRequest) => {
    const { orgId } = request.params as { orgId: string };

    const org = await app.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) {
      throw new AuthError('Organization not found');
    }

    const users = await app.prisma.user.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return { users };
  });

  // ── POST /admin/organizations/:orgId/users ────────────────────────────
  app.post('/admin/organizations/:orgId/users', async (request: FastifyRequest, reply) => {
    const { orgId } = request.params as { orgId: string };
    const body = createUserSchema.parse(request.body);

    const org = await app.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) {
      throw new AuthError('Organization not found');
    }

    // Check email uniqueness within org
    const existing = await app.prisma.user.findFirst({
      where: { email: body.email, deletedAt: null },
    });
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const tempPassword = body.password ?? `Temp${generateId().slice(0, 8)}!`;
    const hashedPassword = await hashPassword(tempPassword);

    const user = await app.prisma.user.create({
      data: {
        id: generateId(),
        organizationId: orgId,
        email: body.email,
        passwordHash: hashedPassword,
        role: body.role,
        status: 'ACTIVE',
        mustChangePassword: true,
      },
    });

    void writeAuditLog(app.prisma, {
      organizationId: orgId,
      userId: request.userId,
      action: 'CREATE',
      resource: 'users',
      resourceId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return reply.status(201).send({
      user: stripPasswordHash(user as unknown as Record<string, unknown>),
      tempPassword,
    });
  });

  // ── PATCH /admin/organizations/:orgId/status ──────────────────────────
  app.patch('/admin/organizations/:orgId/status', async (request: FastifyRequest) => {
    const { orgId } = request.params as { orgId: string };
    const body = updateOrgStatusSchema.parse(request.body);

    const org = await app.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) {
      throw new AuthError('Organization not found');
    }

    const updated = await app.prisma.organization.update({
      where: { id: orgId },
      data: { status: body.status },
    });

    void writeAuditLog(app.prisma, {
      organizationId: orgId,
      userId: request.userId,
      action: 'UPDATE',
      resource: 'organization',
      resourceId: orgId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return {
      organization: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        status: updated.status,
      },
    };
  });
};

export default adminRoutes;
