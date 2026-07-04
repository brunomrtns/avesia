/**
 * Hybrid auth hook — accepts either a JWT (Authorization: Bearer <jwt>)
 * or an API key (X-API-Key: <key>).
 *
 * Used by routes that serve the local worker (heartbeat, transcript
 * receiver). JWT auth goes through the standard @fastify/jwt machinery;
 * API key auth looks up the key (sha256) in the ApiKey table.
 */

import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthError } from '@avesia/shared';

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function requireWorkerAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers['x-api-key'];

  // 1. Try API key first (if present)
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    const prisma = request.server.prisma;
    const keyHash = hashApiKey(apiKey);
    const record = await prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!record || record.revokedAt !== null) {
      throw new AuthError('Invalid or revoked API key');
    }
    if (record.expiresAt !== null && record.expiresAt.getTime() < Date.now()) {
      throw new AuthError('API key expired');
    }

    // Attach org context so downstream handlers can use it.
    request.organizationId = record.organizationId;
    request.userId = 'worker';
    // Update lastUsedAt (fire-and-forget)
    void prisma.apiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });
    return;
  }

  // 2. Fall back to JWT (Authorization: Bearer <jwt>)
  try {
    await request.jwtAccessJwtVerify();
  } catch {
    throw new AuthError('Invalid or expired access token');
  }

  const payload = request.user;
  request.userId = payload.sub;
  request.organizationId = payload.org;
  request.role = payload.role;
}
