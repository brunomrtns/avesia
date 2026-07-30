# Avesia

**Plataforma clínica com Knowledge Graph e GraphRAG para psicologia.**

Sistema SaaS multi-tenant onde clínicas gerenciam pacientes, sessões (com transcrição de áudio) e uma base de conhecimento que constrói automaticamente uma rede neural de conceitos a partir de documentos, permitindo queries em linguagem natural via GraphRAG.

> **Aviso**: A IA é exclusivamente uma ferramenta de apoio. Não diagnostica, não substitui julgamento clínico e não fornece tratamento. Todo conteúdo gerado por IA permanece editável antes de qualquer salvamento definitivo.

---

## Quick start

```bash
# 1. Copiar env e preencher secrets (mínimo: BI_IDENTITY_URL + 1 AI provider key)
cp .env.example .env

# 2. Subir infraestrutura (Postgres, Redis, MinIO)
pnpm docker:up

# 3. Instalar dependências
pnpm install

# 4. Migrations + seed
pnpm db:migrate
pnpm db:seed

# 5. Instalar spaCy model (worker Python)
cd apps/worker-python
python -m venv .venv && source .venv/bin/activate
pip install -e .
python -m spacy download pt_core_news_lg
cd ../..

# 6. Subir tudo (API + Web + Worker Python)
./dev.sh
```

- **Web**: http://localhost:3101
- **API**: http://localhost:3100/health
- **Worker health**: http://localhost:3102/health
- **MinIO Console**: http://localhost:9101

**Credenciais demo:** `owner@demo.avesia` / `password123`

---

## Estrutura do monorepo

```
avesia/
├── apps/
│   ├── api/              # Fastify REST + WebSocket (Node.js, port 3100)
│   ├── web/              # React + Vite SPA (port 3101)
│   └── worker-python/    # Celery worker (Python, port 3102)
├── packages/
│   ├── ai-core/          # Camada de IA: GraphRetriever, HybridRetriever, pipeline types
│   ├── ai-providers/     # Abstração de providers: NVIDIA NIM, OpenRouter, Ollama
│   ├── shared/           # Constantes, validações Zod, helpers, bcrypt, cuid2
│   ├── types/            # Tipos TypeScript compartilhados
│   └── config/           # ESLint, TSConfig compartilhados
├── docker-compose.yml    # Postgres + Redis + MinIO
├── dev.sh                # Script conveniente para dev
└── turbo.json
```

---

## Arquitetura

```
                    ┌─────────────┐
                    │   Web (React)   │
                    │   port 3101     │
                    └───────┬─────────┘
                            │ HTTP / WebSocket
                    ┌───────▼─────────┐
                    │  API (Fastify)  │
                    │  port 3100      │
                    └──┬──────────┬───┘
                       │          │ Redis (Celery bridge)
              ┌────────▼───┐  ┌───▼──────────────┐
              │ PostgreSQL │  │ Worker Python    │
              │ + pgvector │  │ (Celery)         │
              └────────────┘  │ port 3102        │
                              └──┬───────────────┘
                                 │
                          ┌──────▼──────┐
                          │   MinIO     │
                          │  (S3 storage)│
                          └─────────────┘
```

### Backend (apps/api — Node.js/Fastify)

- **Fastify** + **Prisma ORM** (PostgreSQL)
- **BI Identity SSO** (cookie-based, `bi_auth` cookie validated via Identity Service), RBAC com permissões por recurso
- **WebSocket** para progresso do pipeline em tempo real (Redis pub/sub → browser)
- **Celery bridge**: encola tasks no formato Celery via Redis (substitui BullMQ)
- Rate limiting, helmet, CORS, multipart upload
- **Rotas**: patients, sessions, organization, knowledge-base, health (auth handled by BI Identity SSO — no local login/register/refresh routes)
- **25 modelos Prisma**: Organization, User, Professional, Patient, ClinicalSession, Transcript, AIAnalysis, KnowledgeBase, KnowledgeConcept, KnowledgeRelation, etc.

### Frontend (apps/web — React/Vite)

- **React 18** + React Router + TanStack Query
- **Radix UI** (Dialog, Select, Dropdown, Avatar) + **Tailwind CSS**
- **D3-force** para grafo de conhecimento interativo
- **Sonner** para toasts, **react-hook-form** + Zod para formulários
- WebSocket hook para progresso do pipeline em tempo real
- **Páginas**: Dashboard, Patients, Sessions, SessionRoom (gravação/transcrição), KnowledgeBase (grafo + upload + query GraphRAG), Settings (login via BI Identity em `/id/login`)

### Worker Python (apps/worker-python — Celery)

- **Celery** + Redis (5 filas: rag-indexing, analysis, summarization, notes-generation, transcription)
- **SQLAlchemy 2.0** (mapeia o schema Prisma)
- **httpx** para chamadas REST aos AI providers
- **FastAPI** health check server (port 3102)
- **structlog** para logging estruturado JSON

### AI Core (packages/ai-core — TypeScript)

- **GraphRetriever** — GraphRAG: query → embed → top-K chunks → comunidade dominante → expande → gera resposta
- **HybridRetriever** — vector + keyword fusion (RRF)
- System prompts com instruções do grafo de conhecimento

### AI Providers (packages/ai-providers)

| Provider     | Tipo   | Chat | Embeddings | Requer GPU |
|--------------|--------|------|------------|------------|
| NVIDIA NIM   | Cloud  | sim  | sim        | não        |
| OpenRouter   | Cloud  | sim  | não        | não        |
| Ollama       | Local  | sim  | sim        | sim        |

Troca de provider via `AI_PROVIDER` no `.env` — sem mudança de código.

---

## Pipeline de documentos (10 stages, ~30s/doc)

```
Upload → Celery queue → Worker Python → DocumentPipeline.run()

1. extract          — PDF/DOCX/TXT → Markdown estruturado (headings, seções)
2. normalize        — limpa whitespace, remove page numbers
3. chunk            — divide em chunks structure-aware + salva JSON no MinIO
4. embed            — embeddings via AI provider (NVIDIA NIM default)
5. extract-entities — 1 chamada LLM: entidades + relações tipadas (domain-agnostic)
6. build-graph      — upsert conceitos/relações + community detection (label propagation)
7. index-vectors    — chunks + embeddings no pgvector
8. summarize        — TextRank (determinístico, sem LLM)
9. classify         — TF-IDF + cosseno (determinístico, sem LLM)
10. finalize        — marca COMPLETED, publica evento Redis → WebSocket → UI
```

Cada stage publica progresso em tempo real via Redis pub/sub → WebSocket → frontend.

### Knowledge Graph

- **Nós**: `KnowledgeConcept` (entidades), `KnowledgeTopic` (temas), `KnowledgeDocument` (arquivos)
- **Arestas**: `KnowledgeRelation` (TREATS, CAUSES, IS_A, PART_OF, RELATED_TO, MENTIONS)
- **Comunidades**: conceitos agrupados por similaridade semântica (label propagation via networkx)
- **Rastreabilidade**: cada conceito/relation tem `source_document_id` + `source_chunk_index` — a UI pode mostrar o trecho exato do documento de onde aquele conceito foi extraído

### GraphRAG (token economy)

```
query → embed → top-K chunks por similaridade
      → identifica comunidade dominante
      → expande para chunks daquela comunidade
      → ranking → gera resposta com LLM
```

Reduz uma KB de 10k chunks para ~50 relevantes, economizando tokens mantendo acurácia.

---

## Tech stack

| Camada         | Tecnologia                                              |
|----------------|---------------------------------------------------------|
| Frontend       | React, TypeScript, Vite, Tailwind, Radix UI, D3-force   |
| Backend        | Node.js, TypeScript, Fastify, Prisma                    |
| Worker         | Python, Celery, SQLAlchemy, spaCy, scikit-learn, sumy   |
| Database       | PostgreSQL + pgvector                                   |
| Cache/Queue    | Redis (Celery broker + pub/sub)                         |
| Storage        | MinIO (S3-compatible)                                   |
| Real-time      | WebSockets (`@fastify/websocket`)                       |
| Auth           | BI Identity SSO (cookie-based)                         |
| AI             | NVIDIA NIM / OpenRouter / Ollama (swappable)            |
| Monorepo       | pnpm workspaces + Turborepo                             |

---

## Variáveis de ambiente

Ver `.env.example` para a lista completa. Principais:

| Variável                 | Default                              | Descrição                              |
|--------------------------|--------------------------------------|----------------------------------------|
| `AI_PROVIDER`            | `nvidia-nim`                         | Provider ativo                         |
| `NVIDIA_NIM_API_KEY`     | —                                    | API key NVIDIA NIM                     |
| `NVIDIA_NIM_DEFAULT_MODEL` | `meta/llama-3.1-8b-instruct`       | Modelo de chat                         |
| `EMBEDDING_MODEL`        | `nvidia/llama-nemotron-embed-1b-v2`  | Modelo de embeddings                   |
| `VECTOR_STORE`           | `in-memory`                          | `in-memory` ou `pgvector`              |
| `KB_MAX_EXTRACTION_CHUNKS` | `10`                               | Max chunks para extração (controle de custo) |
| `KB_ENTITY_MODE`         | `ner`                                | `ner` (determinístico) ou `llm`        |
| `KB_SUMMARY_MODE`        | `textrank`                           | `textrank` (determinístico) ou `llm`   |
| `KB_CLASSIFY_MODE`       | `tfidf`                              | `tfidf` (determinístico) ou `llm`      |

---

## Multi-tenant

Cada `Organization` (clínica) tem suas próprias:
- KnowledgeBases, documentos, conceitos, relações
- Pacientes, sessões, transcrições
- Profissionais, usuários

Todas as queries filtram por `organizationId` / `knowledgeBaseId`. Zero vazamento cross-tenant.

---

## Comandos

| Comando              | Descrição                                    |
|----------------------|----------------------------------------------|
| `./dev.sh`           | Sobe infra + API + Web + Worker Python       |
| `pnpm dev`           | Sobe só os dev servers (API + Web)           |
| `pnpm build`         | Build de todos os packages                   |
| `pnpm typecheck`     | Typecheck de todos os packages               |
| `pnpm test`          | Roda todos os testes                         |
| `pnpm db:generate`   | Regenera Prisma client                       |
| `pnpm db:migrate`    | Roda migrations                              |
| `pnpm db:seed`       | Seed do banco (demo clinic + users)          |
| `pnpm docker:up`     | Sobe Postgres + Redis + MinIO via Docker     |
| `pnpm docker:down`   | Derruba containers                           |

---

## Pré-requisitos

- Node.js 22+
- pnpm 9+
- Python 3.12+ + venv
- Docker (para Postgres, Redis, MinIO)
- Linux: `sudo sysctl fs.inotify.max_user_instances=512` (file watchers)

---

## License

UNLICENSED — proprietary.
