import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import {
  AuthError,
  ConflictError,
  comparePassword,
  hashPassword,
  generateId,
} from '@avesia/shared';
import { loginSchema, registerSchema, refreshSchema } from '@avesia/shared';
import { Role } from '@avesia/types';

import { requireAuth } from '../plugins/auth.js';
import { signTokens, verifyRefreshToken, hashToken } from '../utils/jwt-utils.js';
import { writeAuditLog } from '../utils/audit-log.js';

function stripPasswordHash(user: Record<string, unknown>): Record<string, unknown> {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

const authRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // ── POST /auth/login ──────────────────────────────────────────────────
  app.post('/auth/login', async (request: FastifyRequest, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await app.prisma.user.findFirst({
      where: { email: body.email, deletedAt: null },
      include: { organization: true, professional: true },
    });

    if (!user) {
      throw new AuthError('Invalid email or password');
    }

    const valid = await comparePassword(body.password, user.passwordHash);
    if (!valid) {
      throw new AuthError('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new AuthError('Account is not active');
    }

    const tokens = signTokens(app, {
      sub: user.id as never,
      org: user.organizationId as never,
      role: user.role as never,
    });

    // Create refresh token with family
    const family = generateId();
    await app.prisma.refreshToken.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        tokenHash: hashToken(tokens.refreshToken),
        family,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Update last login
    await app.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    void writeAuditLog(app.prisma, {
      organizationId: user.organizationId,
      userId: user.id,
      action: 'CREATE',
      resource: 'session',
      resourceId: null,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    // Check if user needs to accept any terms
    const activeTerms = await app.prisma.termsVersion.findMany({
      where: { isActive: true },
    });
    const acceptedTerms = await app.prisma.termsAcceptance.findMany({
      where: { userId: user.id },
      select: { termsVersionId: true },
    });
    const acceptedIds = new Set(acceptedTerms.map((a) => a.termsVersionId));
    const pendingTerms = activeTerms
      .filter((t) => !acceptedIds.has(t.id))
      .map((t) => ({ id: t.id, type: t.type, version: t.version, title: t.title, summary: t.summary }));

    return reply.status(200).send({
      user: stripPasswordHash(user as unknown as Record<string, unknown>),
      organization: user.organization
        ? { slug: user.organization.slug, name: user.organization.name }
        : null,
      tokens,
      pendingTerms,
    });
  });

  // ── POST /auth/register ───────────────────────────────────────────────
  app.post('/auth/register', async (request: FastifyRequest, reply) => {
    const body = registerSchema.parse(request.body);

    // Check if email is already in use
    const existing = await app.prisma.user.findFirst({
      where: { email: body.email, deletedAt: null },
    });
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const orgId = generateId();
    const userId = generateId();
    const hashed = await hashPassword(body.password);
    const slug = body.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const result = await app.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          id: orgId,
          name: body.organizationName,
          slug: `${slug}-${orgId.slice(0, 6)}`,
        },
      });

      const user = await tx.user.create({
        data: {
          id: userId,
          organizationId: orgId,
          email: body.email,
          passwordHash: hashed,
          role: Role.OWNER,
          status: 'ACTIVE',
        },
      });

      return { organization, user };
    });

    const tokens = signTokens(app, {
      sub: result.user.id as never,
      org: result.organization.id as never,
      role: result.user.role as never,
    });

    // Create refresh token
    const family = generateId();
    await app.prisma.refreshToken.create({
      data: {
        organizationId: result.organization.id,
        userId: result.user.id,
        tokenHash: hashToken(tokens.refreshToken),
        family,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    void writeAuditLog(app.prisma, {
      organizationId: result.organization.id,
      userId: result.user.id,
      action: 'CREATE',
      resource: 'organization',
      resourceId: result.organization.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    // New users need to accept all active terms
    const activeTerms = await app.prisma.termsVersion.findMany({
      where: { isActive: true },
    });
    const pendingTerms = activeTerms.map((t) => ({
      id: t.id, type: t.type, version: t.version, title: t.title, summary: t.summary,
    }));

    return reply.status(201).send({
      organization: result.organization,
      user: stripPasswordHash(result.user as unknown as Record<string, unknown>),
      tokens,
      pendingTerms,
    });
  });

  // ── POST /auth/refresh ────────────────────────────────────────────────
  app.post('/auth/refresh', async (request: FastifyRequest, reply) => {
    const body = refreshSchema.parse(request.body);

    let payload: ReturnType<typeof verifyRefreshToken>;
    try {
      payload = verifyRefreshToken(app, body.refreshToken);
    } catch {
      throw new AuthError('Invalid or expired refresh token');
    }

    const incomingHash = hashToken(body.refreshToken);
    const storedToken = await app.prisma.refreshToken.findFirst({
      where: { tokenHash: incomingHash },
    });

    if (!storedToken) {
      throw new AuthError('Refresh token not found');
    }

    if (storedToken.revokedAt) {
      // Reuse detected! Revoke entire token family
      if (!storedToken.revokedByReuse) {
        await app.prisma.refreshToken.updateMany({
          where: { family: storedToken.family },
          data: { revokedAt: new Date(), revokedByReuse: true },
        });
      }
      throw new AuthError('Token reuse detected — all sessions revoked');
    }

    // Revoke old token
    await app.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Sign new tokens
    const tokens = signTokens(app, {
      sub: payload.sub,
      org: payload.org,
      role: payload.role,
    });

    // Create new token in same family
    await app.prisma.refreshToken.create({
      data: {
        organizationId: storedToken.organizationId,
        userId: storedToken.userId,
        tokenHash: hashToken(tokens.refreshToken),
        family: storedToken.family,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return reply.status(200).send({ tokens });
  });

  // ── GET /auth/me ──────────────────────────────────────────────────────
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

  // ── POST /auth/logout ─────────────────────────────────────────────────
  app.post(
    '/auth/logout',
    { onRequest: [requireAuth] },
    async (request: FastifyRequest, reply) => {
      await app.prisma.refreshToken.updateMany({
        where: { userId: request.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return reply.status(204).send();
    },
  );
};

export default authRoutes;
