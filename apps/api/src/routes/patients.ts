import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { NotFoundError, ConflictError, generateId } from '@avesia/shared';
import {
  createPatientSchema,
  updatePatientSchema,
  patientListQuerySchema,
} from '@avesia/shared';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant, requirePermission } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';

const patientRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /patients ─────────────────────────────────────────────────────
  app.get('/patients', async (request: FastifyRequest, _reply) => {
    const query = patientListQuerySchema.parse(request.query);
    const { page, pageSize, search, status } = query;

    const where: Record<string, unknown> = {
      organizationId: request.organizationId,
      deletedAt: null,
    };

    if (search) {
      where['fullName'] = { contains: search, mode: 'insensitive' };
    }

    if (status) {
      where['status'] = status;
    }

    // Enforce role-based access control for PROFESSIONALs
    if (request.role === 'PROFESSIONAL') {
      const professional = await app.prisma.professional.findUnique({
        where: { userId: request.userId },
      });
      const professionalId = professional?.id ?? 'NONE';
      where['professionals'] = {
        some: {
          professionalId,
        },
      };
    }

    const [items, total] = await Promise.all([
      app.prisma.patient.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.patient.count({ where }),
    ]);

    return { items, page, pageSize, total };
  });

  // ── GET /patients/:id ─────────────────────────────────────────────────
  app.get('/patients/:id', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    // Enforce role-based access control for PROFESSIONALs
    if (request.role === 'PROFESSIONAL') {
      const professional = await app.prisma.professional.findUnique({
        where: { userId: request.userId },
      });
      const professionalId = professional?.id ?? 'NONE';
      
      const isAssigned = await app.prisma.professionalPatient.findUnique({
        where: {
          professionalId_patientId: {
            professionalId,
            patientId: id,
          },
        },
      });

      if (!isAssigned) {
        throw new NotFoundError('Patient', id); // 404 to avoid leaking existence
      }
    }

    const patient = await app.prisma.patient.findFirst({
      where: { id, organizationId: request.organizationId, deletedAt: null },
    });

    if (!patient) {
      throw new NotFoundError('Patient', id);
    }

    return patient;
  });

  // ── POST /patients ────────────────────────────────────────────────────
  app.post(
    '/patients',
    { preHandler: [requirePermission({ resource: 'patients', action: 'create' })] },
    async (request: FastifyRequest, reply) => {
      const body = createPatientSchema.parse(request.body);

      // Check unique email within org (if provided)
      if (body.email) {
        const existing = await app.prisma.patient.findFirst({
          where: {
            organizationId: request.organizationId,
            email: body.email,
            deletedAt: null,
          },
        });
        if (existing) {
          throw new ConflictError('Patient with this email already exists in this organization');
        }
      }

      const patient = await app.prisma.patient.create({
        data: {
          id: generateId(),
          organizationId: request.organizationId,
          fullName: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          status: 'ACTIVE',
        },
      });

      // If user is a PROFESSIONAL, auto-assign them to this patient
      if (request.role === 'PROFESSIONAL') {
        const professional = await app.prisma.professional.findUnique({
          where: { userId: request.userId },
        });
        if (professional) {
          await app.prisma.professionalPatient.create({
            data: {
              organizationId: request.organizationId,
              professionalId: professional.id,
              patientId: patient.id,
            },
          });
        }
      }

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'CREATE',
        resource: 'patient',
        resourceId: patient.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(201).send(patient);
    },
  );

  // ── PATCH /patients/:id ───────────────────────────────────────────────
  app.patch(
    '/patients/:id',
    { preHandler: [requirePermission({ resource: 'patients', action: 'update' })] },
    async (request: FastifyRequest, _reply) => {
      const { id } = request.params as { id: string };
      const body = updatePatientSchema.parse(request.body);

      const existing = await app.prisma.patient.findFirst({
        where: { id, organizationId: request.organizationId, deletedAt: null },
      });

      if (!existing) {
        throw new NotFoundError('Patient', id);
      }

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data['fullName'] = body.name;
      if (body.email !== undefined) data['email'] = body.email;
      if (body.phone !== undefined) data['phone'] = body.phone;
      if (body.dateOfBirth !== undefined) {
        data['dateOfBirth'] = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
      }
      if (body.status !== undefined) data['status'] = body.status;

      const patient = await app.prisma.patient.update({
        where: { id },
        data,
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'UPDATE',
        resource: 'patient',
        resourceId: patient.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return patient;
    },
  );

  // ── DELETE /patients/:id (soft delete) ────────────────────────────────
  app.delete(
    '/patients/:id',
    { preHandler: [requirePermission({ resource: 'patients', action: 'delete' })] },
    async (request: FastifyRequest, reply) => {
      const { id } = request.params as { id: string };

      const existing = await app.prisma.patient.findFirst({
        where: { id, organizationId: request.organizationId, deletedAt: null },
      });

      if (!existing) {
        throw new NotFoundError('Patient', id);
      }

      await app.prisma.patient.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'ARCHIVED' },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'DELETE',
        resource: 'patient',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(204).send();
    },
  );
};

export default patientRoutes;
