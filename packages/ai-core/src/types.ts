// ============================================================================
//  Avesia AI Core — Domain Types
//  Provider-agnostic, backend-agnostic types shared across the intelligence
//  pipeline (processing, retrieval, knowledge graph, analysis).
// ============================================================================

/** Entity kinds that can live as nodes in the Knowledge Graph. */
export type EntityType =
  | 'CONCEPT'
  | 'PERSON'
  | 'METHOD'
  | 'DISORDER'
  | 'TECHNIQUE'
  | 'PLACE'
  | 'TERM'
  | 'PROTOCOL'
  | 'ORGANIZATION';

/** Semantic relation kinds between graph nodes. */
export type RelationType =
  | 'RELATED_TO'
  | 'DERIVED_FROM'
  | 'IS_A'
  | 'PART_OF'
  | 'CONTRADICTS'
  | 'SUPPORTS'
  | 'MENTIONS'
  | 'TREATS'
  | 'CAUSES'
  | 'PRECURSOR_OF';

/** Node kind in the persisted graph (mirrors DB sourceType/targetType). */
export type GraphNodeKind = 'TOPIC' | 'CONCEPT' | 'DOCUMENT';

/** A document category produced by the classifier. */
export interface DocumentCategory {
  readonly primary: string;
  readonly secondary: string[];
  readonly confidence: number;
}

/** An entity extracted from a chunk of text (GraphRAG-style). */
export interface ExtractedEntity {
  readonly name: string;
  readonly type: EntityType;
  readonly description: string;
}

/** A relation extracted between two named entities/topics. */
export interface ExtractedRelation {
  readonly sourceName: string;
  readonly sourceType: GraphNodeKind;
  readonly targetName: string;
  readonly targetType: GraphNodeKind;
  readonly relationType: RelationType;
  readonly strength: number;
}

/** Metadata attached to every chunk — travels with it through retrieval. */
export interface ChunkMetadata {
  readonly section: string | null;
  readonly headingPath: readonly string[];
  readonly page: number | null;
  readonly charStart: number;
  readonly charEnd: number;
}

/** A chunk of text produced by the chunker, with its embedding once generated. */
export interface TextChunk {
  readonly content: string;
  readonly index: number;
  readonly tokenCount: number;
  readonly metadata: ChunkMetadata;
  embedding: number[];
}

/** Result of a vector search. */
export interface SearchResult {
  readonly chunkId: string;
  readonly documentId: string;
  readonly content: string;
  readonly score: number;
  readonly metadata: ChunkMetadata | null;
}

/** A graph node as exposed to consumers (API/frontend). */
export interface GraphNode {
  readonly id: string;
  readonly type: GraphNodeKind;
  readonly label: string;
  readonly group: string;
  readonly parentId: string | null;
  readonly path: string | null;
  readonly sourceCount: number | null;
  readonly fileType: string | null;
  readonly community: number | null;
}

/** A graph edge as exposed to consumers. */
export interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourceType: GraphNodeKind;
  readonly targetType: GraphNodeKind;
  readonly type: RelationType;
  readonly strength: number;
}

/** Full graph payload returned by the graph repository. */
export interface GraphData {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** Pipeline stage identifiers — stable across worker/UI. */
export type PipelineStageId =
  | 'extract'
  | 'normalize'
  | 'chunk'
  | 'embed'
  | 'extract-entities'
  | 'build-graph'
  | 'index-vectors'
  | 'summarize'
  | 'classify'
  | 'finalize';

/** A single progress event emitted during pipeline execution. */
export interface PipelineProgressEvent {
  readonly documentId: string;
  readonly knowledgeBaseId: string;
  readonly organizationId: string;
  readonly stage: PipelineStageId;
  readonly stageIndex: number;
  readonly stageTotal: number;
  readonly progress: number; // 0..100 (overall)
  readonly status: 'running' | 'completed' | 'failed';
  readonly message: string;
  readonly timestamp: string;
}

/** Document processing status (mirrors DB allowed values). */
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/** A snapshot of a knowledge document record (subset needed by the core). */
export interface KnowledgeDocumentRecord {
  readonly id: string;
  readonly knowledgeBaseId: string;
  readonly organizationId: string;
  readonly contextDocumentId: string | null;
  readonly originalFileName: string;
  readonly fileType: string;
  readonly storageKey: string | null;
  readonly status: DocumentStatus;
  readonly progress: number;
  readonly errorMessage: string | null;
}

/** A persisted concept record. */
export interface ConceptRecord {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly description: string | null;
  readonly sourceCount: number;
  readonly topicId: string | null;
}

/** A persisted topic record. */
export interface TopicRecord {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly parentId: string | null;
}

/** Result of an AI chat call (mirrors AICoreResult but provider-agnostic). */
export interface AIInvocationResult {
  readonly content: string;
  readonly tokensUsed: number;
  readonly provider: string;
  readonly model: string;
  readonly latencyMs: number;
}
