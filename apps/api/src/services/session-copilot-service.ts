// ============================================================================
//  API — Session Copilot Service
//
//  Singleton that manages the SessionAIEngine instance and a shared Redis
//  connection. Provides methods for:
//  - Notifying the engine when a segment is created (event-driven trigger).
//  - Manually triggering a processing cycle.
//  - Getting/updating copilot settings.
//  - Accessing the Redis connection for WS subscription.
// ============================================================================

import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import {
  AvesiaAICore,
  loadProviderConfigFromEnv,
} from '@avesia/ai-providers';
import {
  AvesiaAICoreFacade,
  SessionAIEngine,
  type CopilotSettings,
  type CopilotCycleResult,
  type SegmentInput,
  copilotChannel,
} from '@avesia/ai-core';

let _engine: SessionAIEngine | null = null;
let _redis: IORedis | null = null;

function getRedis(redisUrl: string): IORedis {
  if (!_redis) {
    _redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  }
  return _redis;
}

function getEngine(prisma: PrismaClient, redisUrl: string): SessionAIEngine {
  if (!_engine) {
    const redis = getRedis(redisUrl);
    const providerConfig = loadProviderConfigFromEnv();
    const providerCore = new AvesiaAICore(providerConfig);
    const embeddingModel = process.env.EMBEDDING_MODEL;
    const aiCore = new AvesiaAICoreFacade(providerCore, {
      ...(embeddingModel ? { embedModel: embeddingModel } : {}),
      embedProviderConfig: providerConfig,
    });
    _engine = new SessionAIEngine(aiCore, prisma, redis);
  }
  return _engine;
}

/** Notify the engine that a new segment was created (non-blocking). */
export function notifySegmentCreated(
  prisma: PrismaClient,
  redisUrl: string,
  sessionId: string,
  organizationId: string,
  segment: SegmentInput,
): void {
  // Fire-and-forget — the engine evaluates triggers and processes if warranted.
  const engine = getEngine(prisma, redisUrl);
  void engine.onSegmentCreated(sessionId, organizationId, segment).catch((err) => {
    console.error(JSON.stringify({
      level: 'error', component: 'CopilotService', step: 'onSegmentCreated',
      sessionId, error: err instanceof Error ? err.message : 'unknown',
    }));
  });
}

/** Manually trigger a processing cycle. */
export async function processManually(
  prisma: PrismaClient,
  redisUrl: string,
  sessionId: string,
  organizationId: string,
): Promise<CopilotCycleResult | null> {
  const engine = getEngine(prisma, redisUrl);
  return engine.processManually(sessionId, organizationId);
}

/** Get copilot settings for a session. */
export async function getSettings(
  prisma: PrismaClient,
  redisUrl: string,
  sessionId: string,
): Promise<CopilotSettings> {
  const engine = getEngine(prisma, redisUrl);
  return engine.getSettings(sessionId);
}

/** Update copilot settings for a session. */
export async function updateSettings(
  prisma: PrismaClient,
  redisUrl: string,
  sessionId: string,
  settings: Partial<CopilotSettings>,
): Promise<CopilotSettings> {
  const engine = getEngine(prisma, redisUrl);
  return engine.updateSettings(sessionId, settings);
}

/** Get the Redis connection (for WS subscription). */
export function getCopilotRedis(redisUrl: string): IORedis {
  return getRedis(redisUrl);
}

export { copilotChannel };
