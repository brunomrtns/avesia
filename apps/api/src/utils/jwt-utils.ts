import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { AuthTokens, JwtPayload, Role } from '@avesia/types';
import type { OrganizationId, UserId } from '@avesia/types';

import { AppConstants, generateId } from '@avesia/shared';

interface SignOptions {
  sub: UserId;
  org: OrganizationId;
  role: Role;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function signTokens(
  app: FastifyInstance,
  payload: SignOptions,
): AuthTokens {
  const jti = generateId();
  const jwtPayload = {
    sub: payload.sub,
    org: payload.org,
    role: payload.role,
    jti,
  };

  const jwt = app.jwt as any;
  const accessToken = jwt.jwtAccess.sign(jwtPayload);
  const refreshToken = jwt.jwtRefresh.sign(jwtPayload);

  return {
    accessToken,
    refreshToken,
    expiresIn: AppConstants.TOKEN_EXPIRY_SECONDS,
  };
}

export function verifyAccessToken(app: FastifyInstance, token: string): JwtPayload {
  return (app.jwt as any).jwtAccess.verify(token) as JwtPayload;
}

export function verifyRefreshToken(app: FastifyInstance, token: string): JwtPayload {
  return (app.jwt as any).jwtRefresh.verify(token) as JwtPayload;
}
