// ============================================================================
//  Avesia AI Core — pgvector Vector Store (scalable)
//
//  Uses the PostgreSQL pgvector extension for true approximate nearest
//  neighbor search (cosine distance via `<=>`). Scales to thousands of
//  documents per organization. Requires `CREATE EXTENSION vector` and a
//  `vector(N)` column on ai_context_chunks (see Prisma migration).
//
//  When pgvector is unavailable, fall back to InMemoryVectorStore.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type { VectorRepository } from '../ports.js';
import type { SearchResult, TextChunk } from '../types.js';

export interface PgvectorOptions {
  /** Vector dimensionality (must match the embedding model). */
  readonly dimensions: number;
}

interface RawSearchRow {
  id: string;
  document_id: string;
  content: string;
  section: string | null;
  heading_path: string[] | null;
  page: number | null;
  char_start: number | null;
  char_end: number | null;
  distance: number;
}

export class PgvectorVectorStore implements VectorRepository {
  readonly scalable = true;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: PgvectorOptions,
  ) {
    void this.options;
  }

  async indexChunks(
    _organizationId: string,
    documentId: string,
    chunks: readonly TextChunk[],
  ): Promise<void> {
    // Insert chunks with the vector column. Embeddings are cast from text form.
    for (const chunk of chunks) {
      const vecLiteral = `[${chunk.embedding.join(',')}]`;
      await this.prisma.$executeRaw`
        INSERT INTO ai_context_chunks
          (id, document_id, content, embedding, embedding_vec, section, heading_path, page, char_start, char_end, created_at)
        VALUES
          (gen_random_uuid(), ${documentId}, ${chunk.content}, ${chunk.embedding}::float8[],
           ${vecLiteral}::vector, ${chunk.metadata.section}, ${JSON.stringify(chunk.metadata.headingPath)}::jsonb,
           ${chunk.metadata.page}, ${chunk.metadata.charStart}, ${chunk.metadata.charEnd}, now())
      `;
    }
  }

  async search(
    organizationId: string,
    queryEmbedding: readonly number[],
    limit: number,
    filter?: { knowledgeBaseId?: string; documentIds?: readonly string[] },
  ): Promise<SearchResult[]> {
    const vecLiteral = `[${[...queryEmbedding].join(',')}]`;

    // Build a parameterized query with dynamic WHERE clauses.
    const params: unknown[] = [vecLiteral, organizationId, vecLiteral, limit];
    // params index: 1=vec (select+order), 2=org, 3=vec (order), 4=limit

    let kbClause = '';
    if (filter?.knowledgeBaseId) {
      params.push(filter.knowledgeBaseId);
      kbClause = ` AND kd.knowledge_base_id = $${params.length}`;
    }

    let docClause = '';
    if (filter?.documentIds && filter.documentIds.length > 0) {
      const placeholders = filter.documentIds.map((id) => {
        params.push(id);
        return `$${params.length}`;
      });
      docClause = ` AND c.document_id IN (${placeholders.join(',')})`;
    }

    const sql = `
      SELECT c.id, c.document_id, c.content, c.section, c.heading_path, c.page,
             c.char_start, c.char_end,
             (c.embedding_vec <=> $1::vector) AS distance
      FROM ai_context_chunks c
      JOIN ai_context_documents d ON d.id = c.document_id
      LEFT JOIN knowledge_documents kd ON kd.context_document_id = d.id
      WHERE d.organization_id = $2
        AND d.status = 'COMPLETED'
        ${kbClause}
        ${docClause}
      ORDER BY c.embedding_vec <=> $3::vector
      LIMIT $4
    `;

    const rows = await this.prisma.$queryRawUnsafe<RawSearchRow[]>(sql, ...params);

    return rows.map((row) => ({
      chunkId: row.id,
      documentId: row.document_id,
      content: row.content,
      score: 1 - Number(row.distance),
      metadata: {
        section: row.section,
        headingPath: row.heading_path ?? [],
        page: row.page,
        charStart: row.char_start ?? 0,
        charEnd: row.char_end ?? 0,
      },
    }));
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

    const params: unknown[] = [organizationId];
    const ilikeClauses = terms.map((t) => {
      params.push(`%${t}%`);
      return `c.content ILIKE $${params.length}`;
    });

    let kbClause = '';
    if (filter?.knowledgeBaseId) {
      params.push(filter.knowledgeBaseId);
      kbClause = ` AND kd.knowledge_base_id = $${params.length}`;
    }
    let docClause = '';
    if (filter?.documentIds && filter.documentIds.length > 0) {
      const placeholders = filter.documentIds.map((id) => {
        params.push(id);
        return `$${params.length}`;
      });
      docClause = ` AND c.document_id IN (${placeholders.join(',')})`;
    }

    params.push(limit);
    const sql = `
      SELECT c.id, c.document_id, c.content, c.section, c.heading_path, c.page,
             c.char_start, c.char_end
      FROM ai_context_chunks c
      JOIN ai_context_documents d ON d.id = c.document_id
      LEFT JOIN knowledge_documents kd ON kd.context_document_id = d.id
      WHERE d.organization_id = $1
        AND d.status = 'COMPLETED'
        AND (${ilikeClauses.join(' OR ')})
        ${kbClause}
        ${docClause}
      LIMIT $${params.length}
    `;

    const rows = await this.prisma.$queryRawUnsafe<RawSearchRow[]>(sql, ...params);
    const lowerTerms = terms;

    return rows
      .map((row) => {
        const lower = row.content.toLowerCase();
        let hits = 0;
        for (const t of lowerTerms) {
          hits += lower.split(t).length - 1;
        }
        return {
          chunkId: row.id,
          documentId: row.document_id,
          content: row.content,
          score: Math.min(1, hits / (lowerTerms.length * 3)),
          metadata: {
            section: row.section,
            headingPath: row.heading_path ?? [],
            page: row.page,
            charStart: row.char_start ?? 0,
            charEnd: row.char_end ?? 0,
          },
        };
      })
      .sort((a, b) => b.score - a.score);
  }
}
