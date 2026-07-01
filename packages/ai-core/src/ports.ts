// ============================================================================
//  Avesia AI Core — Ports (repository / infrastructure interfaces)
//
//  The intelligence logic (pipeline, retrieval, graph, analysis) depends only
//  on these interfaces, never on Prisma or Redis directly. Concrete adapters
//  live in `./adapters/` and are injected by the consuming application (worker,
//  API, future features). This keeps the core reusable and testable.
// ============================================================================

import type {
  ConceptRecord,
  DocumentStatus,
  ExtractedEntity,
  GraphData,
  KnowledgeDocumentRecord,
  PipelineProgressEvent,
  SearchResult,
  TextChunk,
  TopicRecord,
} from './types.js';

// ── Document repository ─────────────────────────────────────────────────────

export interface DocumentRepository {
  getById(id: string): Promise<KnowledgeDocumentRecord | null>;
  updateStatus(id: string, status: DocumentStatus, progress?: number, errorMessage?: string): Promise<void>;
  updateExtraction(
    id: string,
    data: {
      summary?: string;
      keywords?: string[];
      themes?: string[];
      entities?: unknown;
      categories?: unknown;
      chunkCount?: number;
    },
  ): Promise<void>;
  getKnowledgeBaseId(documentId: string): Promise<string | null>;
}

// ── Graph repository ────────────────────────────────────────────────────────

export interface GraphRepository {
  /** Upsert a concept by (knowledgeBaseId, normalized name, type). Returns the record. */
  upsertConcept(knowledgeBaseId: string, entity: ExtractedEntity): Promise<ConceptRecord>;
  /** Upsert a hierarchical topic by (knowledgeBaseId, name). Returns the record. */
  upsertTopic(knowledgeBaseId: string, name: string, parentName: string | null): Promise<TopicRecord>;
  /** Upsert a relation between two nodes, aggregating strength on conflict. */
  upsertRelation(
    knowledgeBaseId: string,
    source: { type: string; id: string },
    target: { type: string; id: string },
    relationType: string,
    strength: number,
  ): Promise<void>;
  /** Link a document to a topic (idempotent). */
  linkDocumentTopic(documentId: string, topicId: string): Promise<void>;
  /** Link a document to a concept (idempotent), recording provenance. */
  linkDocumentConcept(documentId: string, conceptId: string): Promise<void>;
  /** Attach a community index to a concept (used by community detection). */
  setConceptCommunity(conceptId: string, community: number): Promise<void>;
  /** Read the full graph for a knowledge base. */
  getGraph(knowledgeBaseId: string): Promise<GraphData>;
}

// ── Vector repository ───────────────────────────────────────────────────────

export interface VectorRepository {
  /** Persist chunks (with embeddings) for a document. */
  indexChunks(
    organizationId: string,
    documentId: string,
    chunks: readonly TextChunk[],
  ): Promise<void>;
  /** Search the index for the nearest chunks to a query embedding. */
  search(
    organizationId: string,
    queryEmbedding: readonly number[],
    limit: number,
    filter?: { knowledgeBaseId?: string; documentIds?: readonly string[] },
  ): Promise<SearchResult[]>;
  /** Keyword (lexical) search over chunk content — for hybrid retrieval. */
  keywordSearch(
    organizationId: string,
    query: string,
    limit: number,
    filter?: { knowledgeBaseId?: string; documentIds?: readonly string[] },
  ): Promise<SearchResult[]>;
  /** Remove all chunks for a document. */
  deleteDocument(documentId: string): Promise<void>;
  /** Whether the backing store supports approximate/true ANN (vs brute force). */
  readonly scalable: boolean;
}

// ── Event publisher ─────────────────────────────────────────────────────────

export interface EventPublisher {
  publish(channel: string, event: PipelineProgressEvent): Promise<void>;
}

// ── Channel naming ──────────────────────────────────────────────────────────

/** Stable Redis pub/sub channel for a knowledge base's progress stream. */
export function kbProgressChannel(knowledgeBaseId: string): string {
  return `avesia:kb:${knowledgeBaseId}:progress`;
}
