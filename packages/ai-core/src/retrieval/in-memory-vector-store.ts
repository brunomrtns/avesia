// ============================================================================
//  Avesia AI Core — In-Memory Vector Store (fallback)
//
//  Brute-force cosine similarity over chunks persisted in PostgreSQL. Used when
//  the pgvector extension is not available. Scalable enough for small/medium
//  knowledge bases; for thousands of documents prefer PgvectorVectorStore.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type { VectorRepository } from '../ports.js';
import type { SearchResult, TextChunk } from '../types.js';

export class InMemoryVectorStore implements VectorRepository {
  readonly scalable = false;

  constructor(private readonly prisma: PrismaClient) {}

  async indexChunks(
    _organizationId: string,
    documentId: string,
    chunks: readonly TextChunk[],
  ): Promise<void> {
    await this.prisma.aIContextChunk.createMany({
      data: chunks.map((chunk) => ({
        documentId,
        content: chunk.content,
        embedding: chunk.embedding,
        section: chunk.metadata.section,
        headingPath: [...chunk.metadata.headingPath],
        page: chunk.metadata.page,
        charStart: chunk.metadata.charStart,
        charEnd: chunk.metadata.charEnd,
      })),
    });
  }

  async search(
    organizationId: string,
    queryEmbedding: readonly number[],
    limit: number,
    filter?: { knowledgeBaseId?: string; documentIds?: readonly string[] },
  ): Promise<SearchResult[]> {
    const where: Record<string, unknown> = {
      document: { organizationId, status: 'COMPLETED' },
    };
    if (filter?.documentIds && filter.documentIds.length > 0) {
      where['documentId'] = { in: [...filter.documentIds] };
    }
    if (filter?.knowledgeBaseId) {
      where['document'] = {
        organizationId,
        status: 'COMPLETED',
        knowledgeDocuments: { some: { knowledgeBaseId: filter.knowledgeBaseId } },
      };
    }

    const chunks = await this.prisma.aIContextChunk.findMany({
      where: where as never,
      select: {
        id: true,
        documentId: true,
        content: true,
        embedding: true,
        section: true,
        headingPath: true,
        page: true,
        charStart: true,
        charEnd: true,
      },
    });

    if (chunks.length === 0) return [];

    const query = [...queryEmbedding];

    const mapped: Array<SearchResult | null> = chunks.map((chunk) => {
      const vec = chunk.embedding as number[] | null;
      if (!vec || vec.length === 0) return null;
      const score = cosineSimilarity(query, vec);
      const result: SearchResult = {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        content: chunk.content,
        score,
        metadata: {
          section: chunk.section,
          headingPath: (chunk.headingPath as string[] | null) ?? [],
          page: chunk.page,
          charStart: chunk.charStart ?? 0,
          charEnd: chunk.charEnd ?? 0,
        },
      };
      return result;
    });

    const results: SearchResult[] = mapped
      .filter((r): r is SearchResult => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.prisma.aIContextChunk.deleteMany({ where: { documentId } });
  }

  async keywordSearch(
    organizationId: string,
    query: string,
    limit: number,
    filter?: { knowledgeBaseId?: string; documentIds?: readonly string[] },
  ): Promise<SearchResult[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);
    if (terms.length === 0) return [];

    // Build OR conditions across terms (ILIKE on content).
    const where: Record<string, unknown> = {
      AND: [
        { document: { organizationId, status: 'COMPLETED' } },
        ...(filter?.documentIds && filter.documentIds.length > 0
          ? [{ documentId: { in: [...filter.documentIds] } }]
          : []),
        ...(filter?.knowledgeBaseId
          ? [{ document: { organizationId, status: 'COMPLETED', knowledgeDocuments: { some: { knowledgeBaseId: filter.knowledgeBaseId } } } }]
          : []),
        { OR: terms.map((t) => ({ content: { contains: t, mode: 'insensitive' } })) },
      ],
    };

    const chunks = await this.prisma.aIContextChunk.findMany({
      where: where as never,
      select: {
        id: true,
        documentId: true,
        content: true,
        section: true,
        headingPath: true,
        page: true,
        charStart: true,
        charEnd: true,
      },
      take: limit * 4,
    });

    const lowerTerms = terms;
    const mapped: Array<SearchResult | null> = chunks.map((chunk) => {
      const lower = chunk.content.toLowerCase();
      let hits = 0;
      for (const t of lowerTerms) {
        const occurrences = lower.split(t).length - 1;
        hits += occurrences;
      }
      if (hits === 0) return null;
      const result: SearchResult = {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        content: chunk.content,
        score: Math.min(1, hits / (lowerTerms.length * 3)),
        metadata: {
          section: chunk.section,
          headingPath: (chunk.headingPath as string[] | null) ?? [],
          page: chunk.page,
          charStart: chunk.charStart ?? 0,
          charEnd: chunk.charEnd ?? 0,
        },
      };
      return result;
    });

    const scored: SearchResult[] = mapped
      .filter((r): r is SearchResult => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  return dot / magnitude;
}
