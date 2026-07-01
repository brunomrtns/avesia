import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { NotFoundError } from '@avesia/shared';
import { updateOrganizationSchema } from '@avesia/shared';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant, requirePermission } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';

const organizationRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /organization ─────────────────────────────────────────────────
  app.get('/organization', async (request: FastifyRequest, _reply) => {
    const org = await app.prisma.organization.findUnique({
      where: { id: request.organizationId },
    });

    if (!org) {
      throw new NotFoundError('Organization', request.organizationId);
    }

    return org;
  });

  // ── PATCH /organization ───────────────────────────────────────────────
  app.patch(
    '/organization',
    { preHandler: [requirePermission({ resource: 'organization', action: 'update' })] },
    async (request: FastifyRequest, _reply) => {
      const body = updateOrganizationSchema.parse(request.body);

      const existing = await app.prisma.organization.findUnique({
        where: { id: request.organizationId },
      });

      if (!existing) {
        throw new NotFoundError('Organization', request.organizationId);
      }

      const org = await app.prisma.organization.update({
        where: { id: request.organizationId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.slug !== undefined ? { slug: body.slug } : {}),
        },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'UPDATE',
        resource: 'organization',
        resourceId: org.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return org;
    },
  );

  // ── GET /organization/context-documents ───────────────────────────────
  app.get('/organization/context-documents', async (request: FastifyRequest, _reply) => {
    const docs = await app.prisma.aIContextDocument.findMany({
      where: { organizationId: request.organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return docs;
  });

  // ── POST /organization/context-documents ──────────────────────────────
  app.post('/organization/context-documents', async (request: FastifyRequest, reply) => {
    const bodySchema = z.object({
      fileName: z.string().min(1).max(255),
    });
    const body = bodySchema.parse(request.body);

    const doc = await app.prisma.aIContextDocument.create({
      data: {
        organizationId: request.organizationId,
        fileName: body.fileName,
        status: 'PENDING',
        progress: 0,
      },
    });

    // Run simulated async processing in background
    const runSimulation = async () => {
      const steps = [
        { progress: 25, status: 'PROCESSING', delay: 2000 },
        { progress: 50, status: 'PROCESSING', delay: 2000 },
        { progress: 75, status: 'PROCESSING', delay: 2000 },
        { progress: 100, status: 'COMPLETED', delay: 2000 },
      ];

      const isErrorFile = body.fileName.toLowerCase().includes('erro');

      for (const step of steps) {
        await new Promise((resolve) => setTimeout(resolve, step.delay));

        // Verify document still exists (not deleted mid-process)
        const exists = await app.prisma.aIContextDocument.findUnique({
          where: { id: doc.id },
        });
        if (!exists) break;

        if (isErrorFile && step.progress === 50) {
          await app.prisma.aIContextDocument.update({
            where: { id: doc.id },
            data: {
              status: 'FAILED',
              progress: 50,
              errorMessage: 'Erro na extração de texto: arquivo corrompido ou formato inválido.',
            },
          });
          break;
        }

        await app.prisma.aIContextDocument.update({
          where: { id: doc.id },
          data: {
            status: step.status,
            progress: step.progress,
          },
        });
      }
    };

    // Trigger background task without waiting
    void runSimulation();

    return reply.status(201).send(doc);
  });

  // ── DELETE /organization/context-documents/:id ─────────────────────────
  app.delete('/organization/context-documents/:id', async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };

    const existing = await app.prisma.aIContextDocument.findFirst({
      where: { id, organizationId: request.organizationId },
    });

    if (!existing) {
      throw new NotFoundError('AIContextDocument', id);
    }

    await app.prisma.aIContextDocument.delete({
      where: { id },
    });

    return reply.status(204).send();
  });
};

export default organizationRoutes;
