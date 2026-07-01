// ============================================================================
//  Avesia AI Core — Graph-Augmented Retriever (GraphRAG)
//
//  The key to token economy: instead of searching every chunk in the KB, we
//  use the Knowledge Graph as a map. The shortest path to an answer is:
//
//    query → embed → hybrid search (vector + keyword, RRF)
//           → identify mentioned concepts from seed chunks
//           → find dominant community → expand to community's concepts
//           → fetch chunks linked to those concepts (capped per concept)
//           → rerank by combined score (vector + graph proximity + keyword)
//           → MMR diversification → return minimal context
//
//  This prunes the search space dramatically: a 10k-chunk KB becomes a
//  ~30-chunk subgraph around the relevant community. Fewer tokens in the
//  prompt, faster generation, same or better accuracy.
//
//  Multi-tenant safe: every query is scoped to (organizationId, knowledgeBaseId).
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type { AvesiaAICoreFacade } from '../core/ai-core.js';
import type { SearchResult } from '../types.js';
import { buildContext, type BuiltContext } from './context-builder.js';
import { reciprocalRankFusion } from './retriever.js';

export interface GraphRetrievalOptions {
  readonly knowledgeBaseId: string;
  readonly limit?: number;
  /** Max concepts to expand to (within the same community). */
  readonly maxConceptExpansion?: number;
  /** Max chunks to fetch per expanded concept (controls explosion). */
  readonly maxChunksPerConcept?: number;
  /** Max tokens for the final context. */
  readonly maxTokens?: number;
  /** Whether to include a graph summary header in the context. */
  readonly includeGraphSummary?: boolean;
  /** Weight for vector search in hybrid fusion (0..1). */
  readonly vectorWeight?: number;
  /** Lambda for MMR diversification (0=all relevant, 1=all diverse). */
  readonly mmrLambda?: number;
}

export interface GraphRetrievalResult {
  readonly context: BuiltContext;
  readonly results: readonly SearchResult[];
  readonly conceptIds: readonly string[];
  readonly community: number | null;
  readonly graphSummary: string | null;
}

interface ConceptRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly community: number | null;
  readonly sourceCount: number;
}

interface ChunkRow {
  readonly id: string;
  readonly documentId: string;
  readonly content: string;
  readonly section: string | null;
  readonly headingPath: string[];
  readonly page: number | null;
  readonly charStart: number;
  readonly charEnd: number;
  readonly embedding?: unknown;
}

export class GraphRetriever {
  constructor(
    private readonly ai: AvesiaAICoreFacade,
    private readonly prisma: PrismaClient,
  ) {}

  async retrieve(
    organizationId: string,
    query: string,
    options: GraphRetrievalOptions,
  ): Promise<GraphRetrievalResult> {
    const limit = options.limit ?? 5;
    const maxExpansion = options.maxConceptExpansion ?? 15;
    const maxChunksPerConcept = options.maxChunksPerConcept ?? 8;
    const maxTokens = options.maxTokens ?? 1500;
    const includeSummary = options.includeGraphSummary ?? true;
    const vectorWeight = options.vectorWeight ?? 0.65;
    const mmrLambda = options.mmrLambda ?? 0.6;
    const kbId = options.knowledgeBaseId;

    // 1. Embed the query.
    const embedStart = Date.now();
    const queryEmbedding = await this.ai.embed(query);
    console.log(JSON.stringify({
      level: 'info', component: 'GraphRetriever', step: 'embed',
      kbId, queryPreview: query.slice(0, 80), embedMs: Date.now() - embedStart,
      dims: queryEmbedding.length,
    }));

    // 2. Hybrid search: vector (pgvector ANN) + keyword (ILIKE), fused via RRF.
    const searchStart = Date.now();
    const seedChunks = await this.hybridSearch(
      organizationId, kbId, query, queryEmbedding, limit * 3, vectorWeight,
    );
    console.log(JSON.stringify({
      level: 'info', component: 'GraphRetriever', step: 'hybrid_search',
      kbId, seedChunks: seedChunks.length, searchMs: Date.now() - searchStart,
    }));

    if (seedChunks.length === 0) {
      console.log(JSON.stringify({
        level: 'warn', component: 'GraphRetriever', step: 'no_seeds',
        kbId, msg: 'No seed chunks found — returning empty',
      }));
      return {
        context: { text: '', chunkCount: 0, estimatedTokens: 0 },
        results: [], conceptIds: [], community: null, graphSummary: null,
      };
    }

    // 3. Find which concepts those seed chunks mention (via MENTIONS relations).
    const seedChunkIds = seedChunks.map((c) => c.chunkId);
    const mentionedConcepts = await this.getConceptsForChunks(kbId, seedChunkIds);
    console.log(JSON.stringify({
      level: 'info', component: 'GraphRetriever', step: 'concepts_for_seeds',
      kbId, mentionedConcepts: mentionedConcepts.length,
      conceptNames: mentionedConcepts.slice(0, 8).map((c) => c.name),
    }));

    if (mentionedConcepts.length === 0) {
      console.log(JSON.stringify({
        level: 'info', component: 'GraphRetriever', step: 'no_concepts',
        kbId, msg: 'No graph linkage — falling back to hybrid results only',
      }));
      const context = buildContext(seedChunks, { maxTokens });
      return { context, results: seedChunks, conceptIds: [], community: null, graphSummary: null };
    }

    // 4. Identify the dominant community (the community with most seed concepts).
    const community = this.dominantCommunity(mentionedConcepts);

    // 5. Expand: find all concepts in the same community (the relevant cluster).
    const expandedConcepts = community !== null
      ? await this.getConceptsInCommunity(kbId, community, maxExpansion)
      : mentionedConcepts;
    const expandedConceptIds = new Set(expandedConcepts.map((c) => c.id));
    console.log(JSON.stringify({
      level: 'info', component: 'GraphRetriever', step: 'community_expansion',
      kbId, community, expandedConcepts: expandedConcepts.length,
    }));

    // 6. Find chunks linked to expanded concepts — but cap per concept to
    //    prevent a single high-degree concept from flooding the result set.
    const communityChunkIds = await this.getChunksForConcepts(
      kbId, [...expandedConceptIds], maxChunksPerConcept,
    );
    console.log(JSON.stringify({
      level: 'info', component: 'GraphRetriever', step: 'chunks_for_concepts',
      kbId, communityChunkIds: communityChunkIds.size, maxChunksPerConcept,
    }));

    // 7. Fetch those chunks and score them by vector similarity to the query.
    const communityChunks = await this.fetchChunks(organizationId, communityChunkIds);
    const scored = communityChunks
      .map((c) => {
        const embedding = c.embedding as number[] | null;
        const vecScore = embedding && embedding.length > 0
          ? this.cosine(queryEmbedding, embedding)
          : 0;
        return this.toSearchResult(c, vecScore);
      })
      .sort((a, b) => b.score - a.score);

    // 8. Rerank: combine seed chunks (high precision) with community chunks
    //    (high recall), then apply MMR for diversity.
    const combined = this.mergeAndRerank(seedChunks, scored, limit * 2);
    const diversified = this.mmrDiversify(combined, mmrLambda, limit);
    console.log(JSON.stringify({
      level: 'info', component: 'GraphRetriever', step: 'rerank_mmr',
      kbId, combined: combined.length, diversified: diversified.length,
      topScore: diversified[0]?.score ?? 0,
    }));

    // 9. Build a compact graph summary so the AI knows the neighborhood.
    const graphSummary = includeSummary
      ? this.buildGraphSummary(expandedConcepts, community)
      : null;

    // 10. Assemble the final context (graph summary + chunk snippets).
    const contextText = this.assembleContext(diversified, graphSummary, maxTokens);
    const estimatedTokens = Math.ceil(contextText.length / 4);

    console.log(JSON.stringify({
      level: 'info', component: 'GraphRetriever', step: 'done',
      kbId, finalChunks: diversified.length, estimatedTokens,
      community, conceptIds: expandedConceptIds.size,
    }));

    return {
      context: { text: contextText, chunkCount: diversified.length, estimatedTokens },
      results: diversified,
      conceptIds: [...expandedConceptIds],
      community,
      graphSummary,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Hybrid search: pgvector ANN for semantic + ILIKE for exact terminology.
   * Fuses results via Reciprocal Rank Fusion (RRF).
   */
  private async hybridSearch(
    organizationId: string,
    kbId: string,
    query: string,
    queryEmbedding: number[],
    limit: number,
    vectorWeight: number,
  ): Promise<SearchResult[]> {
    const vecLiteral = `[${[...queryEmbedding].join(',')}]`;

    // Vector search via pgvector ANN (cosine distance <=>).
    const vectorSql = `
      SELECT c.id, c.document_id, c.content, c.section, c.heading_path, c.page,
             c.char_start, c.char_end,
             (c.embedding_vec <=> $1::vector) AS distance
      FROM ai_context_chunks c
      JOIN ai_context_documents d ON d.id = c.document_id
      LEFT JOIN knowledge_documents kd ON kd.context_document_id = d.id
      WHERE d.organization_id = $2
        AND d.status = 'COMPLETED'
        AND kd.knowledge_base_id = $3
      ORDER BY c.embedding_vec <=> $1::vector
      LIMIT $4
    `;
    const vectorRows = await this.prisma.$queryRawUnsafe<Array<{
      id: string; document_id: string; content: string; section: string | null;
      heading_path: string[] | null; page: number | null; char_start: number | null;
      char_end: number | null; distance: number;
    }>>(vectorSql, vecLiteral, organizationId, kbId, limit);

    const vectorResults: SearchResult[] = vectorRows.map((r) => ({
      chunkId: r.id,
      documentId: r.document_id,
      content: r.content,
      score: 1 - Number(r.distance),
      metadata: {
        section: r.section,
        headingPath: r.heading_path ?? [],
        page: r.page,
        charStart: r.char_start ?? 0,
        charEnd: r.char_end ?? 0,
      },
    }));

    // Keyword search via ILIKE (catches exact terminology: "TCC", "DSM-5").
    const terms = query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 3);
    let keywordResults: SearchResult[] = [];
    if (terms.length > 0) {
      const params: unknown[] = [organizationId, kbId];
      const ilikeClauses = terms.map((t) => {
        params.push(`%${t}%`);
        return `c.content ILIKE $${params.length}`;
      });
      params.push(limit);
      const keywordSql = `
        SELECT c.id, c.document_id, c.content, c.section, c.heading_path, c.page,
               c.char_start, c.char_end
        FROM ai_context_chunks c
        JOIN ai_context_documents d ON d.id = c.document_id
        LEFT JOIN knowledge_documents kd ON kd.context_document_id = d.id
        WHERE d.organization_id = $1
          AND d.status = 'COMPLETED'
          AND kd.knowledge_base_id = $2
          AND (${ilikeClauses.join(' OR ')})
        LIMIT $${params.length}
      `;
      const keywordRows = await this.prisma.$queryRawUnsafe<Array<{
        id: string; document_id: string; content: string; section: string | null;
        heading_path: string[] | null; page: number | null; char_start: number | null;
        char_end: number | null;
      }>>(keywordSql, ...params);

      keywordResults = keywordRows.map((r) => ({
        chunkId: r.id,
        documentId: r.document_id,
        content: r.content,
        score: 0.5,
        metadata: {
          section: r.section,
          headingPath: r.heading_path ?? [],
          page: r.page,
          charStart: r.char_start ?? 0,
          charEnd: r.char_end ?? 0,
        },
      }));
    }

    // Fuse via RRF.
    return reciprocalRankFusion(vectorResults, keywordResults, vectorWeight, 60).slice(0, limit);
  }

  private async getConceptsForChunks(kbId: string, chunkIds: readonly string[]): Promise<ConceptRow[]> {
    const chunks = await this.prisma.aIContextChunk.findMany({
      where: { id: { in: [...chunkIds] } },
      select: { documentId: true },
    });
    const documentIds = [...new Set(chunks.map((c) => c.documentId))];

    const relations = await this.prisma.knowledgeRelation.findMany({
      where: {
        knowledgeBaseId: kbId,
        sourceType: 'DOCUMENT',
        sourceId: { in: documentIds },
        targetType: 'CONCEPT',
        relationType: 'MENTIONS',
      },
      select: { targetId: true },
    });

    const conceptIds = [...new Set(relations.map((r) => r.targetId))];
    if (conceptIds.length === 0) return [];

    const concepts = await this.prisma.knowledgeConcept.findMany({
      where: { id: { in: conceptIds } },
      select: { id: true, name: true, type: true, community: true, sourceCount: true },
    });
    return concepts.map((c) => ({
      id: c.id, name: c.name, type: c.type,
      community: c.community, sourceCount: c.sourceCount,
    }));
  }

  private async getConceptsInCommunity(kbId: string, community: number, limit: number): Promise<ConceptRow[]> {
    const concepts = await this.prisma.knowledgeConcept.findMany({
      where: { knowledgeBaseId: kbId, community },
      orderBy: { sourceCount: 'desc' },
      take: limit,
      select: { id: true, name: true, type: true, community: true, sourceCount: true },
    });
    return concepts.map((c) => ({
      id: c.id, name: c.name, type: c.type,
      community: c.community, sourceCount: c.sourceCount,
    }));
  }

  /**
   * Find chunks linked to expanded concepts — capped per concept to prevent
   * a single high-degree concept from flooding the result set.
   */
  private async getChunksForConcepts(
    kbId: string,
    conceptIds: readonly string[],
    maxPerConcept: number,
  ): Promise<Set<string>> {
    const relations = await this.prisma.knowledgeRelation.findMany({
      where: {
        knowledgeBaseId: kbId,
        targetType: 'CONCEPT',
        targetId: { in: [...conceptIds] },
        relationType: 'MENTIONS',
      },
      select: { sourceId: true, targetId: true },
    });

    // Group document IDs by concept, then cap per concept.
    const docsByConcept = new Map<string, string[]>();
    for (const r of relations) {
      const docs = docsByConcept.get(r.targetId) ?? [];
      docs.push(r.sourceId);
      docsByConcept.set(r.targetId, docs);
    }

    const allChunkIds = new Set<string>();
    for (const [, docIds] of docsByConcept) {
      const uniqueDocIds = [...new Set(docIds)].slice(0, maxPerConcept);
      if (uniqueDocIds.length === 0) continue;
      const chunks = await this.prisma.aIContextChunk.findMany({
        where: { documentId: { in: uniqueDocIds } },
        select: { id: true },
        take: maxPerConcept * 3, // a few chunks per document
      });
      for (const c of chunks) allChunkIds.add(c.id);
    }

    return allChunkIds;
  }

  private async fetchChunks(
    organizationId: string,
    chunkIds: Set<string>,
  ): Promise<Array<ChunkRow>> {
    if (chunkIds.size === 0) return [];
    const chunks = await this.prisma.aIContextChunk.findMany({
      where: {
        id: { in: [...chunkIds] },
        document: { organizationId, status: 'COMPLETED' },
      },
      select: {
        id: true, documentId: true, content: true, embedding: true,
        section: true, headingPath: true, page: true, charStart: true, charEnd: true,
      },
    });
    return chunks as unknown as Array<ChunkRow>;
  }

  private dominantCommunity(concepts: readonly ConceptRow[]): number | null {
    const counts = new Map<number, number>();
    for (const c of concepts) {
      if (c.community !== null) {
        counts.set(c.community, (counts.get(c.community) ?? 0) + 1);
      }
    }
    if (counts.size === 0) return null;
    let best = -1;
    let bestCount = 0;
    for (const [comm, count] of counts) {
      if (count > bestCount) {
        best = comm;
        bestCount = count;
      }
    }
    return best >= 0 ? best : null;
  }

  private buildGraphSummary(concepts: readonly ConceptRow[], community: number | null): string {
    const lines: string[] = [];
    if (community !== null) {
      lines.push(`# Cluster de conhecimento #${community}`);
    } else {
      lines.push('# Conceitos relevantes');
    }
    lines.push('');
    const sorted = [...concepts].sort((a, b) => b.sourceCount - a.sourceCount);
    for (const c of sorted.slice(0, 20)) {
      lines.push(`- ${c.name} (${c.type.toLowerCase()}, citado em ${c.sourceCount} doc.)`);
    }
    return lines.join('\n');
  }

  /**
   * Merge seed chunks (high precision from hybrid search) with community
   * chunks (high recall from graph expansion). Deduplicate by chunkId,
   * keeping the higher score.
   */
  private mergeAndRerank(
    seed: readonly SearchResult[],
    community: readonly SearchResult[],
    limit: number,
  ): SearchResult[] {
    const merged = new Map<string, SearchResult>();
    for (const r of seed) {
      merged.set(r.chunkId, r);
    }
    for (const r of community) {
      const existing = merged.get(r.chunkId);
      if (!existing || r.score > existing.score) {
        merged.set(r.chunkId, r);
      }
    }
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Maximal Marginal Relevance (MMR): select chunks that are both relevant
   * to the query AND diverse (low redundancy). Balances relevance vs. novelty.
   *
   * Score = λ * relevance(query) - (1-λ) * max_similarity(selected)
   */
  private mmrDiversify(
    candidates: readonly SearchResult[],
    lambda: number,
    limit: number,
  ): SearchResult[] {
    if (candidates.length <= limit) return [...candidates];

    const selected: SearchResult[] = [candidates[0]!];
    const remaining = [...candidates.slice(1)];

    while (selected.length < limit && remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]!;
        // Relevance: the candidate's original score (similarity to query).
        const relevance = candidate.score;
        // Redundancy: max similarity to any already-selected chunk (by content overlap).
        let maxSim = 0;
        for (const sel of selected) {
          const sim = this.contentSimilarity(candidate.content, sel.content);
          if (sim > maxSim) maxSim = sim;
        }
        const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push(remaining[bestIdx]!);
      remaining.splice(bestIdx, 1);
    }

    return selected;
  }

  /**
   * Lightweight content similarity via Jaccard overlap of word sets.
   * Cheaper than embedding-based similarity and good enough for redundancy detection.
   */
  private contentSimilarity(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const setB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const w of setA) {
      if (setB.has(w)) intersection += 1;
    }
    const union = setA.size + setB.size - intersection;
    return intersection / union;
  }

  private assembleContext(results: readonly SearchResult[], graphSummary: string | null, maxTokens: number): string {
    const maxChars = Math.floor(maxTokens * 4);
    const parts: string[] = [];

    if (graphSummary) {
      parts.push(graphSummary);
      parts.push('---');
    }

    const remaining = maxChars - parts.join('\n').length;
    const chunkCtx = buildContext(results, { maxTokens: Math.floor(remaining / 4) });
    if (chunkCtx.text) parts.push(chunkCtx.text);

    return parts.join('\n\n');
  }

  private toSearchResult(c: ChunkRow, score: number): SearchResult {
    return {
      chunkId: c.id,
      documentId: c.documentId,
      content: c.content,
      score,
      metadata: {
        section: c.section,
        headingPath: (c.headingPath as string[] | null) ?? [],
        page: c.page,
        charStart: c.charStart ?? 0,
        charEnd: c.charEnd ?? 0,
      },
    };
  }

  private cosine(a: readonly number[], b: readonly number[]): number {
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
}
