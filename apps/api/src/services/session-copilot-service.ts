// ============================================================================
//  API — Session Copilot Service
//
//  Manages SessionAIEngine instances per organization. Each org gets its own
//  engine with its own AI provider config (from the DB, with fallback to env).
//
//  Provides methods for:
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
import { loadProviderConfigForOrg, getEmbeddingModelForOrg } from '../lib/org-ai-config.js';

// ── Shared infra ─────────────────────────────────────────────────────────────
let _redis: IORedis | null = null;
let _sweepEngine: SessionAIEngine | null = null; // engine used for periodic sweep

function getRedis(redisUrl: string): IORedis {
  if (!_redis) {
    _redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  }
  return _redis;
}

// ── Per-org engine cache ─────────────────────────────────────────────────────
// Engines are cached by organizationId. Each has its own AI provider config.
// Cache entries expire after 10 minutes of inactivity to pick up config changes.
const ENGINE_CACHE = new Map<string, { engine: SessionAIEngine; lastUsed: number }>();
const ENGINE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getEngineForOrg(
  prisma: PrismaClient,
  redisUrl: string,
  organizationId: string,
): Promise<SessionAIEngine> {
  const cached = ENGINE_CACHE.get(organizationId);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.engine;
  }

  const redis = getRedis(redisUrl);
  const providerConfig = await loadProviderConfigForOrg(prisma, organizationId);
  const providerCore = new AvesiaAICore(providerConfig);
  const embeddingModel = await getEmbeddingModelForOrg(prisma, organizationId);
  const aiCore = new AvesiaAICoreFacade(providerCore, {
    ...(embeddingModel ? { embedModel: embeddingModel } : {}),
    embedProviderConfig: providerConfig,
  });
  const engine = new SessionAIEngine(aiCore, prisma, redis);

  ENGINE_CACHE.set(organizationId, { engine, lastUsed: Date.now() });

  // Cleanup old entries
  cleanupEngineCache();

  return engine;
}

function cleanupEngineCache(): void {
  const now = Date.now();
  for (const [orgId, entry] of ENGINE_CACHE) {
    if (now - entry.lastUsed > ENGINE_TTL_MS) {
      ENGINE_CACHE.delete(orgId);
    }
  }
}

// ── Sweep engine (uses env config — processes all orgs) ──────────────────────
// The periodic sweep needs an engine that works across orgs. We use the env
// config as a baseline; individual org requests use per-org config.
function getSweepEngine(prisma: PrismaClient, redisUrl: string): SessionAIEngine {
  if (!_sweepEngine) {
    const redis = getRedis(redisUrl);
    // Sweep engine uses env config — it's a fallback for sessions that
    // didn't get processed by the event-driven path.
    const providerConfig = loadProviderConfigFromEnv();
    const providerCore = new AvesiaAICore(providerConfig);
    const embeddingModel = process.env.EMBEDDING_MODEL;
    const aiCore = new AvesiaAICoreFacade(providerCore, {
      ...(embeddingModel ? { embedModel: embeddingModel } : {}),
      embedProviderConfig: providerConfig,
    });
    _sweepEngine = new SessionAIEngine(aiCore, prisma, redis);
  }
  return _sweepEngine;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Notify the engine that a new segment was created (non-blocking). */
export function notifySegmentCreated(
  prisma: PrismaClient,
  redisUrl: string,
  sessionId: string,
  organizationId: string,
  segment: SegmentInput,
): void {
  // Fire-and-forget — the engine evaluates triggers and processes if warranted.
  void getEngineForOrg(prisma, redisUrl, organizationId)
    .then((engine) => engine.onSegmentCreated(sessionId, organizationId, segment))
    .catch((err) => {
      console.error(JSON.stringify({
        level: 'error', component: 'CopilotService', step: 'onSegmentCreated',
        sessionId, organizationId, error: err instanceof Error ? err.message : 'unknown',
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
  const engine = await getEngineForOrg(prisma, redisUrl, organizationId);
  return engine.processManually(sessionId, organizationId);
}

/** Get copilot settings for a session. */
export async function getSettings(
  prisma: PrismaClient,
  redisUrl: string,
  sessionId: string,
): Promise<CopilotSettings> {
  // Settings don't depend on AI provider — use sweep engine (any engine works)
  const engine = getSweepEngine(prisma, redisUrl);
  return engine.getSettings(sessionId);
}

/** Update copilot settings for a session. */
export async function updateSettings(
  prisma: PrismaClient,
  redisUrl: string,
  sessionId: string,
  settings: Partial<CopilotSettings>,
): Promise<CopilotSettings> {
  const engine = getSweepEngine(prisma, redisUrl);
  return engine.updateSettings(sessionId, settings);
}

/** Get the Redis connection (for WS subscription). */
export function getCopilotRedis(redisUrl: string): IORedis {
  return getRedis(redisUrl);
}

/** Start the periodic sweep that processes sessions with pending segments. */
export function startCopilotSweep(prisma: PrismaClient, redisUrl: string, intervalMs?: number): void {
  const engine = getSweepEngine(prisma, redisUrl);
  engine.startPeriodicSweep(intervalMs);
}

/** Stop the periodic sweep (on graceful shutdown). */
export function stopCopilotSweep(prisma: PrismaClient, redisUrl: string): void {
  const engine = getSweepEngine(prisma, redisUrl);
  engine.stopPeriodicSweep();
}

export { copilotChannel };
