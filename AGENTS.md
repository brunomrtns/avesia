# Avesia — Agent Guide

## Prerequisites (VPS / dev machine)

The dev environment runs 6+ file watchers simultaneously (tsc --watch + Vite).
Linux's default `inotify.max_user_instances=128` is too low and causes
`EMFILE: too many open files`. `dev.sh` tries to raise it automatically, but
if you don't have passwordless sudo, set it manually once:

```bash
sudo sysctl fs.inotify.max_user_instances=512
# Persist across reboots:
echo 'fs.inotify.max_user_instances=512' | sudo tee /etc/sysctl.d/99-avesia.conf
sudo sysctl --system
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `./dev.sh` | Start full dev environment (infra + migrations + api + web + worker) |
| `pnpm dev` | Start dev servers only (turbo) |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm test` | Run all tests |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed database |

## Architecture

```
packages/
  ai-core/        ← AI intelligence layer (pipeline, graph, retrieval, analysis)
  ai-providers/   ← Provider abstraction (Ollama / OpenRouter / NVIDIA NIM)
  types/          ← Shared TypeScript types
  shared/         ← Constants, helpers (QUEUE_NAMES, etc.)
  config/         ← Shared configs (eslint, tsconfig)

apps/
  api/            ← Fastify REST + WebSocket (port 3100)
  web/            ← React + Vite (port 3101)
  worker-python/  ← Python Celery worker + AI pipeline (health: port 3102)
```

### Python Worker (`apps/worker-python/`)

The background worker is implemented in Python (Celery + Redis) to leverage
Python's NLP/AI ecosystem (spaCy, scikit-learn, sumy, pdfplumber).

**Tech stack:**
- Celery + Redis for task queuing (5 queues: rag-indexing, analysis,
  summarization, notes-generation, transcription)
- SQLAlchemy 2.0 for database access (maps Prisma schema)
- httpx for AI provider REST calls (NVIDIA NIM / OpenRouter / Ollama)
- spaCy (NER) + medical dictionaries for entity extraction
- scikit-learn (TF-IDF) for classification
- sumy (TextRank) for extractive summarization
- networkx for community detection (label propagation)
- pdfplumber / python-docx for text extraction
- FastAPI for health check server (port 3102)
- structlog for structured JSON logging

**Celery bridge:** The API enqueues tasks using a Celery-compatible Redis
format (`apps/api/src/lib/celery-bridge.ts`), which pushes messages directly
to Celery's Redis queues. This replaces the previous BullMQ-based approach.

**Pipeline stages (all deterministic by default):**
1. `extract` — text from PDF/DOCX/TXT via MinIO
2. `normalize` — clean, deduplicate whitespace
3. `chunk` — structure-aware: headings, sections, sliding window
4. `embed` — batch embeddings via AI provider REST API
5. `extract-entities` — spaCy NER + medical dictionaries + co-occurrence
6. `build-graph` — upsert concepts, relations, topics + community detection
7. `index-vectors` — store chunks + embeddings
8. `summarize` — TextRank extractive summarization
9. `classify` — TF-IDF + cosine similarity with category centroids
10. `finalize` — persist results, mark document as COMPLETED

**Running the worker manually:**
```bash
cd apps/worker-python
source .venv/bin/activate
celery -A src.tasks.celery_app worker \
  --queues=transcription,analysis,summarization,notes-generation,rag-indexing \
  --loglevel=info --concurrency=4
```

## AI Core (`@avesia/ai-core`)

The intelligence layer. The ingestion pipeline (extract, chunk, embed,
entity-extract, graph-build, summarize, classify) is handled by the Python
Celery worker. This package retains the **retrieval layer**, **AI facade**,
**graph instructions**, and **clinical prompts** used by the API for
GraphRAG queries and session copilot.

### Architecture (retrieval + generation)

```
┌─────────────────────────────────────────────────────────────────┐
│  API (Fastify)                                                   │
│                                                                  │
│  POST /knowledge-bases/:id/query  →  RAGOrchestrator.query()    │
│  POST /sessions/:id/insights      →  RAGOrchestrator.retrieve() │
│                                       + aiCore.chat()            │
│  POST /sessions/:id/diarize       →  aiCore.chat()              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  @avesia/ai-core                                                 │
│                                                                  │
│  RAGOrchestrator                                                 │
│    1. Query rewrite (LLM, optional)                             │
│    2. GraphRetriever.retrieve()                                 │
│       a. Hybrid search (pgvector ANN + ILIKE, RRF fusion)       │
│       b. Identify mentioned concepts (MENTIONS relations)       │
│       c. Find dominant community                                │
│       d. Expand to community concepts (capped)                  │
│       e. Fetch chunks per concept (capped per concept)          │
│       f. Score by vector similarity                             │
│       g. Merge seed + community chunks                          │
│       h. MMR diversification (relevance vs. redundancy)         │
│       i. Build context (graph summary + chunk snippets)         │
│    3. Generate answer (LLM with graph-aware system prompt)      │
│    4. Source attribution (chunkId, documentId, section, score)  │
│                                                                  │
│  AvesiaAICoreFacade (provider-agnostic: NIM / OpenRouter / Ollama)│
│  Clinical Prompts (centralized pt-BR templates)                 │
│  Knowledge Graph Instructions (system prompt fragment)          │
└──────────────────────────────────────────────────────────────────┘
```

### Document ingestion (Python worker)

The ingestion pipeline runs in the Python Celery worker
(`apps/worker-python`). The TS `ai-core` package no longer contains
ingestion code — it was removed to avoid duplication with the Python
implementation.

```
Upload → Celery (rag-indexing queue) → DocumentPipeline (Python)
  → extract → normalize → chunk → embed → extract-entities
  → build-graph → index-vectors → summarize → classify → finalize
```

### Knowledge Graph (neural network of concepts)

The graph is the clinic's internal AI model. It evolves automatically as
documents are processed by the Python worker.

**Structure:**
- **Nodes**: `KnowledgeConcept` (entities), `KnowledgeTopic` (themes), `KnowledgeDocument` (files)
- **Edges**: `KnowledgeRelation` (RELATED_TO, IS_A, PART_OF, MENTIONS, TREATS, CAUSES, etc.)
- **Communities**: concepts grouped by semantic similarity (label propagation)

**Relation quality (co-occurrence filtering):**
- Co-occurrence relations (`RELATED_TO`) require entities within a 12-word
  proximity window AND co-occurrence in ≥2 sentences. Base strength 0.15,
  scaling up to 0.4 with frequency. This prevents the "random graph" effect
  caused by creating edges between every entity pair in the same sentence.
- Typed relations (`TREATS`, `CAUSES`, `IS_A`, `PART_OF`) have strength 0.85
  (deterministic NER) or 0.9 (LLM extraction), making them dominant over
  co-occurrence noise.

**Multi-tenant isolation:**
- Every `KnowledgeBase` belongs to one `Organization` (clinic)
- All graph queries filter by `knowledgeBaseId`
- Vector searches filter by `organizationId`
- No cross-tenant data leakage — each clinic has its own independent graph

### GraphRAG retrieval (token economy)

The `GraphRetriever` uses hybrid search (pgvector ANN + keyword ILIKE, fused
via RRF) as the seed, then expands through the Knowledge Graph:

```
query → embed → hybrid search (vector + keyword, RRF)
      → identify mentioned concepts from seed chunks
      → find dominant community → expand to community's concepts (capped)
      → fetch chunks linked to those concepts (capped per concept)
      → score by vector similarity → merge seed + community
      → MMR diversification → build compact context
```

**Improvements over the original implementation:**
- Uses pgvector ANN (`<=>` cosine distance) instead of brute-force JS cosine
- Hybrid search (vector + keyword with RRF) catches exact terminology
- Expansion is capped per concept (`maxChunksPerConcept`) to prevent flooding
- MMR diversification reduces redundancy in the final context
- Properly filters by `knowledgeBaseId` (the original ignored it)

### RAGOrchestrator (unified flow)

The `RAGOrchestrator` is the single entry point for "answer from the KB" and
"assist the session with KB context". It orchestrates:

1. **Query rewriting** (optional LLM call to reformulate for better retrieval)
2. **Graph retrieval** (via `GraphRetriever`)
3. **Context compression** (token budget, deduplication, MMR)
4. **Generation** (LLM call with graph-aware system prompt + context)
5. **Source attribution** (chunk IDs, document IDs, sections, scores)

Both the KB query endpoint and the session insights endpoint go through here.

### Session copilot (GraphRAG-augmented)

The `POST /sessions/:id/insights` endpoint is now integrated with the KB:

1. Derives a retrieval query from the recent transcript (last 6 turns)
2. Retrieves relevant KB context via `RAGOrchestrator.retrieve()`
3. Generates insights with both transcript + KB context
4. Returns insights + sources + conceptIds + community + tokensUsed

If no KB is available, falls back to transcript-only insights (still via the
AI facade, using `SESSION_COPILOT_NO_KB_PROMPT`).

**Removed:** The "caveman" compression (`compressTranscript`) that degraded
text quality by removing stop words. The LLM now receives the full transcript.

### Clinical prompts (centralized)

All clinical prompts are centralized in `@avesia/ai-core`:
- `SESSION_COPILOT_PROMPT` — real-time session insights (with KB context)
- `SESSION_COPILOT_NO_KB_PROMPT` — session insights without KB
- `QUERY_REWRITE_PROMPT` — query reformulation for retrieval
- `CLINICAL_ANALYSIS_PROMPT` — clinical analysis tasks (mood, risk, etc.)
- `SOAP_NOTE_PROMPT` — SOAP note generation
- `SESSION_SUMMARY_PROMPT` — session summarization
- `DIARIZATION_PROMPT` — speaker diarization correction

### AI provider abstraction

All AI calls go through `AvesiaAICoreFacade` → `@avesia/ai-providers`:
- **NVIDIA NIM** (cloud, default — free tier, both chat & embeddings)
- **OpenRouter** (cloud, chat only — no embedding models)
- **Ollama** (local, GPU required — can crash under concurrent load)

Swapping providers requires only changing `AI_PROVIDER` in `.env` — no code
changes needed in the retrieval, graph, or session code.

**Recommended for VPS**: NVIDIA NIM with `meta/llama-3.1-8b-instruct` (chat)
and `nvidia/llama-nemotron-embed-1b-v2` (embeddings, 2048 dims).

### Key exports

```typescript
import {
  // Retrieval
  RAGOrchestrator,       // unified RAG flow (query rewrite + retrieve + generate)
  GraphRetriever,        // GraphRAG (hybrid search + graph expansion + MMR)
  HybridRetriever,       // vector + keyword fusion (RRF) — standalone
  PgvectorVectorStore,   // pgvector ANN vector store
  InMemoryVectorStore,   // in-memory vector store (dev/testing)
  buildContext,          // context builder (token budget, dedup)
  // AI facade
  AvesiaAICoreFacade,
  // Instructions for the LLM
  KNOWLEDGE_GRAPH_INSTRUCTIONS,
  buildKnowledgeGraphSystemPrompt,
  // Clinical prompts
  SESSION_COPILOT_PROMPT,
  SESSION_COPILOT_NO_KB_PROMPT,
  QUERY_REWRITE_PROMPT,
  CLINICAL_ANALYSIS_PROMPT,
  SOAP_NOTE_PROMPT,
  SESSION_SUMMARY_PROMPT,
  DIARIZATION_PROMPT,
  // Adapters
  PrismaGraphRepository,
} from '@avesia/ai-core';
```

## Environment Variables

See `.env.example` for the full list. Key AI Core variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `nvidia-nim` | Active AI provider (`nvidia-nim` / `openrouter` / `ollama`) |
| `EMBEDDING_MODEL` | `nvidia/llama-nemotron-embed-1b-v2` | Embedding model (must exist on active provider) |
| `NVIDIA_NIM_DEFAULT_MODEL` | `meta/llama-3.1-8b-instruct` | Chat model for NVIDIA NIM |
| `VECTOR_STORE` | `in-memory` | Vector backend: `in-memory` or `pgvector` |
| `PGVECTOR_DIMENSIONS` | `2048` | Embedding dimensions (match model) |
| `KB_MAX_EXTRACTION_CHUNKS` | `10` | Max chunks for entity extraction (cost control) |
| `KB_ENTITY_MODE` | `ner` | Entity extraction: `ner` (deterministic) or `llm` |
| `KB_SUMMARY_MODE` | `textrank` | Summarization: `textrank` (deterministic) or `llm` |
| `KB_CLASSIFY_MODE` | `tfidf` | Classification: `tfidf` (deterministic) or `llm` |

## Database

Prisma schema at `apps/api/prisma/schema.prisma`. Key models for AI:

- `KnowledgeBase` — container per clinic (organization-scoped)
- `KnowledgeDocument` — uploaded file with pipeline status/progress
- `KnowledgeConcept` — entity node in the graph (with community index)
- `KnowledgeTopic` — theme node in the graph
- `KnowledgeRelation` — edge between nodes (with strength)
- `AIContextChunk` — text chunk with embedding + metadata + pgvector column

## Frontend (`apps/web`)

React + Vite + TypeScript SPA with a premium AI-native design system.

### Tech stack
- **shadcn/ui** + **Tailwind CSS v4** — component library + design tokens
- **Motion** (`motion/react`) — animations and page transitions
- **Zustand** — client-side state (e.g. `src/stores/session-store.ts`)
- **TanStack Query v5** — server state (queries, mutations, cache)
- **react-hook-form** + **zod** — form validation
- **Recharts** — charts (Dashboard)
- **d3-force** — knowledge graph visualization
- **cmdk** — command palette
- **date-fns** — date formatting (pt-BR locale)

### Design system — "Neural Calm"
- **Identity**: Clinical intelligence with visible warmth — not a generic SaaS dashboard
- **Dark-first** with warm dark surfaces (not cold blue-black) — signals trust in healthcare
- **Light mode**: Warm ivory (Anthropic-inspired, not pure white)
- **Brand color**: Clinical teal (`hsl(172, 70%, 42%)`) — intelligence, precision, calm
- **Accent color**: Warm amber (`hsl(38, 85%, 58%)`) — human warmth, attention, care
- **Neural mesh pattern**: `.mesh-bg` and `.mesh-bg-dense` — visible "thinking" substrate
- **4-step elevation ladder**: `.elevation-1` through `.elevation-4`
- **Confidence bands**: `.confidence-high`, `.confidence-medium`, `.confidence-low` — 3-tier visual language
- **Typography**: Inter (UI) + Georgia serif (`.font-clinical` for clinical content) + JetBrains Mono (`.font-mono` for data)
- CSS tokens in `src/index.css` — semantic colors: `--foreground`, `--foreground-secondary`, `--foreground-muted`, `--surface`, `--surface-elevated`, `--primary`, `--accent`, `--border`, `--success`, `--warning`, `--destructive`
- Utility classes: `.glass`, `.glass-strong`, `.bg-gradient-primary`, `.text-gradient-primary`, `.glow-primary`, `.mesh-bg`, `.mesh-bg-dense`, `.shimmer`, `.ai-pulse`, `.neural-pulse`, `.neural-divider`, `.inner-glow-primary`
- Animations: `animate-fade-in`, `animate-fade-in-up`, `animate-scale-in`, `animate-shimmer`, `animate-ai-pulse`, `animate-neural-pulse`, `animate-neural-thinking`, `animate-glow-breathe`
- Signature components: `NeuralIndicator` (AI activity states), `AIThinkingState` (visible reasoning)
- 20+ base UI components in `src/components/ui/` (Button, Card, Input, Dialog, Select, Tabs, Table, Badge, Skeleton, NeuralIndicator, AIThinkingState, etc.)
- Global `ErrorBoundary` wraps the app

### Build commands
```bash
cd apps/web
npx tsc --noEmit     # Typecheck
npx vite build       # Production build
```

### Architecture
- **Route-level code splitting** via `React.lazy` + `Suspense` with `PageLoader`
- **Vite manualChunks** — separate vendor bundles (react, radix, motion, charts, d3, query, utils)
- **Layout** (`src/components/layout/Layout.tsx`) — collapsible sidebar, theme toggle, command palette, page transitions
- **SessionRoom** split into subcomponents (`src/components/session-room/`) with Zustand store
- **KnowledgeBase** uses D3 force graph + real-time WebSocket progress

### Key files
| File | Purpose |
|------|---------|
| `src/index.css` | Design tokens (CSS variables) |
| `tailwind.config.ts` | Tailwind theme extensions |
| `src/App.tsx` | Routes + lazy loading |
| `src/components/layout/Layout.tsx` | App shell (sidebar, header, command palette) |
| `src/components/ui/` | Base UI components (shadcn/ui) |
| `src/stores/session-store.ts` | SessionRoom state (Zustand) |
| `src/lib/api-client.ts` | API client with token refresh |
| `src/lib/auth-context.tsx` | Auth provider |

## WebSocket

`GET /knowledge-bases/:id/progress` — real-time pipeline progress stream.
Auth via `?token=<accessJwt>`. Subscribes to Redis pub/sub channel
`kb:progress:<knowledgeBaseId>`.

`GET /sessions/:id/copilot` — real-time clinical copilot stream.
Auth via `?token=<accessJwt>`. Subscribes to Redis pub/sub channel
`session:copilot:<sessionId>`. Emits assistance items, status updates,
and errors from the `SessionAIEngine`.

## Session Copilot (Real-time Clinical AI)

The copilot is a continuous clinical assistant that runs during live sessions.
It is **event-driven** (not time-based) and uses **incremental memory** to avoid
reprocessing the entire transcript on each cycle.

### Architecture

```
Segment created → notifySegmentCreated() → TriggerDetector.evaluate()
  → (if triggered) SessionAIEngine.processCycle()
    1. Load session memory from Redis (incremental state)
    2. Retrieve KB context via RAGOrchestrator (GraphRAG)
    3. Build prompts (memory + new segments + KB context)
    4. Call LLM for structured assistance (JSON output)
    5. Update session memory with memory update from LLM
    6. Persist analysis to database (SessionCopilotAnalysis)
    7. Publish assistance to Redis pub/sub → WebSocket → frontend
```

### Key components (in `packages/ai-core/src/session/`)

| Component | Purpose |
|-----------|---------|
| `SessionAIEngine` | Orchestrator: trigger → retrieve → generate → memory update → publish |
| `SessionMemoryStore` | Redis-backed incremental memory (themes, symptoms, hypotheses, questions) |
| `TriggerDetector` | Event-driven triggers: topic change, pause, content threshold, session start |
| `buildCopilotSystemPrompt` | System prompt with safety rules, structured JSON output format |
| `buildCopilotUserPrompt` | User prompt: memory + new segments + KB context |
| `types.ts` | All copilot types (AssistanceItem, SessionMemory, CopilotSettings, etc.) |

### Trigger types

- **session_start**: First processing when ≥2 segments exist
- **content_threshold**: Enough new content (tokens + segments, intensity-dependent)
- **pause_detected**: Significant time gap between segments
- **topic_change**: Embedding similarity drop below threshold (intensity-dependent)
- **manual**: Professional clicks "Analisar" (respects 5s min rate limit)

### Intensity levels

| Level | Min tokens | Min segments | Topic threshold | Pause | Max items |
|-------|-----------|-------------|-----------------|-------|-----------|
| low | 300 | 6 | 0.45 | 15s | 3 |
| medium | 180 | 4 | 0.55 | 10s | 5 |
| high | 100 | 2 | 0.65 | 6s | 7 |

### Assistance types

- **insight**: Clinical reasoning about what's being said
- **hypothesis**: Clinical hypothesis (always tentative, never diagnosis)
- **question**: Suggested question for the professional to investigate
- **attention**: Risk, inconsistency, information gap, or important change
- **connection**: Link to clinic's KB protocols/documents

### Safety rules (enforced in system prompt)

1. Never assert as absolute truth — use confidence levels (high/medium/low)
2. Distinguish observed facts from hypotheses
3. If context is insufficient, say so explicitly
4. Never invent references — only cite documents from the provided context
5. LGPD: don't repeat identifiable patient data

### Token economy

- Only **new segments** (since last processing) are sent to the LLM, not the full transcript
- Memory is accumulated in Redis (12h TTL) — no reprocessing
- KB retrieval is capped (4 chunks, 800 tokens max)
- One LLM call per cycle produces all assistance + memory update
- Rate limiting via `maxFrequencyMs` (configurable per session)

### Scalability

- Per-session processing lock (Redis) prevents concurrent cycles
- Fire-and-forget segment notification (non-blocking API response)
- Redis pub/sub for real-time delivery (no polling)
- Memory capped: 20 themes, 20 symptoms, 10 hypotheses, 15 questions, 20 docs, 30 concepts
- Frontend caps at 50 displayed items

### Settings (per session, stored in Redis + DB)

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Is the copilot active |
| `intensity` | `medium` | Trigger sensitivity + output verbosity |
| `maxFrequencyMs` | `30000` | Min ms between processing cycles |
| `autoGenerate` | `true` | Process automatically vs. manual only |

### Database models

- `SessionCopilotSettings` — per-session configuration (1:1 with ClinicalSession)
- `SessionCopilotAnalysis` — persisted copilot output for post-session review

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sessions/:id/insights` | Manual trigger for copilot cycle |
| `GET` | `/sessions/:id/copilot/settings` | Get copilot settings |
| `PUT` | `/sessions/:id/copilot/settings` | Update copilot settings |
| `GET` | `/sessions/:id/copilot/analyses` | Get persisted analyses (post-session review) |
| `WS` | `/sessions/:id/copilot` | Real-time copilot stream |

### Frontend components

| File | Purpose |
|------|---------|
| `src/lib/use-session-copilot.ts` | WebSocket hook for copilot events |
| `src/components/session-room/InsightsPanel.tsx` | Real-time copilot stream UI |
| `src/components/session-room/AssistanceCard.tsx` | Single assistance item card |
| `src/components/session-room/CopilotSettingsPanel.tsx` | Settings (enable, intensity, frequency) |
| `src/stores/session-store.ts` | Zustand store with copilot state |

## API Endpoints (AI Core)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/knowledge-bases/:id/documents` | Upload document (enqueues pipeline) |
| `GET` | `/knowledge-bases/:id/graph` | Get full graph (nodes + edges) |
| `POST` | `/knowledge-bases/:id/query` | GraphRAG query (answer from KB) |
| `WS` | `/knowledge-bases/:id/progress` | Real-time pipeline progress |
| `POST` | `/sessions/:id/insights` | Manual copilot trigger |
| `GET` | `/sessions/:id/copilot/settings` | Get copilot settings |
| `PUT` | `/sessions/:id/copilot/settings` | Update copilot settings |
| `GET` | `/sessions/:id/copilot/analyses` | Get persisted copilot analyses |
| `WS` | `/sessions/:id/copilot` | Real-time copilot stream |
