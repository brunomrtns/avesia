import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { ZodError } from 'zod';
import { AppError } from '@avesia/shared';

import { isProduction } from '../config/env.js';

const errorHandlerPluginCallback: FastifyPluginAsync = async (
  app: FastifyInstance,
): Promise<void> => {
  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply): void => {
      // Zod validation errors → 400
      if (isZodError(error)) {
        reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.flatten(),
          },
        });
        return;
      }

      // AppError → mapped status code
      if (isAppError(error)) {
        const body: Record<string, unknown> = {
          error: {
            code: error.code,
            message: error.message,
          },
        };
        if (error.details) {
          (body['error'] as Record<string, unknown>)['details'] = error.details;
        }
        reply.status(error.statusCode).send(body);
        return;
      }

      // Fastify validation errors (schema validation) → 400
      if (error.validation) {
        reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
        return;
      }

      // Unknown errors → 500 (never expose internals in production)
      request.log.error({ err: error }, 'Unhandled error');
      reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: isProduction ? 'An unexpected error occurred' : error.message,
        },
      });
    },
  );

  // Handle 404 for unmatched routes
  app.setNotFoundHandler(
    (_request: FastifyRequest, reply: FastifyReply): void => {
      reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
        },
      });
    },
  );
};

export const errorHandlerPlugin = fp(errorHandlerPluginCallback);


function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
