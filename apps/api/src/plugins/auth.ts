import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsync } from 'fastify';

import jwt from '@fastify/jwt';

import fp from 'fastify-plugin';

import { env } from '../config/env.js';
import { AuthError } from '@avesia/shared';

const authPluginCallback: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    namespace: 'jwtAccess',
    sign: { expiresIn: env.JWT_ACCESS_TTL },
  });

  await app.register(jwt, {
    secret: env.JWT_REFRESH_SECRET,
    namespace: 'jwtRefresh',
    sign: { expiresIn: env.JWT_REFRESH_TTL },
  });
};

export const authPlugin = fp(authPluginCallback);

export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
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
