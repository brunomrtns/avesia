import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { NotFoundError, generateId } from '@avesia/shared';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant, requirePermission } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';

// Allowed consent types
const CONSENT_TYPES = ['RECORDING', 'DATA_PROCESSING', 'AI_ANALYSIS'] as const;
type ConsentType = (typeof CONSENT_TYPES)[number];

function isConsentType(v: string): v is ConsentType {
  return (CONSENT_TYPES as readonly string[]).includes(v);
}

const consentRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /patients/:patientId/consents ─────────────────────────────────
  // List consents for a patient.
  app.get('/patients/:patientId/consents', async (request: FastifyRequest, _reply) => {
    const { patientId } = request.params as { patientId: string };

    const patient = await app.prisma.patient.findFirst({
      where: { id: patientId, organizationId: request.organizationId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundError('Patient', patientId);
    }

    const consents = await app.prisma.consent.findMany({
      where: { patientId, organizationId: request.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return { items: consents };
  });

  // ── POST /patients/:patientId/consents ────────────────────────────────
  // Create / grant a consent.
  app.post(
    '/patients/:patientId/consents',
    { preHandler: [requirePermission({ resource: 'patients', action: 'update' })] },
    async (request: FastifyRequest, reply) => {
      const { patientId } = request.params as { patientId: string };
      const body = request.body as { type: string; granted: boolean; notes?: string };

      if (!isConsentType(body.type)) {
        return reply.status(400).send({ message: `Tipo de consentimento inválido. Use: ${CONSENT_TYPES.join(', ')}` });
      }

      const patient = await app.prisma.patient.findFirst({
        where: { id: patientId, organizationId: request.organizationId, deletedAt: null },
      });
      if (!patient) {
        throw new NotFoundError('Patient', patientId);
      }

      const now = new Date();
      const consent = await app.prisma.consent.create({
        data: {
          id: generateId(),
          organizationId: request.organizationId,
          patientId,
          type: body.type,
          granted: body.granted,
          grantedAt: body.granted ? now : null,
          grantedById: body.granted ? request.userId : null,
          revokedAt: body.granted ? null : now,
          revokedById: body.granted ? null : request.userId,
          notes: body.notes ?? null,
        },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'CREATE',
        resource: 'consent',
        resourceId: consent.id,
        metadata: { patientId, type: body.type, granted: body.granted },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(201).send(consent);
    },
  );

  // ── PATCH /consents/:id ───────────────────────────────────────────────
  // Update a consent (grant / revoke / notes).
  app.patch(
    '/consents/:id',
    { preHandler: [requirePermission({ resource: 'patients', action: 'update' })] },
    async (request: FastifyRequest, _reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { granted?: boolean; notes?: string };

      const existing = await app.prisma.consent.findFirst({
        where: { id, organizationId: request.organizationId },
      });
      if (!existing) {
        throw new NotFoundError('Consent', id);
      }

      const data: Record<string, unknown> = {};
      const now = new Date();
      if (body.granted !== undefined) {
        data['granted'] = body.granted;
        if (body.granted) {
          data['grantedAt'] = now;
          data['grantedById'] = request.userId;
          data['revokedAt'] = null;
          data['revokedById'] = null;
        } else {
          data['revokedAt'] = now;
          data['revokedById'] = request.userId;
          data['grantedAt'] = null;
          data['grantedById'] = null;
        }
      }
      if (body.notes !== undefined) {
        data['notes'] = body.notes;
      }

      const consent = await app.prisma.consent.update({
        where: { id },
        data,
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'UPDATE',
        resource: 'consent',
        resourceId: consent.id,
        metadata: { patientId: existing.patientId, granted: body.granted },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return consent;
    },
  );
};

export default consentRoutes;
