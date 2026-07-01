// ============================================================================
//  Avesia AI Core — Trigger Detector (event-driven processing)
//
//  Decides WHEN the copilot should process — not on a fixed timer, but based
//  on meaningful conversational events:
//
//  1. Topic change — the conversation shifted to a new subject (embedding
//     similarity between recent and previous topic drops below threshold).
//  2. Pause detected — significant silence between segments (time gap).
//  3. Content threshold — enough new content has accumulated (token/segment
//     count) to warrant a new analysis.
//  4. Manual — the professional explicitly requested analysis.
//  5. Session start — first processing when the session begins.
//
//  The detector also enforces rate limiting (maxFrequencyMs) to prevent
//  excessive LLM calls.
// ============================================================================

import type { AvesiaAICoreFacade } from '../core/ai-core.js';
import type {
  SegmentInput,
  SessionMemory,
  CopilotSettings,
  TriggerResult,
  TriggerReason,
  CopilotIntensity,
} from './types.js';

/** Intensity → threshold mapping. Higher intensity = more sensitive. */
interface IntensityThresholds {
  /** Min tokens in pending segments before processing. */
  minContentTokens: number;
  /** Min segments in pending before processing. */
  minContentSegments: number;
  /** Cosine similarity below which a topic change is detected. */
  topicChangeThreshold: number;
  /** Min gap (ms) between segments to count as a pause. */
  pauseThresholdMs: number;
  /** Max items per cycle (verbosity control). */
  maxItems: number;
}

const INTENSITY_CONFIG: Record<CopilotIntensity, IntensityThresholds> = {
  low: {
    minContentTokens: 300,
    minContentSegments: 6,
    topicChangeThreshold: 0.45,
    pauseThresholdMs: 15_000,
    maxItems: 3,
  },
  medium: {
    minContentTokens: 180,
    minContentSegments: 4,
    topicChangeThreshold: 0.55,
    pauseThresholdMs: 10_000,
    maxItems: 5,
  },
  high: {
    minContentTokens: 100,
    minContentSegments: 2,
    topicChangeThreshold: 0.65,
    pauseThresholdMs: 6_000,
    maxItems: 7,
  },
};

export class TriggerDetector {
  constructor(private readonly ai: AvesiaAICoreFacade) {}

  /**
   * Evaluate whether the copilot should process now, given:
   * @param allSegments - all transcript segments for the session
   * @param memory - current session memory
   * @param settings - copilot settings
   * @param now - current timestamp
   * @returns trigger result with reason and pending segments
   */
  async evaluate(
    allSegments: readonly SegmentInput[],
    memory: SessionMemory,
    settings: CopilotSettings,
    now: number,
  ): Promise<TriggerResult> {
    if (!settings.enabled || !settings.autoGenerate) {
      return { shouldProcess: false, reason: null, pendingSegments: [], pendingTokens: 0 };
    }

    // Find segments that are new since last processing.
    const pendingSegments = allSegments.filter((s) => s.sequence > memory.lastProcessedSeq);

    if (pendingSegments.length === 0) {
      return { shouldProcess: false, reason: null, pendingSegments: [], pendingTokens: 0 };
    }

    const pendingTokens = estimateTokens(pendingSegments.map((s) => s.text).join(' '));
    const config = INTENSITY_CONFIG[settings.intensity];

    // ── Rate limit: enforce maxFrequencyMs ────────────────────────────────
    if (memory.lastProcessedAt > 0) {
      const elapsed = now - memory.lastProcessedAt;
      if (elapsed < settings.maxFrequencyMs) {
        return { shouldProcess: false, reason: null, pendingSegments, pendingTokens };
      }
    }

    // ── Trigger 1: Session start (first ever processing) ──────────────────
    if (memory.lastProcessedSeq === 0 && pendingSegments.length >= 2) {
      return {
        shouldProcess: true,
        reason: 'session_start',
        pendingSegments,
        pendingTokens,
      };
    }

    // ── Trigger 2: Content threshold ──────────────────────────────────────
    if (
      pendingSegments.length >= config.minContentSegments &&
      pendingTokens >= config.minContentTokens
    ) {
      return {
        shouldProcess: true,
        reason: 'content_threshold',
        pendingSegments,
        pendingTokens,
      };
    }

    // ── Trigger 3: Pause detected (time gap between last two segments) ────
    if (pendingSegments.length >= 2) {
      const lastSeg = pendingSegments[pendingSegments.length - 1]!;
      const prevSeg = pendingSegments[pendingSegments.length - 2]!;
      const gap = lastSeg.createdAt - prevSeg.createdAt;
      if (gap >= config.pauseThresholdMs) {
        return {
          shouldProcess: true,
          reason: 'pause_detected',
          pendingSegments,
          pendingTokens,
        };
      }
    }

    // ── Trigger 4: Topic change (embedding similarity drop) ───────────────
    if (pendingSegments.length >= 2 && memory.lastTopicEmbedding) {
      const recentText = pendingSegments
        .slice(-3)
        .map((s) => s.text)
        .join(' ');
      try {
        const recentEmbedding = await this.ai.embed(recentText);
        const similarity = cosineSimilarity(memory.lastTopicEmbedding, recentEmbedding);
        if (similarity < config.topicChangeThreshold) {
          return {
            shouldProcess: true,
            reason: 'topic_change',
            pendingSegments,
            pendingTokens,
          };
        }
      } catch {
        // If embedding fails, skip topic change detection (don't block other triggers).
      }
    }

    return { shouldProcess: false, reason: null, pendingSegments, pendingTokens };
  }

  /** Get intensity config for prompt building / output control. */
  getConfig(intensity: CopilotIntensity): IntensityThresholds {
    return INTENSITY_CONFIG[intensity];
  }

  /** Compute the embedding for the current topic (for next cycle's comparison). */
  async computeTopicEmbedding(segments: readonly SegmentInput[]): Promise<number[] | null> {
    if (segments.length === 0) return null;
    const text = segments
      .slice(-3)
      .map((s) => s.text)
      .join(' ');
    try {
      return await this.ai.embed(text);
    } catch {
      return null;
    }
  }
}

/** Manual trigger — bypasses auto-detection but still respects rate limit. */
export function manualTrigger(
  allSegments: readonly SegmentInput[],
  memory: SessionMemory,
  settings: CopilotSettings,
  now: number,
): TriggerResult {
  const pendingSegments = allSegments.filter((s) => s.sequence > memory.lastProcessedSeq);
  const pendingTokens = estimateTokens(pendingSegments.map((s) => s.text).join(' '));

  // Even manual triggers respect a minimal rate limit (5s) to prevent spam.
  if (memory.lastProcessedAt > 0 && now - memory.lastProcessedAt < 5_000) {
    return { shouldProcess: false, reason: null, pendingSegments, pendingTokens };
  }

  if (pendingSegments.length === 0 && allSegments.length === 0) {
    return { shouldProcess: false, reason: null, pendingSegments: [], pendingTokens: 0 };
  }

  // If no new segments, reprocess the last few (manual refresh).
  const segments = pendingSegments.length > 0 ? pendingSegments : allSegments.slice(-5);

  return {
    shouldProcess: true,
    reason: 'manual',
    pendingSegments: segments,
    pendingTokens: estimateTokens(segments.map((s) => s.text).join(' ')),
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  // Rough estimate: ~1 token per 4 characters for Portuguese.
  return Math.ceil(text.length / 4);
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export { INTENSITY_CONFIG };
export type { IntensityThresholds };
