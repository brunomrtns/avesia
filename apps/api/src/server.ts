import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';

import { env, corsOrigins } from './config/env.js';
import { prismaPlugin } from './plugins/prisma.js';
import { authPlugin } from './plugins/auth.js';
import { tenantPlugin } from './plugins/tenant.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import websocketPlugin from './plugins/websocket.js';

import authRoutes from './routes/auth.js';
import patientRoutes from './routes/patients.js';
import sessionRoutes from './routes/sessions.js';
import organizationRoutes from './routes/organization.js';
import healthRoutes from './routes/health.js';
import knowledgeBaseRoutes from './routes/knowledge-base.js';
import aiProviderRoutes from './routes/ai-providers.js';
import statsRoutes from './routes/stats.js';
import gapRoutes from './routes/gaps.js';
import audioUploadRoutes from './routes/audio-upload.js';
import consentRoutes from './routes/consents.js';
import reportRoutes from './routes/reports.js';
import onboardingRoutes from './routes/onboarding.js';
import alertRoutes from './routes/alerts.js';
import publicApiRoutes from './routes/public-api.js';
import apiKeyRoutes from './routes/api-keys.js';
import workerHeartbeatRoutes from './routes/worker-heartbeat.js';
import transcriptReceiverRoutes from './routes/transcript-receiver.js';
import { startCopilotSweep, stopCopilotSweep } from './services/session-copilot-service.js';

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  // --- Plugins (order matters) ---
  await app.register(cors, { origin: [...corsOrigins], credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(tenantPlugin);
  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB — audio files can be large
      files: 1,
    },
  });
  await app.register(rateLimitPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(websocketPlugin);

  // --- Routes ---
  // In dev, Vite proxy rewrites /avesia/api/* → http://localhost:3100/*
  // In prod, nginx handles the same rewrite
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(patientRoutes);
  await app.register(sessionRoutes);
  await app.register(organizationRoutes);
  await app.register(knowledgeBaseRoutes);
  await app.register(aiProviderRoutes);
  await app.register(statsRoutes);
  await app.register(gapRoutes);
  await app.register(audioUploadRoutes);
  await app.register(consentRoutes);
  await app.register(reportRoutes);
  await app.register(onboardingRoutes);
  await app.register(alertRoutes);
  await app.register(apiKeyRoutes);
  // Public API routes use API key auth (not JWT) — registered separately.
  await app.register(publicApiRoutes);
  // Worker-facing routes (JWT OR API key auth — registered before standard
  // routes so they use their own auth hook instead of requireAuth/requireTenant)
  await app.register(workerHeartbeatRoutes);
  await app.register(transcriptReceiverRoutes);

  // --- Start copilot periodic sweep ---
  // This ensures sessions with pending segments get processed even if the
  // event-driven trigger didn't fire (e.g., not enough content at the time,
  // but enough time has passed since the last segment).
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6380';
  startCopilotSweep(app.prisma, redisUrl);

  // --- Graceful Shutdown ---
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Received signal, shutting down gracefully');
    stopCopilotSweep(app.prisma, redisUrl);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // --- Start ---
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(
    { port: env.PORT, host: env.HOST, env: env.NODE_ENV },
    'Avesia API started',
  );
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal: failed to start Avesia API', err);
  process.exit(1);
});
