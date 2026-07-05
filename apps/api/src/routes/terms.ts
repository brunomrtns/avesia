import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { generateId } from '@avesia/shared';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant, requirePermission } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';

const VALID_TYPES = ['TERMS_OF_USE', 'AI_NOTICE', 'PRIVACY_POLICY'] as const;
type TermsType = (typeof VALID_TYPES)[number];

// ── Public routes (no auth) ──────────────────────────────────────────────────
const termsPublicRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // GET /terms/current — all active terms versions
  app.get('/terms/current', async (_request: FastifyRequest, reply) => {
    const versions = await app.prisma.termsVersion.findMany({
      where: { isActive: true },
      orderBy: { type: 'asc' },
    });
    return reply.send({ items: versions });
  });

  // GET /terms/:type/current — active version for a specific type
  app.get<{ Params: { type: string } }>(
    '/terms/:type/current',
    async (request, reply) => {
      const { type } = request.params;
      if (!VALID_TYPES.includes(type as TermsType)) {
        return reply.status(400).send({ message: 'Tipo de termos inválido.' });
      }
      const version = await app.prisma.termsVersion.findFirst({
        where: { type, isActive: true },
      });
      if (!version) {
        return reply.status(404).send({ message: 'Nenhuma versão ativa encontrada.' });
      }
      return reply.send(version);
    },
  );
};

// ── Authenticated routes ─────────────────────────────────────────────────────
const termsAuthRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // GET /terms/acceptances/me — user's accepted + pending terms
  app.get('/terms/acceptances/me', async (request: FastifyRequest, reply) => {
    const acceptances = await app.prisma.termsAcceptance.findMany({
      where: { userId: request.userId },
      include: { termsVersion: true },
    });

    const activeVersions = await app.prisma.termsVersion.findMany({
      where: { isActive: true },
    });

    const acceptedVersionIds = new Set(acceptances.map((a) => a.termsVersionId));
    const pending = activeVersions.filter((v) => !acceptedVersionIds.has(v.id));

    return reply.send({
      accepted: acceptances.map((a) => ({
        id: a.id,
        termsVersionId: a.termsVersionId,
        type: a.termsVersion.type,
        version: a.termsVersion.version,
        acceptedAt: a.acceptedAt,
      })),
      pending: pending.map((v) => ({
        id: v.id,
        type: v.type,
        version: v.version,
        title: v.title,
        summary: v.summary,
      })),
    });
  });

  // POST /terms/accept — accept one or more terms versions
  app.post<{ Body: { termsVersionIds: string[] } }>(
    '/terms/accept',
    async (request, reply) => {
      const { termsVersionIds } = request.body;
      if (!Array.isArray(termsVersionIds) || termsVersionIds.length === 0) {
        return reply.status(400).send({ message: 'termsVersionIds é obrigatório.' });
      }

      const versions = await app.prisma.termsVersion.findMany({
        where: { id: { in: termsVersionIds }, isActive: true },
      });
      if (versions.length !== termsVersionIds.length) {
        return reply.status(400).send({ message: 'Uma ou mais versões são inválidas ou inativas.' });
      }

      for (const version of versions) {
        await app.prisma.termsAcceptance.upsert({
          where: {
            userId_termsVersionId: {
              userId: request.userId!,
              termsVersionId: version.id,
            },
          },
          create: {
            id: generateId(),
            userId: request.userId!,
            termsVersionId: version.id,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] ?? '',
          },
          update: {
            acceptedAt: new Date(),
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] ?? '',
          },
        });
      }

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId!,
        userId: request.userId!,
        action: 'ACCEPT',
        resource: 'terms',
        resourceId: termsVersionIds.join(','),
        metadata: { versions: versions.map((v) => ({ type: v.type, version: v.version })) },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(200).send({ accepted: termsVersionIds.length });
    },
  );

  // ── Admin endpoints (OWNER/ADMIN only) ────────────────────────────────

  // GET /terms — list all versions (admin)
  app.get(
    '/terms',
    { preHandler: [requirePermission({ resource: 'organization', action: 'read' })] },
    async (_request: FastifyRequest, reply) => {
      const versions = await app.prisma.termsVersion.findMany({
        orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
      });
      return reply.send({ items: versions });
    },
  );

  // POST /terms — create a new version (admin)
  app.post<{ Body: { type: string; version: string; title: string; content: string; summary?: string; activate?: boolean } }>(
    '/terms',
    { preHandler: [requirePermission({ resource: 'organization', action: 'update' })] },
    async (request, reply) => {
      const { type, version, title, content, summary, activate } = request.body;

      if (!VALID_TYPES.includes(type as TermsType)) {
        return reply.status(400).send({ message: 'Tipo inválido. Use: TERMS_OF_USE, AI_NOTICE, PRIVACY_POLICY' });
      }
      if (!version || !title || !content) {
        return reply.status(400).send({ message: 'version, title e content são obrigatórios.' });
      }

      const existing = await app.prisma.termsVersion.findUnique({
        where: { type_version: { type, version } },
      });
      if (existing) {
        return reply.status(409).send({ message: `Versão ${version} já existe para ${type}.` });
      }

      const record = await app.prisma.termsVersion.create({
        data: {
          id: generateId(),
          type,
          version,
          title,
          content,
          summary: summary ?? null,
          isActive: activate ?? false,
          publishedAt: activate ? new Date() : null,
        },
      });

      if (activate) {
        await app.prisma.termsVersion.updateMany({
          where: { type, id: { not: record.id } },
          data: { isActive: false },
        });
      }

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId!,
        userId: request.userId!,
        action: 'CREATE',
        resource: 'terms_version',
        resourceId: record.id,
        metadata: { type, version, activated: activate ?? false },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(201).send(record);
    },
  );

  // PATCH /terms/:id/activate — activate a version (deactivates others of same type)
  app.patch<{ Params: { id: string } }>(
    '/terms/:id/activate',
    { preHandler: [requirePermission({ resource: 'organization', action: 'update' })] },
    async (request, reply) => {
      const { id } = request.params;

      const version = await app.prisma.termsVersion.findUnique({ where: { id } });
      if (!version) {
        return reply.status(404).send({ message: 'Versão não encontrada.' });
      }

      await app.prisma.termsVersion.updateMany({
        where: { type: version.type, id: { not: id } },
        data: { isActive: false },
      });

      const updated = await app.prisma.termsVersion.update({
        where: { id },
        data: { isActive: true, publishedAt: new Date() },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId!,
        userId: request.userId!,
        action: 'ACTIVATE',
        resource: 'terms_version',
        resourceId: id,
        metadata: { type: version.type, version: version.version },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.send(updated);
    },
  );
};

const termsRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  await app.register(termsPublicRoutes);
  await app.register(termsAuthRoutes);
};

export default termsRoutes;
