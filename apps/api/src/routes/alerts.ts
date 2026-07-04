import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { NotFoundError, generateId } from '@avesia/shared';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant, requirePermission } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';

// Allowed alert types and severities
const ALERT_TYPES = ['RISK', 'PATTERN', 'IMPROVEMENT', 'GAP'] as const;
const ALERT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

function isAlertType(v: string): boolean {
  return (ALERT_TYPES as readonly string[]).includes(v);
}

function isAlertSeverity(v: string): boolean {
  return (ALERT_SEVERITIES as readonly string[]).includes(v);
}

const alertRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /alerts ───────────────────────────────────────────────────────
  // List alerts for the org. Supports filters: acknowledged, patientId, severity.
  app.get('/alerts', async (request: FastifyRequest, _reply) => {
    const query = request.query as {
      acknowledged?: string;
      patientId?: string;
      severity?: string;
    };

    const where: Record<string, unknown> = {
      organizationId: request.organizationId,
    };

    if (query.acknowledged !== undefined) {
      where['acknowledged'] = query.acknowledged === 'true';
    }
    if (query.patientId) {
      where['patientId'] = query.patientId;
    }
    if (query.severity && isAlertSeverity(query.severity)) {
      where['severity'] = query.severity;
    }

    const alerts = await app.prisma.clinicalAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, fullName: true } },
      },
      take: 100,
    });

    return { items: alerts };
  });

  // ── POST /alerts ──────────────────────────────────────────────────────
  // Create an alert (internal use).
  app.post(
    '/alerts',
    { preHandler: [requirePermission({ resource: 'patients', action: 'update' })] },
    async (request: FastifyRequest, reply) => {
      const body = request.body as {
        patientId: string;
        sessionId?: string | null;
        type: string;
        severity?: string;
        description: string;
        metadata?: Record<string, unknown>;
      };

      if (!isAlertType(body.type)) {
        return reply.status(400).send({ message: `Tipo de alerta inválido. Use: ${ALERT_TYPES.join(', ')}` });
      }
      const severity = body.severity ?? 'MEDIUM';
      if (!isAlertSeverity(severity)) {
        return reply.status(400).send({ message: `Severidade inválida. Use: ${ALERT_SEVERITIES.join(', ')}` });
      }

      const patient = await app.prisma.patient.findFirst({
        where: { id: body.patientId, organizationId: request.organizationId, deletedAt: null },
      });
      if (!patient) {
        throw new NotFoundError('Patient', body.patientId);
      }

      if (body.sessionId) {
        const session = await app.prisma.clinicalSession.findFirst({
          where: { id: body.sessionId, organizationId: request.organizationId },
        });
        if (!session) {
          throw new NotFoundError('ClinicalSession', body.sessionId);
        }
      }

      const alert = await app.prisma.clinicalAlert.create({
        data: {
          id: generateId(),
          organizationId: request.organizationId,
          patientId: body.patientId,
          sessionId: body.sessionId ?? null,
          type: body.type,
          severity,
          description: body.description,
          metadata: (body.metadata ?? {}) as any,
        },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'CREATE',
        resource: 'clinical_alert',
        resourceId: alert.id,
        metadata: { patientId: body.patientId, type: body.type, severity },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(201).send(alert);
    },
  );

  // ── PATCH /alerts/:id/acknowledge ─────────────────────────────────────
  // Mark an alert as acknowledged.
  app.patch(
    '/alerts/:id/acknowledge',
    { preHandler: [requirePermission({ resource: 'patients', action: 'update' })] },
    async (request: FastifyRequest, _reply) => {
      const { id } = request.params as { id: string };

      const existing = await app.prisma.clinicalAlert.findFirst({
        where: { id, organizationId: request.organizationId },
      });
      if (!existing) {
        throw new NotFoundError('ClinicalAlert', id);
      }

      const alert = await app.prisma.clinicalAlert.update({
        where: { id },
        data: {
          acknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedById: request.userId,
        },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'UPDATE',
        resource: 'clinical_alert',
        resourceId: alert.id,
        metadata: { acknowledged: true, patientId: existing.patientId },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return alert;
    },
  );
};

export default alertRoutes;
