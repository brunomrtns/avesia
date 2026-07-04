import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { Prisma } from '@prisma/client';

import { requireWorkerAuth } from '../plugins/worker-auth.js';

const workerHeartbeatRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes accept JWT OR API key
  app.addHook('onRequest', requireWorkerAuth);

  // ── POST /worker/heartbeat ────────────────────────────────────────────
  app.post('/worker/heartbeat', async (request: FastifyRequest, reply) => {
    const body = request.body as {
      workerId: string;
      hostname?: string;
      capabilities?: Record<string, unknown>;
    };

    if (!body?.workerId) {
      return reply.status(400).send({ error: 'workerId is required' });
    }

    const now = new Date();
    const capabilities: Prisma.InputJsonValue =
      (body.capabilities as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    const hostname = body.hostname ?? 'unknown';

    const worker = await app.prisma.localWorker.upsert({
      where: { workerId: body.workerId },
      create: {
        workerId: body.workerId,
        hostname,
        capabilities,
        lastHeartbeatAt: now,
        status: 'ONLINE',
        organizationId: request.organizationId ?? null,
      },
      update: {
        hostname,
        capabilities,
        lastHeartbeatAt: now,
        status: 'ONLINE',
      },
    });

    return reply.status(200).send({
      ok: true,
      workerId: worker.workerId,
      status: worker.status,
      lastHeartbeatAt: worker.lastHeartbeatAt,
    });
  });
};

export default workerHeartbeatRoutes;
