// ============================================================================
//  API — WebSocket plugin for real-time Knowledge Base progress
//
//  Registers @fastify/websocket and exposes:
//    GET /knowledge-bases/:id/progress  (WebSocket)
//
//  On connect:
//    1. Authenticates via ?token=<accessJwt> (browsers can't set WS headers).
//    2. Verifies the KB belongs to the caller's organization.
//    3. Subscribes to the Redis pub/sub channel the worker publishes to and
//       forwards every pipeline progress event to the client as JSON.
//
//  The UI never runs AI processing — it only consumes this stream.
// ============================================================================

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import IORedis from 'ioredis';

import { env } from '../config/env.js';
import { AuthError, NotFoundError } from '@avesia/shared';
import { kbProgressChannel, copilotChannel } from '@avesia/ai-core';

const websocketPlugin: FastifyPluginAsync = async (app): Promise<void> => {
  await app.register(websocket, {
    options: {
      maxPayload: 1024 * 64,
    },
  });

  // ── KB progress WebSocket ────────────────────────────────────────────────
  app.get(
    '/knowledge-bases/:id/progress',
    { websocket: true },
    async (socket, request: FastifyRequest) => {
      const { id } = request.params as { id: string };

      const token = (request.query as { token?: string }).token;
      if (!token) {
        socket.close(4001, 'Missing token');
        return;
      }

      let payload: { sub: string; org: string; role: string };
      try {
        payload = app.jwtAccess.verify(token) as typeof payload;
      } catch {
        socket.close(4001, 'Invalid or expired token');
        return;
      }

      const organizationId = payload.org;

      const kb = await app.prisma.knowledgeBase.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!kb) {
        socket.close(4004, new NotFoundError('KnowledgeBase', id).message);
        return;
      }

      const channel = kbProgressChannel(id);
      const subscriber = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
      let closed = false;

      const cleanup = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        try {
          await subscriber.unsubscribe(channel);
          await subscriber.quit();
        } catch {
          // best-effort
        }
      };

      socket.on('close', () => void cleanup());
      socket.on('error', () => void cleanup());

      try {
        await subscriber.subscribe(channel);
        subscriber.on('message', (_channel, message) => {
          if (closed) return;
          try {
            socket.send(message);
          } catch {
            void cleanup();
          }
        });
      } catch {
        socket.close(1011, 'Subscription failed');
        await cleanup();
      }
    },
  );

  // ── Session copilot WebSocket ────────────────────────────────────────────
  // Real-time stream of copilot assistance items, status updates, and errors.
  // The frontend connects when entering a session room and the copilot is enabled.
  app.get(
    '/sessions/:id/copilot',
    { websocket: true },
    async (socket, request: FastifyRequest) => {
      const { id } = request.params as { id: string };

      // Auth via query string token (browsers can't set WS headers).
      const token = (request.query as { token?: string }).token;
      if (!token) {
        socket.close(4001, 'Missing token');
        return;
      }

      let payload: { sub: string; org: string; role: string };
      try {
        payload = app.jwtAccess.verify(token) as typeof payload;
      } catch {
        socket.close(4001, 'Invalid or expired token');
        return;
      }

      const organizationId = payload.org;

      // Verify the session belongs to the caller's organization.
      const session = await app.prisma.clinicalSession.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      if (!session) {
        socket.close(4004, new NotFoundError('Session', id).message);
        return;
      }

      // Subscribe to the copilot's Redis pub/sub channel.
      const channel = copilotChannel(id);
      const subscriber = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
      let closed = false;

      const cleanup = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        try {
          await subscriber.unsubscribe(channel);
          await subscriber.quit();
        } catch {
          // best-effort
        }
      };

      socket.on('close', () => void cleanup());
      socket.on('error', () => void cleanup());

      try {
        await subscriber.subscribe(channel);
        subscriber.on('message', (_channel, message) => {
          if (closed) return;
          try {
            socket.send(message);
          } catch {
            void cleanup();
          }
        });
      } catch {
        socket.close(1011, 'Subscription failed');
        await cleanup();
      }
    },
  );
};

// Re-export so route modules can guard WS-aware requests if needed.
export { AuthError };

export default websocketPlugin;
