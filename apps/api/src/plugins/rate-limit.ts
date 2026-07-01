import type { FastifyInstance } from 'fastify';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import rateLimit from '@fastify/rate-limit';

import { env } from '../config/env.js';

const rateLimitPluginCallback: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'production' ? 100 : 1000,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => {
      return {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${context.after}.`,
        },
      };
    },
  });
};

export const rateLimitPlugin = fp(rateLimitPluginCallback);
