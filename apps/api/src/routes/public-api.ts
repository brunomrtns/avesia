import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';

import { AuthError, NotFoundError } from '@avesia/shared';

/**
 * Custom API key authentication middleware.
 *
 * Reads the API key from the `X-API-Key` header (or `Authorization: Bearer <key>`).
 * Hashes the provided key with SHA-256 and looks up the matching ApiKey record.
 * Does NOT use requireAuth/requireTenant — this is a separate auth path for the
 * public API.
 */
async function requireApiKey(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // Extract the key from the X-API-Key header, or from the Authorization header.
  let apiKey: string | undefined;
  const xApiKey = request.headers['x-api-key'];
  if (typeof xApiKey === 'string') {
    apiKey = xApiKey;
  } else if (Array.isArray(xApiKey) && xApiKey.length > 0) {
    apiKey = xApiKey[0];
  } else {
    const authHeader = request.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      apiKey = authHeader.slice(7).trim();
    }
  }

  if (!apiKey) {
    throw new AuthError('API key required. Provide it via the X-API-Key header.');
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  const record = await request.server.prisma.apiKey.findUnique({
    where: { keyHash },
  });

  if (!record || record.revokedAt !== null) {
    throw new AuthError('Invalid or revoked API key.');
  }

  // Check expiry
  if (record.expiresAt && record.expiresAt < new Date()) {
    throw new AuthError('API key has expired.');
  }

  // Attach organization context to the request for downstream handlers.
  request.organizationId = record.organizationId;
  // Best-effort update of lastUsedAt (fire-and-forget).
  void request.server.prisma.apiKey
    .update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});
}

const publicApiRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All public API routes use API key auth (not JWT).
  app.addHook('onRequest', requireApiKey);

  // ── GET /public/patients ──────────────────────────────────────────────
  app.get('/public/patients', async (request: FastifyRequest, _reply) => {
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10) || 20));

    const [items, total] = await Promise.all([
      app.prisma.patient.findMany({
        where: { organizationId: request.organizationId, deletedAt: null },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.patient.count({
        where: { organizationId: request.organizationId, deletedAt: null },
      }),
    ]);

    return { items, page, pageSize, total };
  });

  // ── GET /public/sessions ──────────────────────────────────────────────
  app.get('/public/sessions', async (request: FastifyRequest, _reply) => {
    const query = request.query as {
      page?: string;
      pageSize?: string;
      patientId?: string;
      status?: string;
    };
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10) || 20));

    const where: Record<string, unknown> = {
      organizationId: request.organizationId,
    };
    if (query.patientId) where['patientId'] = query.patientId;
    if (query.status) where['status'] = query.status;

    const [items, total] = await Promise.all([
      app.prisma.clinicalSession.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { scheduledAt: 'desc' },
        include: {
          patient: { select: { id: true, fullName: true } },
          professional: { select: { id: true, fullName: true } },
        },
      }),
      app.prisma.clinicalSession.count({ where }),
    ]);

    return { items, page, pageSize, total };
  });

  // ── GET /public/patients/:id ──────────────────────────────────────────
  app.get('/public/patients/:id', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const patient = await app.prisma.patient.findFirst({
      where: { id, organizationId: request.organizationId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundError('Patient', id);
    }

    return patient;
  });

  // ── GET /public/sessions/:id ──────────────────────────────────────────
  app.get('/public/sessions/:id', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const session = await app.prisma.clinicalSession.findFirst({
      where: { id, organizationId: request.organizationId },
      include: {
        patient: { select: { id: true, fullName: true } },
        professional: { select: { id: true, fullName: true } },
        notes: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });
    if (!session) {
      throw new NotFoundError('ClinicalSession', id);
    }

    return session;
  });
};

export default publicApiRoutes;
