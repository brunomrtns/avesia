import type { FastifyInstance } from 'fastify';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { prismaClient } from '../utils/prisma-client.js';

const prismaPluginCallback: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  app.decorate('prisma', prismaClient);

  app.addHook('onClose', async (server) => {
    await server.prisma.$disconnect();
  });
};

export const prismaPlugin = fp(prismaPluginCallback);
