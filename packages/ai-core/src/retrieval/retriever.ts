// ============================================================================
//  Avesia AI Core — Hybrid Retriever
//
//  Combines dense vector search with lexical (keyword) search using weighted
//  reciprocal-rank fusion (RRF). This is the recommended production pattern:
//  vector search catches semantic paraphrase, keyword search catches exact
//  terminology (e.g., "TCC", "DSM-5"). The AI facade provides the query
//  embedding; the VectorRepository provides both search modes.
// ============================================================================

import type { AvesiaAICoreFacade } from '../core/ai-core.js';
import type { VectorRepository } from '../ports.js';
import type { SearchResult } from '../types.js';

export interface RetrievalOptions {
  readonly knowledgeBaseId?: string;
  readonly documentIds?: readonly string[];
  readonly limit?: number;
  /** Weight for vector (semantic) results, 0..1. Lexical weight = 1 - this. */
  readonly vectorWeight?: number;
  /** RRF k constant (smoothing). 60 is the standard value. */
  readonly rrfK?: number;
}

export interface RetrievalResult {
  readonly results: readonly SearchResult[];
  readonly vectorResults: readonly SearchResult[];
  readonly keywordResults: readonly SearchResult[];
}

export class HybridRetriever {
  constructor(
    private readonly ai: AvesiaAICoreFacade,
    private readonly store: VectorRepository,
  ) {}

  async retrieve(organizationId: string, query: string, options?: RetrievalOptions): Promise<RetrievalResult> {
    const limit = options?.limit ?? 5;
    const vectorWeight = options?.vectorWeight ?? 0.6;
    const k = options?.rrfK ?? 60;
    const filter = {
      ...(options?.knowledgeBaseId ? { knowledgeBaseId: options.knowledgeBaseId } : {}),
      ...(options?.documentIds ? { documentIds: options.documentIds } : {}),
    };

    const queryEmbedding = await this.ai.embed(query);

    const [vectorResults, keywordResults] = await Promise.all([
      this.store.search(organizationId, queryEmbedding, limit * 2, filter),
      this.store.keywordSearch(organizationId, query, limit * 2, filter),
    ]);

    const fused = reciprocalRankFusion(vectorResults, keywordResults, vectorWeight, k)
      .slice(0, limit);

    return { results: fused, vectorResults, keywordResults };
  }
}

/**
 * Reciprocal Rank Fusion: score = w * 1/(k+rank_v) + (1-w) * 1/(k+rank_l).
 * Deduplicates by chunkId, keeping the fused score.
 */
export function reciprocalRankFusion(
  vector: readonly SearchResult[],
  lexical: readonly SearchResult[],
  vectorWeight: number,
  k: number,
): SearchResult[] {
  const lexicalWeight = 1 - vectorWeight;
  const fused = new Map<string, { result: SearchResult; score: number }>();

  vector.forEach((r, i) => {
    const score = vectorWeight * (1 / (k + i + 1));
    const existing = fused.get(r.chunkId);
    if (existing) {
      existing.score += score;
    } else {
      fused.set(r.chunkId, { result: r, score });
    }
  });

  lexical.forEach((r, i) => {
    const score = lexicalWeight * (1 / (k + i + 1));
    const existing = fused.get(r.chunkId);
    if (existing) {
      existing.score += score;
    } else {
      fused.set(r.chunkId, { result: r, score });
    }
  });

  return [...fused.values()]
    .map((entry) => ({ ...entry.result, score: entry.score }))
    .sort((a, b) => b.score - a.score);
}
