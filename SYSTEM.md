# Avesia — Clinical AI Support for Psychologists

## Visão Geral

Plataforma SaaS para suporte clínico baseado em IA para psicólogos. Processamento de sessões (transcrição, análise, sumarização), geração de notas clínicas, e base de conhecimento com RAG para respostas contextuais.

**Tech Stack:** pnpm + Turbo monorepo, TypeScript (strict), Fastify, React+Vite, Postgres+Redis+MinIO, BullMQ, ESM.

**Domínio:** brunointegrations.com/avesia/

---

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                      Avesia                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  API     │  │  Web     │  │  Worker          │  │
│  │  :3100   │  │  :3101   │  │  :3102           │  │
│  │ Fastify  │  │ React    │  │ BullMQ Consumers │  │
│  └────┬─────┘  └────┬─────┘  └───────┬──────────┘  │
│       │              │               │              │
│       └──────────────┴───────────────┘              │
│                         │                           │
│                   ┌─────┴──────┐                    │
│                   │  Postgres  │ (Prisma ORM)       │
│                   │  Redis     │ (BullMQ + Cache)   │
│                   │  MinIO     │ (Object Storage)   │
│                   └────────────┘                    │
└─────────────────────────────────────────────────────┘
```

### Packages (bibliotecas compartilhadas)

| Package | Descrição |
|---------|-----------|
| `@avesia/types` | Tipos TS compartilhados (requests, responses, models) |
| `@avesia/shared` | Constantes, helpers (QUEUE_NAMES, etc.) |
| `@avesia/ai-providers` | Provedores de IA + AvesiaAICore + ProviderRouter |
| `@avesia/config` | Configs compartilhadas (eslint, tsconfig) |

---

## Componentes Implementados

### 1. 🧠 AI Core (`packages/ai-providers/src/core/ai-core.ts`)

Classe `AvesiaAICore` que centraliza chamadas a provedores de IA:

- **Template Registry**: Gerenciamento de templates de prompts
- **Fallback Routing**: Ollama (local) → OpenRouter → NVIDIA NIM
- **Health Check**: Dinâmico por provider, com cool-down de 30s em falha
- **Métricas**: Latência, taxa de erro, última falha por provider
- **Embeddings**: Geração via `BaseOpenAICompatibleProvider.embed()`
- **Capability Routing**: `executeChat(messages, capability)` roteia baseado na capacidade necessária

### 2. 🔐 RBAC Contextual (`apps/api/src/plugins/tenant.ts`)

- **requireResourceOwnership()**: Verifica se recurso pertence ao profissional logado
- Isolamento: `PROFESSIONAL` vê apenas seus pacientes/sessões; `ADMIN` vê tudo
- Filtro `professionalId` nas queries de pacientes e sessões

### 3. 🗄️ RAG Service (`apps/worker/src/services/rag-service.ts`)

Pipeline de indexação e busca semântica:

- **Chunking**: Sliding window de 500 chars, overlap de 100
- **Embeddings**: Geração via provider ativo (modelo configurável)
- **Busca**: Cosine similarity com fallback in-memory (pgvector opcional)
- **BuildContext**: Concatena chunks relevantes para prompt da IA

### 4. ⚙️ Background Jobs (`apps/worker/src/`)

5 filas BullMQ:

| Queue | Processor | Descrição |
|-------|-----------|-----------|
| `transcription` | Transcription Worker | Transcrição de áudio |
| `analysis` | Analysis Worker | Análise clínica |
| `summarization` | Summarization Worker | Sumarização |
| `notesGeneration` | Notes Worker | Geração de notas |
| `ragIndexing` | RAG Worker | Indexação de documentos para RAG |

Worker entry point: `apps/worker/src/index.ts` — bootstrap + health server (Fastify) + heartbeat + graceful shutdown.

### 5. 📚 Base de Conhecimento

Módulo completo com 6 modelos Prisma + API + Frontend:

- **KnowledgeBase**: Agrupamento de documentos por contexto clínico
- **KnowledgeDocument**: Documentos com status, progresso, metadados
- **KnowledgeTopic/KnowledgeConcept**: Extraídos por IA (via `kb-processor.service.ts`)
- **KnowledgeRelation**: Relações entre tópicos/conceitos
- **Upload real**: Multipart → MinIO → extração de texto (PDF/DOCX/TXT/MD) → RAG
- **Frontend**: D3 force-directed graph + lista de documentos com status + upload dialog

### 6. 🌐 API (`apps/api/src/`)

Fastify com plugins: auth (JWT 15min + refresh 7d), CORS, rate-limit, helmet, multipart, websocket.

**Rotas:**

| Rota | Descrição |
|------|-----------|
| `POST /auth/login` | Login com email+senha |
| `POST /auth/refresh` | Refresh token com rotação |
| `GET /auth/me` | Perfil atual |
| `GET/POST/PATCH/DELETE /patients` | CRUD pacientes |
| `GET/POST/PATCH/DELETE /sessions` | CRUD sessões |
| `POST /sessions/:id/segments` | Segmentos de fala |
| `POST /sessions/:id/insights` | Análise por IA |
| `GET/PATCH /organization` | Dados da organização |
| `GET/POST/DELETE /knowledge-bases` | CRUD bases de conhecimento |
| `POST /knowledge-bases/:id/upload` | Upload de documento (multipart) |
| `GET /knowledge-bases/:id/graph` | Dados do grafo |
| `GET /knowledge-bases/:id` | KB com documentos |
| `DELETE /knowledge-bases/:id/documents/:docId` | Excluir documento |
| `GET /health/ai` | Health check dos providers de IA |

### 7. 🌐 Web (`apps/web/src/`)

React 19 + Vite + Tailwind + shadcn/ui + React Router 7 + TanStack Query.

**Páginas:**
- `LoginPage` — Autenticação
- `DashboardPage` — Estatísticas e visão geral
- `PatientsPage` — CRUD de pacientes
- `SessionsPage` — CRUD de sessões
- `KnowledgeBasePage` — Grafo + documentos + upload
- `SettingsPage` — Configurações da organização
- `SessionRoomPage` — Sala de sessão com transcrição em tempo real

---

## Modelos de Dados (Prisma — 25 modelos)

**Core:** `Organization`, `User`, `ProfessionalPatient`
**Sessões:** `Session`, `SessionSegment`, `SessionAnalysis`
**RAG:** `AIContextDocument`, `AIContextChunk`
**Knowledge Base:** `KnowledgeBase`, `KnowledgeDocument`, `KnowledgeTopic`, `KnowledgeConcept`, `KnowledgeRelation`, `KnowledgeDocumentTopic`
**Auditoria:** `AuditLog`
**Auth:** `Permission`, `Role`, `UserRole`, `RefreshToken`, `RefreshTokenFamily`

---

## Infraestrutura

```
           Portas          │    Serviços
  ─────────────────────────┼──────────────────────
     3100  API (Fastify)   │   5433  PostgreSQL
     3101  Web (Vite/React)│   6380  Redis
     3102  Worker (BullMQ) │   9100/9101  MinIO
```

Docker Compose com: Postgres (+ pgvector opcional), Redis, MinIO.
Variáveis de ambiente via `.env` + turbo.json `globalEnv`.

---

## Estado do Projeto

**79 source files**, tipo e compilação: 9/9 typecheck, 6/6 build ✅

| Componente | Status |
|------------|--------|
| Wave 1 (Foundation) | ✅ 80+ arquivos |
| AI Core (AvesiaAICore) | ✅ |
| RBAC (requireResourceOwnership) | ✅ |
| RAG (chunking, embed, search) | ✅ |
| Background Jobs (5 filas) | ✅ |
| Base de Conhecimento (7 arquivos) | ✅ |
| API (server + 11 rotas) | ✅ |
| Web (6 páginas + componentes) | ✅ |
| Upload real (multipart + MinIO + extração) | ✅ |

**Para iniciar:**
```bash
docker compose up -d
npx prisma migrate dev
npx prisma db seed
pnpm --filter @avesia/api dev     # :3100
pnpm --filter @avesia/worker dev  # :3102
pnpm --filter @avesia/web dev     # :3101
```

---

## Convenções de Código

- **Zero tolerância** a `any`, `enum`, `@ts-ignore`/`@ts-expect-error`
- `exactOptionalPropertyTypes: true` — propriedades opcionais não aceitam `undefined`
- `noUncheckedIndexedAccess: true` — acesso a array retorna `T | undefined`
- ESM com `.js` em todos os imports
- Tipos discriminados (union) em vez de flags booleanas opcionais
- `import type` para importações de tipo
- Sem barrel files exceto em boundaries de package
