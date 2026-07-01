import 'fastify';
import type { FastifyJwtSignature, JWT } from '@fastify/jwt';
import type { PrismaClient } from '@prisma/client';
import type { JwtPayload } from '@avesia/types';
import type { Role } from '@avesia/types';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    jwtAccess: FastifyJwtSignature;
    jwtRefresh: FastifyJwtSignature;
  }

  interface FastifyRequest {
    user: JwtPayload;
    userId: string;
    organizationId: string;
    role: Role;
    jwtAccessJwtVerify: (options?: unknown) => Promise<JwtPayload>;
    jwtRefreshJwtVerify: (options?: unknown) => Promise<JwtPayload>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
