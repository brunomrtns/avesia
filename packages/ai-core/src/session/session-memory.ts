// ============================================================================
//  Avesia AI Core — Session Memory (Redis-backed, incremental)
//
//  The session memory is the copilot's "notebook" — it accumulates clinical
//  context, hypotheses, symptoms, themes, open questions, and references to
//  KB documents across processing cycles. This avoids reprocessing the entire
//  transcript on every cycle.
//
//  Storage: Redis hash with TTL (session-scoped, ephemeral).
//  Key: session:copilot:memory:{sessionId}
//  TTL: 12 hours (covers the longest sessions + post-session review).
// ============================================================================

import type { Redis } from 'ioredis';
import {
  type SessionMemory,
  type SessionMemoryUpdate,
  type CopilotSettings,
  emptyMemory,
  defaultSettings,
  type HypothesisEntry,
  type RelevantDocRef,
} from './types.js';

const MEMORY_KEY = (sessionId: string) => `session:copilot:memory:${sessionId}`;
const SETTINGS_KEY = (sessionId: string) => `session:copilot:settings:${sessionId}`;
const ACTIVE_SESSIONS_KEY = 'session:copilot:active_sessions';
const TTL_SECONDS = 12 * 60 * 60; // 12 hours

export class SessionMemoryStore {
  constructor(private readonly redis: Redis) {}

  // ── Memory ───────────────────────────────────────────────────────────────

  async getMemory(sessionId: string): Promise<SessionMemory> {
    const raw = await this.redis.get(MEMORY_KEY(sessionId));
    if (!raw) return emptyMemory();
    try {
      const parsed = JSON.parse(raw) as SessionMemory;
      return {
        ...emptyMemory(),
        ...parsed,
        lastTopicEmbedding: parsed.lastTopicEmbedding
          ? Array.from(parsed.lastTopicEmbedding)
          : null,
      };
    } catch {
      return emptyMemory();
    }
  }

  async setMemory(sessionId: string, memory: SessionMemory): Promise<void> {
    const serialized = JSON.stringify(memory);
    await this.redis.set(MEMORY_KEY(sessionId), serialized, 'EX', TTL_SECONDS);
  }

  /**
   * Apply an incremental update to the memory and persist.
   * Merges new items with existing ones, deduplicates, and caps list sizes
   * to prevent unbounded growth.
   */
  async applyUpdate(sessionId: string, update: SessionMemoryUpdate, current: SessionMemory): Promise<SessionMemory> {
    const updated: SessionMemory = {
      contextSummary: current.contextSummary,
      themes: dedupeStrings([...current.themes, ...(update.newThemes ?? [])]).slice(0, 20),
      symptoms: dedupeStrings([...current.symptoms, ...(update.newSymptoms ?? [])]).slice(0, 20),
      hypotheses: mergeHypotheses(current.hypotheses, update.newHypotheses ?? []).slice(0, 10),
      openQuestions: dedupeStrings([
        ...current.openQuestions.filter((q) => !(update.resolvedQuestions ?? []).includes(q)),
        ...(update.newOpenQuestions ?? []),
      ]).slice(0, 15),
      relevantDocs: mergeDocs(current.relevantDocs, update.newRelevantDocs ?? []).slice(0, 20),
      usedConcepts: dedupeStrings([...current.usedConcepts, ...(update.newUsedConcepts ?? [])]).slice(0, 30),
      lastProcessedSeq: current.lastProcessedSeq,
      lastProcessedAt: current.lastProcessedAt,
      lastTopicEmbedding: current.lastTopicEmbedding,
    };
    await this.setMemory(sessionId, updated);
    return updated;
  }

  async clearMemory(sessionId: string): Promise<void> {
    await this.redis.del(MEMORY_KEY(sessionId));
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  async getSettings(sessionId: string): Promise<CopilotSettings> {
    const raw = await this.redis.get(SETTINGS_KEY(sessionId));
    if (!raw) return defaultSettings();
    try {
      return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<CopilotSettings>) };
    } catch {
      return defaultSettings();
    }
  }

  async setSettings(sessionId: string, settings: CopilotSettings): Promise<void> {
    await this.redis.set(SETTINGS_KEY(sessionId), JSON.stringify(settings), 'EX', TTL_SECONDS);
  }

  // ── Processing lock (prevent concurrent cycles for the same session) ─────

  async acquireProcessingLock(sessionId: string, ttlMs = 60_000): Promise<boolean> {
    const key = `session:copilot:lock:${sessionId}`;
    const result = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async releaseProcessingLock(sessionId: string): Promise<void> {
    await this.redis.del(`session:copilot:lock:${sessionId}`);
  }

  // ── Active session tracking (for periodic sweep) ─────────────────────────

  /** Mark a session as active (has pending segments to check). */
  async markSessionActive(sessionId: string): Promise<void> {
    await this.redis.sadd(ACTIVE_SESSIONS_KEY, sessionId);
    // Expire the set itself so it doesn't grow forever.
    await this.redis.expire(ACTIVE_SESSIONS_KEY, TTL_SECONDS);
  }

  /** Remove a session from the active set (e.g., after all segments processed). */
  async markSessionInactive(sessionId: string): Promise<void> {
    await this.redis.srem(ACTIVE_SESSIONS_KEY, sessionId);
  }

  /** Get all sessions that have pending segments to check. */
  async getActiveSessions(): Promise<string[]> {
    return this.redis.smembers(ACTIVE_SESSIONS_KEY);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function dedupeStrings(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const lower = item.toLowerCase().trim();
    if (lower && !seen.has(lower)) {
      seen.add(lower);
      out.push(item);
    }
  }
  return out;
}

function mergeHypotheses(
  existing: readonly HypothesisEntry[],
  updates: readonly HypothesisEntry[],
): HypothesisEntry[] {
  // New hypotheses are appended; existing ones keep their status unless
  // an update with the same description changes the status.
  const merged = [...existing];
  for (const update of updates) {
    const idx = merged.findIndex(
      (h) => h.description.toLowerCase() === update.description.toLowerCase(),
    );
    if (idx >= 0) {
      merged[idx] = update; // refines status/confidence
    } else {
      merged.push(update);
    }
  }
  return merged;
}

function mergeDocs(
  existing: readonly RelevantDocRef[],
  updates: readonly RelevantDocRef[],
): RelevantDocRef[] {
  const byId = new Map<string, RelevantDocRef>();
  for (const d of existing) byId.set(d.documentId, d);
  for (const d of updates) {
    const prev = byId.get(d.documentId);
    if (!prev || d.score > prev.score) byId.set(d.documentId, d);
  }
  return [...byId.values()];
}
