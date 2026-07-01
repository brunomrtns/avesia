// ============================================================================
//  Avesia AI Core — AI Facade
//
//  Thin wrapper around the existing @avesia/ai-providers AvesiaAICore that:
//  - registers all internal prompt templates,
//  - exposes typed, provider-agnostic operations (chat, embed, structured JSON),
//  - centralizes the embedding model used across the pipeline.
//
//  No intelligence logic talks to a provider directly — it goes through here,
//  so swapping the configured provider (Ollama / OpenRouter / NVIDIA NIM) never
//  requires changes in the pipeline, retrieval, or graph code.
// ============================================================================

import {
  AvesiaAICore as ProviderAICore,
  type AIProvider,
  type PromptTemplate,
  createProvider,
  type ProviderConfig,
} from '@avesia/ai-providers';

import type { AIInvocationResult } from '../types.js';
import { Semaphore } from './semaphore.js';

export interface AICoreOptions {
  /** Embedding model identifier passed to the provider. */
  readonly embedModel?: string;
  /** Extra templates to register beyond the built-in ones. */
  readonly extraTemplates?: readonly PromptTemplate[];
  /**
   * Provider config for embeddings. If set, embeddings go directly to this
   * provider instead of through the router (which may fall back to Ollama).
   */
  readonly embedProviderConfig?: ProviderConfig;
}

export class AvesiaAICoreFacade {
  private readonly inner: ProviderAICore;
  private readonly embedModel: string;
  /** Direct provider for embeddings (bypasses router fallback). */
  private readonly embedProvider: AIProvider | null;
  /** Serializes embedding requests to prevent Ollama runner crashes. */
  private readonly embedSemaphore: Semaphore;

  constructor(inner?: ProviderAICore, options?: AICoreOptions) {
    this.inner = inner ?? new ProviderAICore();
    this.embedModel = options?.embedModel ?? 'nomic-embed-text';
    this.embedProvider = options?.embedProviderConfig
      ? createProvider(options.embedProviderConfig)
      : null;
    this.embedSemaphore = new Semaphore(1);

    const all = [...(options?.extraTemplates ?? [])];
    this.inner.registerTemplates([...all]);
  }

  /** Access the underlying provider router (for health checks / metrics). */
  getInner(): ProviderAICore {
    return this.inner;
  }

  /** Resolve the active provider (used for embeddings). */
  getProvider(): AIProvider {
    return this.inner.getRouter().getProvider();
  }

  getEmbedModel(): string {
    return this.embedModel;
  }

  /** Free-form chat using a registered template name. */
  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { template?: string; temperature?: number; maxTokens?: number; capability?: 'simple' | 'complex' },
  ): Promise<AIInvocationResult> {
    const r = await this.inner.chat(messages, options);
    return r;
  }

  /** Generate an embedding vector for a single text. */
  async embed(text: string): Promise<number[]> {
    // Use the active provider directly (not the router's fallback logic).
    // The router prioritizes Ollama for "simple" tasks when the local worker
    // is online, but that causes embedding failures when Ollama's runner
    // crashes. Embeddings should always go to the configured provider.
    const provider = this.embedProvider ?? this.inner.getRouter().getProvider();
    return this.embedSemaphore.run(() =>
      this.embedWithRetry(() => provider.embed(text, this.embedModel)),
    );
  }

  /** Generate embeddings for many texts (sequential to respect provider limits). */
  async embedBatch(texts: readonly string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const t of texts) {
      out.push(await this.embed(t));
    }
    return out;
  }

  private async embedWithRetry(fn: () => Promise<number[]>, maxRetries = 3): Promise<number[]> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s — gives Ollama's runner time to
          // recover from a crash/restart.
          const delayMs = 1000 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError;
  }

  /** Chat expecting a strict-JSON response. Strips markdown fences and parses. */
  async chatJson<T>(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { template?: string; temperature?: number; maxTokens?: number; capability?: 'simple' | 'complex' },
  ): Promise<T> {
    const result = await this.chat(messages, options);
    return parseJsonFromResponse<T>(result.content);
  }
}

/**
 * Robustly extract JSON from an LLM response. Handles:
 * - Pure JSON
 * - JSON wrapped in ```json ... ``` fences
 * - JSON preceded/followed by explanatory text (finds the first { or [)
 */
function parseJsonFromResponse<T>(content: string): T {
  // Strip markdown code fences.
  const fenced = content.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();

  // Fast path: direct parse.
  try {
    return JSON.parse(fenced) as T;
  } catch {
    // Fall through to extraction.
  }

  // Slow path: find the first JSON object or array in the text.
  const start = fenced.search(/[{[]/);
  if (start === -1) {
    throw new SyntaxError('No JSON object or array found in LLM response');
  }

  // Track nesting depth to find the matching close.
  const open = fenced[start]!;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < fenced.length; i++) {
    const ch = fenced[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const jsonStr = fenced.slice(start, i + 1);
        return JSON.parse(jsonStr) as T;
      }
    }
  }

  throw new SyntaxError('Incomplete JSON in LLM response');
}
