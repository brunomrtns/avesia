// ============================================================================
//  Avesia AI Core — Public API
//
//  Single entry point for the Avesia intelligence module. The ingestion
//  pipeline (extract, chunk, embed, entity-extract, graph-build, summarize,
//  classify) is handled by the Python Celery worker (apps/worker-python).
//  This package retains only the retrieval layer, AI facade, and graph
//  instructions used by the API for GraphRAG queries.
// ============================================================================

// ── Types & ports ───────────────────────────────────────────────────────────
export type {
  AIInvocationResult,
  ChunkMetadata,
  ConceptRecord,
  DocumentCategory,
  DocumentStatus,
  EntityType,
  ExtractedEntity,
  ExtractedRelation,
  GraphData,
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  KnowledgeDocumentRecord,
  PipelineProgressEvent,
  PipelineStageId,
  RelationType,
  SearchResult,
  TextChunk,
  TopicRecord,
} from './types.js';

export type {
  DocumentRepository,
  EventPublisher,
  GraphRepository,
  VectorRepository,
} from './ports.js';
export { kbProgressChannel } from './ports.js';

// ── AI facade ───────────────────────────────────────────────────────────────
export { AvesiaAICoreFacade } from './core/ai-core.js';
export type { AICoreOptions } from './core/ai-core.js';

// ── Retrieval ───────────────────────────────────────────────────────────────
export { InMemoryVectorStore, cosineSimilarity } from './retrieval/in-memory-vector-store.js';
export { PgvectorVectorStore } from './retrieval/pgvector-store.js';
export type { PgvectorOptions } from './retrieval/pgvector-store.js';
export { HybridRetriever, reciprocalRankFusion } from './retrieval/retriever.js';
export type { RetrievalOptions, RetrievalResult } from './retrieval/retriever.js';
export { GraphRetriever } from './retrieval/graph-retriever.js';
export type { GraphRetrievalOptions, GraphRetrievalResult } from './retrieval/graph-retriever.js';
export { buildContext } from './retrieval/context-builder.js';
export type { BuildContextOptions, BuiltContext } from './retrieval/context-builder.js';
export { RAGOrchestrator } from './retrieval/rag-orchestrator.js';
export type { RAGQueryOptions, RAGResult, RAGSource } from './retrieval/rag-orchestrator.js';

// ── Knowledge graph instructions ────────────────────────────────────────────
export {
  KNOWLEDGE_GRAPH_INSTRUCTIONS,
  buildKnowledgeGraphSystemPrompt,
} from './analysis/knowledge-graph-instructions.js';

// ── Clinical prompts ────────────────────────────────────────────────────────
export {
  SESSION_COPILOT_PROMPT,
  SESSION_COPILOT_NO_KB_PROMPT,
  QUERY_REWRITE_PROMPT,
  CLINICAL_ANALYSIS_PROMPT,
  SOAP_NOTE_PROMPT,
  SESSION_SUMMARY_PROMPT,
  DIARIZATION_PROMPT,
} from './analysis/clinical-prompts.js';

// ── Session copilot (real-time clinical assistant) ──────────────────────────
export { SessionAIEngine, copilotChannel } from './session/session-ai-engine.js';
export type { CopilotEvent, CopilotAssistanceEvent, CopilotStatusEvent, CopilotErrorEvent } from './session/session-ai-engine.js';
export { SessionMemoryStore } from './session/session-memory.js';
export { TriggerDetector, manualTrigger, INTENSITY_CONFIG } from './session/trigger-detector.js';
export type { IntensityThresholds } from './session/trigger-detector.js';
export { buildCopilotSystemPrompt, buildCopilotUserPrompt, parseCopilotResponse } from './session/copilot-prompt.js';
export type {
  AssistanceType,
  Confidence,
  AssistanceItem,
  CopilotAssistance,
  SessionMemory,
  SessionMemoryUpdate,
  HypothesisEntry,
  RelevantDocRef,
  CopilotSettings,
  CopilotIntensity,
  SegmentInput,
  TriggerReason,
  TriggerResult,
  CopilotCycleResult,
  emptyMemory,
  defaultSettings,
} from './session/types.js';

// ── Adapters (Prisma) ───────────────────────────────────────────────────────
export { PrismaGraphRepository } from './adapters/prisma-graph-repository.js';
