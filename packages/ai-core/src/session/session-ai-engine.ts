// ============================================================================
//  Avesia AI Core — Session AI Engine
//
//  The orchestrator for the real-time clinical copilot. For each session:
//
//  1. Receives segment events (new transcript segments).
//  2. Evaluates triggers (via TriggerDetector) — event-driven, not time-based.
//  3. If triggered:
//     a. Loads session memory from Redis (incremental state).
//     b. Retrieves KB context via RAGOrchestrator (if KB exists).
//     c. Builds prompts (memory + new segments + KB context).
//     d. Calls LLM for structured assistance (one call, JSON output).
//     e. Updates session memory with the memory update from the LLM.
//     f. Persists the analysis to the database.
//     g. Publishes the assistance to Redis pub/sub (→ WebSocket → frontend).
//
//  Designed for scalability:
//  - Per-session processing lock (Redis) prevents concurrent cycles.
//  - Incremental: only new segments are sent to the LLM (not full transcript).
//  - KB retrieval is cached in memory (usedConcepts prevents re-retrieval).
//  - One LLM call per cycle produces all assistance + memory update.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { AvesiaAICoreFacade } from '../core/ai-core.js';
import { RAGOrchestrator } from '../retrieval/rag-orchestrator.js';
import { SessionMemoryStore } from './session-memory.js';
import { TriggerDetector, manualTrigger, INTENSITY_CONFIG } from './trigger-detector.js';
import { buildCopilotSystemPrompt, buildCopilotUserPrompt, parseCopilotResponse } from './copilot-prompt.js';
import {
  type SegmentInput,
  type SessionMemory,
  type CopilotSettings,
  type TriggerResult,
  type CopilotCycleResult,
  type CopilotAssistance,
  type AssistanceItem,
  type SessionMemoryUpdate,
  type HypothesisEntry,
  type RelevantDocRef,
} from './types.js';

/** Redis pub/sub channel for copilot updates. */
export function copilotChannel(sessionId: string): string {
  return `session:copilot:${sessionId}`;
}

/** Event published to the channel (consumed by the WebSocket → frontend). */
export interface CopilotEvent {
  readonly type: 'assistance' | 'status' | 'error' | 'settings_update';
  readonly sessionId: string;
  readonly timestamp: number;
  readonly data: unknown;
}

export interface CopilotAssistanceEvent extends CopilotEvent {
  readonly type: 'assistance';
  readonly data: {
    readonly items: readonly AssistanceItem[];
    readonly segmentSeqStart: number;
    readonly segmentSeqEnd: number;
    readonly conceptIds: readonly string[];
    readonly community: number | null;
    readonly tokensUsed: number;
    readonly durationMs: number;
    readonly sufficientContext: boolean;
    readonly contextNote?: string;
  };
}

export interface CopilotStatusEvent extends CopilotEvent {
  readonly type: 'status';
  readonly data: {
    readonly status: 'idle' | 'processing' | 'disabled';
    readonly pendingSegments: number;
  };
}

export interface CopilotErrorEvent extends CopilotEvent {
  readonly type: 'error';
  readonly data: {
    readonly message: string;
    readonly code: string;
  };
}

export class SessionAIEngine {
  private readonly memoryStore: SessionMemoryStore;
  private readonly triggerDetector: TriggerDetector;
  private readonly ragOrchestrator: RAGOrchestrator;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pendingOrgMap = new Map<string, string>(); // sessionId → organizationId

  constructor(
    private readonly ai: AvesiaAICoreFacade,
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {
    this.memoryStore = new SessionMemoryStore(redis);
    this.triggerDetector = new TriggerDetector(ai);
    this.ragOrchestrator = new RAGOrchestrator(ai, prisma);
  }

  /**
   * Start the periodic sweep that checks active sessions for pending segments.
   * This ensures segments that didn't trigger immediately (not enough content,
   * rate limit, etc.) get processed after maxFrequencyMs elapses.
   *
   * Call this once when the API starts (e.g., in the server bootstrap).
   */
  startPeriodicSweep(intervalMs = 20_000): void {
    if (this.sweepTimer) return; // Already running
    this.sweepTimer = setInterval(() => {
      void this.sweepActiveSessions().catch((err) => {
        console.error(JSON.stringify({
          level: 'error', component: 'SessionAIEngine', step: 'sweep_error',
          error: err instanceof Error ? err.message : 'unknown',
        }));
      });
    }, intervalMs);
    console.log(JSON.stringify({
      level: 'info', component: 'SessionAIEngine',
      msg: `Periodic sweep started (interval: ${intervalMs}ms)`,
    }));
  }

  /** Stop the periodic sweep (e.g., on graceful shutdown). */
  stopPeriodicSweep(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Check all active sessions for pending segments and process if warranted.
   * This is the "time-based fallback" — if segments were added but didn't
   * trigger immediately, this sweep will pick them up after maxFrequencyMs.
   */
  private async sweepActiveSessions(): Promise<void> {
    const sessionIds = await this.memoryStore.getActiveSessions();
    if (sessionIds.length === 0) return;

    for (const sessionId of sessionIds) {
      const organizationId = this.pendingOrgMap.get(sessionId);
      if (!organizationId) continue; // Don't know the org — skip

      try {
        const settings = await this.memoryStore.getSettings(sessionId);
        if (!settings.enabled || !settings.autoGenerate) {
          await this.memoryStore.markSessionInactive(sessionId);
          this.pendingOrgMap.delete(sessionId);
          continue;
        }

        const allSegments = await this.loadSegments(sessionId);
        const memory = await this.memoryStore.getMemory(sessionId);
        const pendingSegments = allSegments.filter((s) => s.sequence > memory.lastProcessedSeq);

        if (pendingSegments.length === 0) {
          // No pending segments — remove from active set.
          await this.memoryStore.markSessionInactive(sessionId);
          this.pendingOrgMap.delete(sessionId);
          continue;
        }

        // Re-evaluate triggers — the rate limit may have elapsed by now.
        const trigger = await this.triggerDetector.evaluate(allSegments, memory, settings, Date.now());

        if (trigger.shouldProcess) {
          await this.processCycle(sessionId, organizationId, trigger, settings, allSegments, memory);
        }
      } catch (err) {
        console.warn(JSON.stringify({
          level: 'warn', component: 'SessionAIEngine', step: 'sweep_session_failed',
          sessionId, error: err instanceof Error ? err.message : 'unknown',
        }));
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Called when a new transcript segment is created. Evaluates triggers and
   * processes if warranted. Non-blocking — returns immediately after evaluation.
   */
  async onSegmentCreated(
    sessionId: string,
    organizationId: string,
    segment: SegmentInput,
  ): Promise<void> {
    const settings = await this.memoryStore.getSettings(sessionId);
    if (!settings.enabled || !settings.autoGenerate) return;

    // Track this session as active (for the periodic sweep) and store the orgId.
    this.pendingOrgMap.set(sessionId, organizationId);
    await this.memoryStore.markSessionActive(sessionId);

    // Load all segments (needed for trigger evaluation and processing).
    const allSegments = await this.loadSegments(sessionId);
    const memory = await this.memoryStore.getMemory(sessionId);

    const trigger = await this.triggerDetector.evaluate(allSegments, memory, settings, Date.now());

    if (trigger.shouldProcess) {
      await this.processCycle(sessionId, organizationId, trigger, settings, allSegments, memory);
      // After processing, check if there are still pending segments.
      const updatedMemory = await this.memoryStore.getMemory(sessionId);
      const stillPending = allSegments.filter((s) => s.sequence > updatedMemory.lastProcessedSeq);
      if (stillPending.length === 0) {
        await this.memoryStore.markSessionInactive(sessionId);
        this.pendingOrgMap.delete(sessionId);
      }
    } else {
      // Publish idle status so the frontend knows the copilot is aware but waiting.
      await this.publishStatus(sessionId, 'idle', trigger.pendingSegments.length);
    }
  }

  /**
   * Manually trigger a processing cycle (professional clicks "Gerar Parecer").
   * Bypasses auto-detection but respects a minimal rate limit.
   */
  async processManually(
    sessionId: string,
    organizationId: string,
  ): Promise<CopilotCycleResult | null> {
    const settings = await this.memoryStore.getSettings(sessionId);
    const allSegments = await this.loadSegments(sessionId);
    const memory = await this.memoryStore.getMemory(sessionId);

    const trigger = manualTrigger(allSegments, memory, settings, Date.now());
    if (!trigger.shouldProcess) return null;

    return this.processCycle(sessionId, organizationId, trigger, settings, allSegments, memory);
  }

  /** Get the organizationId for a session (used by the sweep). */
  getOrganizationForSession(sessionId: string): string | undefined {
    return this.pendingOrgMap.get(sessionId);
  }

  /** Register a session→org mapping (for the periodic sweep). */
  registerSessionOrg(sessionId: string, organizationId: string): void {
    this.pendingOrgMap.set(sessionId, organizationId);
  }

  /** Update copilot settings for a session. */
  async updateSettings(sessionId: string, settings: Partial<CopilotSettings>): Promise<CopilotSettings> {
    const current = await this.memoryStore.getSettings(sessionId);
    const updated = { ...current, ...settings };
    await this.memoryStore.setSettings(sessionId, updated);
    await this.publishEvent(sessionId, {
      type: 'settings_update',
      sessionId,
      timestamp: Date.now(),
      data: updated,
    });
    return updated;
  }

  /** Get current settings. */
  async getSettings(sessionId: string): Promise<CopilotSettings> {
    return this.memoryStore.getSettings(sessionId);
  }

  /** Clear session memory (e.g., when session ends or is reset). */
  async clearSession(sessionId: string): Promise<void> {
    await this.memoryStore.clearMemory(sessionId);
  }

  // ── Core processing cycle ────────────────────────────────────────────────

  private async processCycle(
    sessionId: string,
    organizationId: string,
    trigger: TriggerResult,
    settings: CopilotSettings,
    allSegments: readonly SegmentInput[],
    memory: SessionMemory,
  ): Promise<CopilotCycleResult> {
    const startTime = Date.now();

    // Acquire processing lock to prevent concurrent cycles.
    const locked = await this.memoryStore.acquireProcessingLock(sessionId);
    if (!locked) {
      console.log(JSON.stringify({
        level: 'info', component: 'SessionAIEngine',
        sessionId, msg: 'Processing lock busy — skipping cycle',
      }));
      // Another cycle is running; skip.
      return this.nullResult(memory, trigger);
    }

    try {
      await this.publishStatus(sessionId, 'processing', trigger.pendingSegments.length);

      const pendingSegments = trigger.pendingSegments;
      const seqStart = pendingSegments[0]?.sequence ?? memory.lastProcessedSeq;
      const seqEnd = pendingSegments[pendingSegments.length - 1]?.sequence ?? memory.lastProcessedSeq;

      // 1. Retrieve KB context (if a KB exists for this org).
      const kbContext = await this.retrieveKbContext(organizationId, sessionId, pendingSegments, memory);

      // 2. Build prompts.
      const config = INTENSITY_CONFIG[settings.intensity];
      const hasKbContext = Boolean(kbContext?.text);
      const systemPrompt = buildCopilotSystemPrompt(settings, config, hasKbContext);
      const userPrompt = buildCopilotUserPrompt(memory, pendingSegments, kbContext?.text ?? null, allSegments.length);

      console.log(JSON.stringify({
        level: 'info', component: 'SessionAIEngine', step: 'generate',
        sessionId, triggerReason: trigger.reason,
        pendingSegments: pendingSegments.length, pendingTokens: trigger.pendingTokens,
        hasKbContext, systemPromptTokens: Math.ceil(systemPrompt.length / 4),
        userPromptTokens: Math.ceil(userPrompt.length / 4),
      }));

      // 3. Call LLM for structured assistance.
      const result = await this.ai.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { capability: 'complex', temperature: 0.3 },
      );

      // 4. Parse the response.
      const parsed = parseCopilotResponse(result.content);

      // 5. Update memory.
      const newTopicEmbedding = await this.triggerDetector.computeTopicEmbedding(pendingSegments);
      const updatedMemory: SessionMemory = {
        contextSummary: memory.contextSummary, // LLM doesn't update this directly
        themes: dedupeStrings([...memory.themes, ...(parsed.memoryUpdate.newThemes ?? [])]).slice(0, 20),
        symptoms: dedupeStrings([...memory.symptoms, ...(parsed.memoryUpdate.newSymptoms ?? [])]).slice(0, 20),
        hypotheses: mergeHypotheses(memory.hypotheses, parsed.memoryUpdate.newHypotheses ?? []).slice(0, 10),
        openQuestions: dedupeStrings([
          ...memory.openQuestions.filter((q) => !(parsed.memoryUpdate.resolvedQuestions ?? []).includes(q)),
          ...(parsed.memoryUpdate.newOpenQuestions ?? []),
        ]).slice(0, 15),
        relevantDocs: mergeDocs(memory.relevantDocs, parsed.memoryUpdate.newRelevantDocs ?? []).slice(0, 20),
        usedConcepts: dedupeStrings([...memory.usedConcepts, ...(parsed.memoryUpdate.newUsedConcepts ?? [])]).slice(0, 30),
        lastProcessedSeq: seqEnd,
        lastProcessedAt: Date.now(),
        lastTopicEmbedding: newTopicEmbedding,
      };
      await this.memoryStore.setMemory(sessionId, updatedMemory);

      // 6. Build the assistance object.
      const assistance: CopilotAssistance = {
        items: parsed.items as readonly AssistanceItem[],
        memoryUpdate: parsed.memoryUpdate as SessionMemoryUpdate,
        sufficientContext: parsed.sufficientContext,
        ...(parsed.contextNote ? { contextNote: parsed.contextNote } : {}),
      };

      const durationMs = Date.now() - startTime;
      const conceptIds = kbContext?.conceptIds ?? [];
      const community = kbContext?.community ?? null;
      const tokensUsed = result.tokensUsed;

      // 7. Persist to database.
      await this.persistAnalysis(sessionId, organizationId, {
        assistance,
        memory: updatedMemory,
        seqStart,
        seqEnd,
        tokensUsed,
        durationMs,
        conceptIds,
        community,
      });

      // 8. Publish to WebSocket via Redis pub/sub.
      const eventData: {
        items: readonly AssistanceItem[];
        segmentSeqStart: number;
        segmentSeqEnd: number;
        conceptIds: readonly string[];
        community: number | null;
        tokensUsed: number;
        durationMs: number;
        sufficientContext: boolean;
        contextNote?: string;
      } = {
        items: assistance.items,
        segmentSeqStart: seqStart,
        segmentSeqEnd: seqEnd,
        conceptIds,
        community,
        tokensUsed,
        durationMs,
        sufficientContext: assistance.sufficientContext,
      };
      if (assistance.contextNote) eventData.contextNote = assistance.contextNote;

      const event: CopilotAssistanceEvent = {
        type: 'assistance',
        sessionId,
        timestamp: Date.now(),
        data: eventData,
      };
      await this.publishEvent(sessionId, event);

      console.log(JSON.stringify({
        level: 'info', component: 'SessionAIEngine', step: 'done',
        sessionId, itemsCount: assistance.items.length,
        tokensUsed, durationMs,
        conceptIds: conceptIds.length, community,
      }));

      return {
        assistance,
        memory: updatedMemory,
        segmentSeqStart: seqStart,
        segmentSeqEnd: seqEnd,
        tokensUsed,
        durationMs,
        conceptIds,
        community,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(JSON.stringify({
        level: 'error', component: 'SessionAIEngine', step: 'error',
        sessionId, error: message,
      }));
      await this.publishError(sessionId, message, 'PROCESSING_ERROR');
      throw err;
    } finally {
      await this.memoryStore.releaseProcessingLock(sessionId);
    }
  }

  // ── KB retrieval (with memory-aware caching) ─────────────────────────────

  private async retrieveKbContext(
    organizationId: string,
    sessionId: string,
    pendingSegments: readonly SegmentInput[],
    memory: SessionMemory,
  ): Promise<{ text: string; conceptIds: readonly string[]; community: number | null } | null> {
    // Find the org's KB.
    const kb = await this.prisma.knowledgeBase.findFirst({
      where: { organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!kb) return null;

    // Build a retrieval query from the pending segments.
    const query = pendingSegments
      .slice(-6)
      .map((s) => s.text)
      .join(' ')
      .slice(0, 500);

    if (!query.trim()) return null;

    try {
      const { retrieval } = await this.ragOrchestrator.retrieve(
        organizationId,
        query,
        {
          knowledgeBaseId: kb.id,
          limit: 4,
          maxTokens: 800,
          rewriteQuery: true,
        },
      );

      return {
        text: retrieval.context.text,
        conceptIds: retrieval.conceptIds,
        community: retrieval.community,
      };
    } catch (err) {
      console.warn(JSON.stringify({
        level: 'warn', component: 'SessionAIEngine', step: 'kb_retrieval_failed',
        sessionId, error: err instanceof Error ? err.message : 'unknown',
      }));
      return null;
    }
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private async persistAnalysis(
    sessionId: string,
    organizationId: string,
    data: {
      assistance: CopilotAssistance;
      memory: SessionMemory;
      seqStart: number;
      seqEnd: number;
      tokensUsed: number;
      durationMs: number;
      conceptIds: readonly string[];
      community: number | null;
    },
  ): Promise<void> {
    try {
      await this.prisma.sessionCopilotAnalysis.create({
        data: {
          sessionId,
          organizationId,
          segmentSeqStart: data.seqStart,
          segmentSeqEnd: data.seqEnd,
          assistance: JSON.parse(JSON.stringify(data.assistance)) as never,
          memorySnapshot: JSON.parse(JSON.stringify(data.memory)) as never,
          conceptIds: [...data.conceptIds],
          community: data.community,
          tokensUsed: data.tokensUsed,
          durationMs: data.durationMs,
        },
      });
    } catch (err) {
      // Persistence failure shouldn't break the real-time stream.
      console.warn(JSON.stringify({
        level: 'warn', component: 'SessionAIEngine', step: 'persist_failed',
        sessionId, error: err instanceof Error ? err.message : 'unknown',
      }));
    }
  }

  // ── Segment loading ──────────────────────────────────────────────────────

  private async loadSegments(sessionId: string): Promise<SegmentInput[]> {
    const transcript = await this.prisma.transcript.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!transcript) return [];

    const segments = await this.prisma.transcriptSegment.findMany({
      where: { transcriptId: transcript.id },
      orderBy: { sequence: 'asc' },
      select: {
        id: true, sequence: true, speaker: true, text: true,
        startTime: true, endTime: true, createdAt: true,
      },
    });

    return segments.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      speaker: s.speaker as 'THERAPIST' | 'PATIENT' | 'UNKNOWN',
      text: s.text,
      startTime: s.startTime,
      endTime: s.endTime,
      createdAt: s.createdAt.getTime(),
    }));
  }

  // ── Redis pub/sub ────────────────────────────────────────────────────────

  private async publishEvent(sessionId: string, event: CopilotEvent): Promise<void> {
    try {
      await this.redis.publish(copilotChannel(sessionId), JSON.stringify(event));
    } catch (err) {
      console.warn(JSON.stringify({
        level: 'warn', component: 'SessionAIEngine', step: 'publish_failed',
        sessionId, error: err instanceof Error ? err.message : 'unknown',
      }));
    }
  }

  private async publishStatus(sessionId: string, status: 'idle' | 'processing' | 'disabled', pendingCount: number): Promise<void> {
    const event: CopilotStatusEvent = {
      type: 'status',
      sessionId,
      timestamp: Date.now(),
      data: { status, pendingSegments: pendingCount },
    };
    await this.publishEvent(sessionId, event);
  }

  private async publishError(sessionId: string, message: string, code: string): Promise<void> {
    const event: CopilotErrorEvent = {
      type: 'error',
      sessionId,
      timestamp: Date.now(),
      data: { message, code },
    };
    await this.publishEvent(sessionId, event);
  }

  private nullResult(memory: SessionMemory, trigger: TriggerResult): CopilotCycleResult {
    return {
      assistance: { items: [], memoryUpdate: {}, sufficientContext: false, contextNote: 'Lock busy' },
      memory,
      segmentSeqStart: memory.lastProcessedSeq,
      segmentSeqEnd: memory.lastProcessedSeq,
      tokensUsed: 0,
      durationMs: 0,
      conceptIds: [],
      community: null,
    };
  }
}

// ── Helpers (duplicated from session-memory for engine-internal use) ────────

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
  const merged = [...existing];
  for (const update of updates) {
    const idx = merged.findIndex(
      (h) => h.description.toLowerCase() === update.description.toLowerCase(),
    );
    if (idx >= 0) {
      merged[idx] = update;
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
