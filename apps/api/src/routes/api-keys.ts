import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';

import { NotFoundError, generateId } from '@avesia/shared';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant, requirePermission } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';

/**
 * Generate a random API key (64 hex chars) and its SHA-256 hash.
 * Returns the raw key (shown once to the user) and the hash (stored).
 */
function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = randomBytes(32).toString('hex');
  const keyHash = createHash('sha256').update(key).digest('hex');
  // Store a prefix for display (first 8 chars).
  const keyPrefix = `avk_${key.slice(0, 8)}`;
  return { key, keyHash, keyPrefix };
}

const apiKeyRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /api-keys ─────────────────────────────────────────────────────
  // List API keys for the org (without showing the full key).
  app.get('/api-keys', async (request: FastifyRequest, _reply) => {
    const keys = await app.prisma.apiKey.findMany({
      where: { organizationId: request.organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return { items: keys };
  });

  // ── POST /api-keys ────────────────────────────────────────────────────
  // Create a new API key. Returns the full key ONCE.
  app.post(
    '/api-keys',
    { preHandler: [requirePermission({ resource: 'organization', action: 'update' })] },
    async (request: FastifyRequest, reply) => {
      const body = request.body as { name: string; expiresAt?: string };

      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return reply.status(400).send({ message: 'Nome da chave é obrigatório.' });
      }

      const { key, keyHash, keyPrefix } = generateApiKey();

      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

      const record = await app.prisma.apiKey.create({
        data: {
          id: generateId(),
          organizationId: request.organizationId,
          name: body.name.trim(),
          keyHash,
          keyPrefix,
          expiresAt,
        },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'CREATE',
        resource: 'api_key',
        resourceId: record.id,
        metadata: { name: record.name },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      // Return the full key ONCE (never retrievable again).
      return reply.status(201).send({
        id: record.id,
        name: record.name,
        keyPrefix: record.keyPrefix,
        key, // full key — shown only this once
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
      });
    },
  );

  // ── DELETE /api-keys/:id ──────────────────────────────────────────────
  // Revoke an API key (soft delete via revokedAt).
  app.delete(
    '/api-keys/:id',
    { preHandler: [requirePermission({ resource: 'organization', action: 'update' })] },
    async (request: FastifyRequest, reply) => {
      const { id } = request.params as { id: string };

      const existing = await app.prisma.apiKey.findFirst({
        where: { id, organizationId: request.organizationId },
      });
      if (!existing) {
        throw new NotFoundError('ApiKey', id);
      }

      await app.prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'DELETE',
        resource: 'api_key',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(204).send();
    },
  );
};

export default apiKeyRoutes;
