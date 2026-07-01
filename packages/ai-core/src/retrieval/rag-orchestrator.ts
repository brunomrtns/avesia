// ============================================================================
//  Avesia AI Core — RAG Orchestrator
//
//  Unifies the full Retrieval-Augmented Generation flow:
//    1. Query rewriting (optional LLM call to reformulate for better retrieval)
//    2. Graph retrieval (hybrid search + graph expansion + MMR diversification)
//    3. Context compression (remove redundancy, respect token budget)
//    4. Generation (LLM call with graph-aware system prompt + context)
//    5. Source attribution (chunk IDs, document IDs, sections, scores)
//
//  This is the single entry point for "answer from the knowledge base" and
//  "assist the clinical session with KB context". Both the KB query endpoint
//  and the session insights endpoint go through here.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type { AvesiaAICoreFacade } from '../core/ai-core.js';
import type { AIInvocationResult, SearchResult } from '../types.js';
import { buildKnowledgeGraphSystemPrompt } from '../analysis/knowledge-graph-instructions.js';
import { QUERY_REWRITE_PROMPT } from '../analysis/clinical-prompts.js';
import { GraphRetriever, type GraphRetrievalOptions, type GraphRetrievalResult } from './graph-retriever.js';
import { buildContext } from './context-builder.js';

export interface RAGQueryOptions {
  readonly knowledgeBaseId: string;
  /** Max chunks to retrieve and send to the LLM. */
  readonly limit?: number;
  /** Max tokens for the context portion of the prompt. */
  readonly maxTokens?: number;
  /** Whether to rewrite the query before retrieval (extra LLM call). */
  readonly rewriteQuery?: boolean;
  /** System prompt fragment to prepend (e.g. clinical copilot instructions). */
  readonly systemPromptPrefix?: string;
  /** Capability level for the generation call ('simple' | 'complex'). */
  readonly capability?: 'simple' | 'complex';
  /** Temperature for generation. */
  readonly temperature?: number;
}

export interface RAGSource {
  readonly chunkId: string;
  readonly documentId: string;
  readonly section: string | null;
  readonly headingPath: readonly string[];
  readonly score: number;
}

export interface RAGResult {
  readonly answer: string;
  readonly sources: readonly RAGSource[];
  readonly conceptIds: readonly string[];
  readonly community: number | null;
  readonly graphSummary: string | null;
  readonly retrieval: GraphRetrievalResult;
  readonly generation: AIInvocationResult;
  /** The rewritten query if rewriting was enabled, else the original. */
  readonly effectiveQuery: string;
}

export class RAGOrchestrator {
  private readonly graphRetriever: GraphRetriever;

  constructor(
    private readonly ai: AvesiaAICoreFacade,
    prisma: PrismaClient,
  ) {
    this.graphRetriever = new GraphRetriever(ai, prisma);
  }

  async query(organizationId: string, query: string, options: RAGQueryOptions): Promise<RAGResult> {
    const rewrite = options.rewriteQuery ?? false;
    const capability = options.capability ?? 'complex';
    const temperature = options.temperature ?? 0.3;

    // 1. Optionally rewrite the query for better retrieval.
    const effectiveQuery = rewrite
      ? await this.rewriteQuery(query)
      : query;

    // 2. Retrieve relevant context via GraphRAG.
    const retrievalOptions: GraphRetrievalOptions = {
      knowledgeBaseId: options.knowledgeBaseId,
      limit: options.limit ?? 6,
      maxTokens: options.maxTokens ?? 1500,
    };
    const retrieval = await this.graphRetriever.retrieve(organizationId, effectiveQuery, retrievalOptions);

    // 3. Build the system prompt (graph instructions + optional prefix).
    const systemParts: string[] = [];
    if (options.systemPromptPrefix) {
      systemParts.push(options.systemPromptPrefix);
      systemParts.push('');
    }
    systemParts.push(buildKnowledgeGraphSystemPrompt(retrieval.graphSummary));
    const systemPrompt = systemParts.join('\n');

    // 4. Build the user prompt with the retrieved context.
    const userPrompt = this.buildUserPrompt(effectiveQuery, retrieval.context.text);

    // 5. Generate the answer.
    const generation = await this.ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { capability, temperature },
    );

    // 6. Extract source attribution from retrieval results.
    const sources = retrieval.results.map((r) => this.toSource(r));

    return {
      answer: generation.content,
      sources,
      conceptIds: retrieval.conceptIds,
      community: retrieval.community,
      graphSummary: retrieval.graphSummary,
      retrieval,
      generation,
      effectiveQuery,
    };
  }

  /**
   * Retrieve context without generating an answer. Useful when the caller
   * wants to build its own prompt (e.g. session insights with transcript).
   */
  async retrieve(organizationId: string, query: string, options: RAGQueryOptions): Promise<{
    retrieval: GraphRetrievalResult;
    sources: readonly RAGSource[];
    effectiveQuery: string;
  }> {
    const rewrite = options.rewriteQuery ?? false;
    const effectiveQuery = rewrite ? await this.rewriteQuery(query) : query;

    const retrieval = await this.graphRetriever.retrieve(organizationId, effectiveQuery, {
      knowledgeBaseId: options.knowledgeBaseId,
      limit: options.limit ?? 6,
      maxTokens: options.maxTokens ?? 1500,
    });

    const sources = retrieval.results.map((r) => this.toSource(r));
    return { retrieval, sources, effectiveQuery };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Rewrite a natural-language query into a retrieval-optimized form.
   * Removes filler words, normalizes terminology, and expands abbreviations
   * that the embedding model might not understand.
   */
  private async rewriteQuery(query: string): Promise<string> {
    // Only rewrite if the query is long enough to benefit.
    if (query.trim().length < 10) return query;

    try {
      const result = await this.ai.chat(
        [
          { role: 'system', content: QUERY_REWRITE_PROMPT },
          { role: 'user', content: query },
        ],
        { capability: 'simple', temperature: 0.0 },
      );
      const rewritten = result.content.trim();
      // Safety: if the rewrite is empty or way too long, fall back to original.
      if (rewritten.length === 0 || rewritten.length > query.length * 3) {
        return query;
      }
      return rewritten;
    } catch {
      // If rewriting fails (provider error), fall back to original query.
      return query;
    }
  }

  private buildUserPrompt(query: string, context: string): string {
    if (!context.trim()) {
      return `Pergunta: ${query}\n\nObservação: Não há documentos na base de conhecimento que correspondam a esta pergunta. Responda com base em conhecimento geral, indicando que a base não contém informações específicas.`;
    }
    return `Pergunta: ${query}\n\nContexto da base de conhecimento:\n${context}`;
  }

  private toSource(r: SearchResult): RAGSource {
    return {
      chunkId: r.chunkId,
      documentId: r.documentId,
      section: r.metadata?.section ?? null,
      headingPath: r.metadata?.headingPath ?? [],
      score: r.score,
    };
  }
}
