import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import fp from 'fastify-plugin';

import { env } from '../config/env.js';
import { AuthError } from '@avesia/shared';
import { Role } from '@avesia/types';
import { generateId } from '@avesia/shared';

// ── BI Identity user object (from /api/auth/check) ───────────────────────────

interface BiRole {
  id: string;
  name: string;
  systemSlug: string;
  systemName: string;
  isGlobal: boolean;
  organizationId: string;
}

interface BiOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface BiUser {
  id: string;
  email: string;
  name: string;
  status: string;
  isSuperAdmin: boolean;
  roles: BiRole[];
  organizations: BiOrganization[];
}

// ── Cookie parsing ───────────────────────────────────────────────────────────

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) {
      cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
    }
  }
  return cookies;
}

// ── BI role → Avesia role mapping ─────────────────────────────────────────────

function mapBiRoleToAvesia(biUser: BiUser): string {
  if (biUser.isSuperAdmin) return Role.SUPER_ADMIN;

  // Check roles for Avesia system (systemSlug: 'avesia')
  const avesiaRole = biUser.roles.find((r) => r.systemSlug === 'avesia');
  if (avesiaRole) {
    const name = avesiaRole.name.toUpperCase();
    if (name === 'SUPER_ADMIN') return Role.SUPER_ADMIN;
    if (name === 'OWNER') return Role.OWNER;
    if (name === 'ADMIN') return Role.ADMIN;
    if (name === 'PROFESSIONAL') return Role.PROFESSIONAL;
  }

  // Fallback: check organization roles
  for (const org of biUser.organizations) {
    const role = org.role.toUpperCase();
    if (role === 'OWNER') return Role.OWNER;
    if (role === 'ADMIN') return Role.ADMIN;
    if (role === 'PROFESSIONAL') return Role.PROFESSIONAL;
  }

  return Role.PROFESSIONAL;
}

// ── Validate BI auth cookie and return local user ─────────────────────────────

interface LocalUserContext {
  userId: string;
  organizationId: string;
  role: string;
}

async function validateBiAuth(
  prisma: PrismaClient,
  cookieHeader: string | undefined,
): Promise<LocalUserContext> {
  const cookies = parseCookies(cookieHeader);
  const biAuthCookie = cookies['bi_auth'];

  if (!biAuthCookie) {
    throw new AuthError('No bi_auth cookie — redirect to BI Identity login');
  }

  // Call BI Identity /api/auth/check with cookie forwarded
  let biUser: BiUser;
  try {
    const res = await fetch(`${env.BI_IDENTITY_URL}/api/auth/check`, {
      method: 'GET',
      headers: {
        Cookie: `bi_auth=${biAuthCookie}`,
      },
    });

    if (!res.ok) {
      throw new AuthError('BI Identity rejected the session');
    }

    biUser = (await res.json()) as BiUser;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError('Failed to contact BI Identity Service');
  }

  if (biUser.status !== 'ACTIVE') {
    throw new AuthError('BI Identity account is not active');
  }

  // Find local user by biIdentityId or email
  let localUser = await prisma.user.findFirst({
    where: {
      OR: [
        { biIdentityId: biUser.id },
        { email: biUser.email, deletedAt: null },
      ],
    },
    include: { organization: true },
  });

  if (!localUser) {
    // Auto-create user from BI Identity data
    // Find or create organization by matching BI organization slug
    let organizationId: string | null = null;

    // Try to match BI organization by slug
    for (const biOrg of biUser.organizations) {
      const org = await prisma.organization.findFirst({
        where: {
          OR: [
            { slug: biOrg.slug },
            { name: biOrg.name },
          ],
          deletedAt: null,
        },
      });
      if (org) {
        organizationId = org.id;
        break;
      }
    }

    if (!organizationId) {
      throw new AuthError(
        'No matching Avesia organization found for this BI Identity user',
      );
    }

    const role = mapBiRoleToAvesia(biUser);
    const userId = generateId();

    localUser = await prisma.user.create({
      data: {
        id: userId,
        organizationId,
        email: biUser.email,
        passwordHash: null,
        biIdentityId: biUser.id,
        role,
        status: 'ACTIVE',
      },
      include: { organization: true },
    });
  }

  // Update last login
  await prisma.user.update({
    where: { id: localUser.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    userId: localUser.id,
    organizationId: localUser.organizationId,
    role: localUser.role,
  };
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const authPluginCallback: FastifyPluginAsync = async (
  _app: FastifyInstance,
): Promise<void> => {
  // No JWT registration — BI Identity SSO handles authentication via cookies
};

export const authPlugin = fp(authPluginCallback);

// ── requireAuth — validates bi_auth cookie via BI Identity ────────────────────

export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const ctx = await validateBiAuth(
    request.server.prisma,
    request.headers.cookie,
  );

  request.userId = ctx.userId;
  request.organizationId = ctx.organizationId;
  request.role = ctx.role as never;
}

// ── Exported for WebSocket plugin (same cookie validation) ────────────────────

export { validateBiAuth, parseCookies };
export type { BiUser, LocalUserContext };
