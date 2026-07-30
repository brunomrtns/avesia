/**
 * Worker auth hook — accepts an API key (X-API-Key: <key>).
 *
 * Used by routes that serve the local worker (heartbeat, transcript
 * receiver). API key auth looks up the key (sha256) in the ApiKey table.
 *
 * Note: JWT fallback was removed during BI Identity SSO migration.
 * Workers must use API keys.
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

  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new AuthError('API key required (X-API-Key header)');
  }

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
}
