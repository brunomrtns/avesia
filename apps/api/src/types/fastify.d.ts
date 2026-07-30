import 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Role } from '@avesia/types';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }

  interface FastifyRequest {
    userId: string;
    organizationId: string;
    role: Role;
  }
}
