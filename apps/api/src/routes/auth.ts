import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

import { AuthError } from '@avesia/shared';

import { requireAuth } from '../plugins/auth.js';
import { writeAuditLog } from '../utils/audit-log.js';

function stripPasswordHash(user: Record<string, unknown>): Record<string, unknown> {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

const authRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // ── GET /auth/sso-redirect ─────────────────────────────────────────────
  // Redirects to the BI Identity login page with a return redirect to Avesia
  app.get('/auth/sso-redirect', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.redirect('/id/login?redirect=/avesia/', 302);
  });

  // ── GET /auth/me ───────────────────────────────────────────────────────
  app.get(
    '/auth/me',
    { onRequest: [requireAuth] },
    async (request: FastifyRequest, _reply) => {
      const user = await app.prisma.user.findUnique({
        where: { id: request.userId },
        include: { organization: true, professional: true },
      });

      if (!user) {
        throw new AuthError('User not found');
      }

      return {
        user: stripPasswordHash(user as unknown as Record<string, unknown>),
        organization: user.organization
          ? { slug: user.organization.slug, name: user.organization.name }
          : null,
      };
    },
  );

  // ── POST /auth/logout ──────────────────────────────────────────────────
  // Calls BI Identity /api/auth/logout to revoke tokens, then clears cookies
  app.post(
    '/auth/logout',
    { onRequest: [requireAuth] },
    async (request: FastifyRequest, reply) => {
      // Revoke any local refresh tokens (cleanup, backward compat)
      await app.prisma.refreshToken.updateMany({
        where: { userId: request.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Call BI Identity logout to revoke the SSO session
      try {
        await fetch(`${process.env.BI_IDENTITY_URL ?? 'http://bi-api:3300'}/api/auth/logout`, {
          method: 'POST',
          headers: {
            Cookie: request.headers.cookie ?? '',
          },
        });
      } catch {
        // Best-effort — if BI Identity is unreachable, still proceed with local logout
      }

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'CREATE',
        resource: 'session',
        resourceId: null,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      // Clear BI Identity cookies by setting them expired
      reply.header(
        'Set-Cookie',
        [
          'bi_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
          'bi_refresh=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
        ].join('\n'),
      );

      return reply.status(204).send();
    },
  );
};

export default authRoutes;
