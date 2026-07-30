# Avesia — System Architecture

> Living document. Update when architecture changes.

## 1. Overview

Avesia is a multi-tenant SaaS that helps mental health professionals (initially psychologists) conduct sessions, transcribe recordings, generate structured clinical notes, and organize patient history. AI is a configurable layer — never a hardcoded dependency.

**Hard guarantees**:
- AI is **support only** — does not diagnose, does not replace clinical judgment.
- All AI-generated content is **editable before any definitive save**.
- Tenant isolation is enforced at **app + database layer** (defense in depth).
- Clinical notes are **immutable once finalized** (versioned, never overwritten).

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENT (browser)                         │
│  React + Vite + Tailwind + shadcn/ui  (apps/web, port 3101)       │
└──────────────┬───────────────────────────────────┬────────────────┘
               │ REST (HTTP/JSON)                   │ WebSocket
               ▼                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                       API (apps/api, port 3100)                   │
│  Fastify + Zod + BI Identity SSO + Multi-tenant middleware + RBAC    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐     │
│  │   Auth     │ │   Org      │ │  Patients  │ │  Sessions  │ ... │
│  │  Plugin    │ │   Routes   │ │   Routes   │ │   Routes   │     │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘     │
└──────┬──────────────────┬─────────────────┬──────────────────────┘
       │                  │                 │
       ▼                  ▼                 ▼
┌─────────────┐  ┌─────────────────┐  ┌──────────────────────────┐
│ PostgreSQL  │  │     Redis       │  │  MinIO (S3-compatible)   │
│   (5433)    │  │   BullMQ        │  │  Audio, docs, images     │
│  + Prisma   │  │   Queues        │  │  Bucket: avesia          │
│  + RLS      │  │   Pub/Sub       │  │                          │
└─────────────┘  └────────┬────────┘  └──────────────────────────┘
                          │
                          ▼
                ┌─────────────────────────┐
                │  WORKER (apps/worker)   │
                │  BullMQ consumers:      │
                │  - transcription        │
                │  - analysis             │
                │  - summarization        │
                │  - notes-generation     │
                └───────────┬─────────────┘
                            │
                            ▼
                ┌─────────────────────────────────┐
                │  @avesia/ai-providers           │
                │  ┌───────────────────────────┐  │
                │  │     ProviderRouter        │  │
                │  │  local? cloud? → decision │  │
                │  └─────────┬─────────────────┘  │
                │            │                    │
                │  ┌─────────▼─────────┐          │
                │  │ Ollama (local)    │          │
                │  │ NIM (cloud)       │          │
                │  │ OpenRouter (cloud)│          │
                │  │ (+future)         │          │
                │  └───────────────────┘          │
                └─────────────────────────────────┘
```

---

## 3. Monorepo Layout

```
avesia/
├── apps/
│   ├── api/                         # Fastify REST API + WebSocket
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── seeds/
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── plugins/             # Fastify plugins (auth, tenant, error-handler)
│   │   │   ├── modules/             # Feature modules (auth, org, patient, session)
│   │   │   │   ├── auth/
│   │   │   │   │   ├── routes.ts
│   │   │   │   │   ├── service.ts
│   │   │   │   │   └── schema.ts    # Zod
│   │   │   │   ├── patient/
│   │   │   │   ├── session/
│   │   │   │   └── ...
│   │   │   ├── lib/                 # Prisma client, redis, storage clients
│   │   │   ├── ws/                  # WebSocket handlers
│   │   │   └── server.ts            # Entry point
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── web/                         # React SPA
│   │   ├── src/
│   │   │   ├── routes/              # Page components (router-driven)
│   │   │   ├── components/          # App-specific components
│   │   │   ├── hooks/               # Custom hooks (useAuth, usePatient, ...)
│   │   │   ├── lib/                 # API client, query client, ws client
│   │   │   ├── stores/              # Zustand or context stores
│   │   │   └── main.tsx
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── worker/                      # BullMQ worker process
│       ├── src/
│       │   ├── queues/              # Queue definitions
│       │   ├── processors/          # Job handlers per queue
│       │   ├── lib/                 # Client setup
│       │   └── index.ts
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   ├── config/                      # Shared tsconfig, eslint, prettier
│   ├── types/                       # Shared TS types (domain, API, WS, AI)
│   ├── shared/                      # Zod schemas, Result, errors, logger, utils
│   ├── ui/                          # Shared shadcn-based components (future)
│   └── ai-providers/                # AI provider interface + implementations
│
├── docs/
│   ├── architecture.md              # This file
│   ├── decisions.md                 # ADRs
│   ├── getting-started.md           # Setup guide
│   ├── ai-providers.md              # Provider configuration
│   └── deploy.md                    # VPS deployment
│
├── nginx/
│   └── avesia.conf                  # Reverse proxy config (prod)
│
├── docker-compose.yml               # Dev: all services
├── docker-compose.prod.yml          # Prod overlay
├── dev.sh                           # Convenience dev script
├── turbo.json                       # Build pipeline
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. Domain Model

### 4.1 Entity Overview

| Entity | Tenant-scoped | Description |
|---|---|---|
| `Organization` | — (root) | Clinic or solo professional. Tenant root. |
| `User` | ✅ | Authentication account. Links to Professional. |
| `Professional` | ✅ | Health professional profile (name, CRM, specialty). |
| `Specialty` | — | Psychology, Psychiatry, etc. (extensible). |
| `Patient` | ✅ | Person receiving care. |
| `ClinicalSession` | ✅ | A scheduled/conducted therapy session. |
| `SessionRecording` | ✅ | Audio/video file from a session. |
| `Transcript` | ✅ | Full transcript of a recording. |
| `TranscriptSegment` | ✅ | Timestamped segment within a transcript. |
| `ClinicalNote` | ✅ | Versioned medical record (SOAP-structured). |
| `AIAnalysis` | ✅ | AI-produced output (summary, topics, etc.). |
| `Attachment` | ✅ | Uploaded file (audio, doc, image). |
| `Consent` | ✅ | LGPD / recording consent record. |
| `AuditLog` | ✅ | Security audit trail (immutable). |

### 4.2 Key Relationships

```
Organization 1───* User
Organization 1───* Professional 1───1 User
Organization 1───* Patient
Organization 1───* ClinicalSession
Patient    1───* ClinicalSession *───1 Professional
Session    1───* SessionRecording 1───1 Transcript 1───* TranscriptSegment
Session    1───* ClinicalNote (versioned via self-ref)
Session    1───* AIAnalysis
Patient    1───* Attachment
Patient    1───* Consent
```

### 4.3 Multi-Tenant Enforcement

1. **App layer**: Prisma client extension reads `organizationId` from request context (set by BI Identity SSO auth plugin) and auto-injects into all queries.
2. **DB layer**: PostgreSQL RLS policies enforce `organization_id = current_setting('app.current_org')` at the row level.

See [ADR-002](./decisions.md#adr-002) for rationale.

---

## 5. Auth Flow

```
┌────────┐   GET /id/login (BI Identity)   ┌───────────────┐
│ Client │ ──────────────────────────────▶ │  BI Identity  │
│        │ ◀──── bi_auth cookie ───────── │  (Identity     │
│        │                                │   Service)     │
└────────┘                                └───────────────┘

     │  bi_auth cookie
     ▼
┌─────────────────────────────────────────┐
│  Avesia API (auth plugin)               │
│  reads bi_auth cookie → validates via   │
│  http://bi-api:3300/api/auth/check      │
│  → find-or-create User by email (Prisma)│
└─────────────────────────────────────────┘
```

- Auth: BI Identity SSO (cookie-based). Reads `bi_auth` cookie, validates via Identity Service at `http://bi-api:3300/api/auth/check`.
- Auth plugin: `apps/api/src/plugins/auth.ts` (getAuthUser, requireAuth, requireAdmin deps).
- Local User is find-or-created by email match via Prisma.
- No local login/register/refresh routes — login is at `/id/login` (BI Identity).
- Environment variable: `BI_IDENTITY_URL` (not JWT_SECRET).
- Frontend redirects to `/id/login?redirect=/avesia/dashboard` when not authenticated.

See [ADR-006](./decisions.md#adr-006).

---

## 6. AI Provider Architecture

```
                  ┌─────────────────────────┐
                  │   ProviderRouter        │
   AI request ───▶│   (reads config +       │
                  │    local worker state)  │
                  └────┬──────────┬─────────┘
                       │          │
              local?   │          │ cloud?
                       ▼          ▼
              ┌──────────┐  ┌──────────────────┐
              │  Ollama  │  │  NIM or          │
              │ (local)  │  │  OpenRouter      │
              └──────────┘  │  (per AI_PROVIDER)│
                            └──────────────────┘
```

- All providers implement `AIProvider` interface.
- `BaseOpenAICompatibleProvider` shares HTTP/streaming logic (OpenRouter/NIM/Ollama are OpenAI-compatible).
- `ProviderRouter` decides local vs cloud. **Only module that knows this logic.**
- Worker uses `ProviderRouter` to execute AI jobs.

See [ADR-004](./decisions.md#adr-004) and [ADR-005](./decisions.md#adr-005).

---

## 7. Session Lifecycle

```
                    create session
                          │
                          ▼
                   ┌─────────────┐
                   │  SCHEDULED  │
                   └──────┬──────┘
                          │ open session
                          ▼
                   ┌─────────────┐
                   │ IN_PROGRESS │◀──── upload audio ──▶ queue transcription
                   └──────┬──────┘                          │
                          │                                 ▼
                          │                          ┌──────────────┐
                          │                          │  Transcript  │
                          │ ◀─── WS: progress ───────│  (streaming) │
                          │                          └──────┬───────┘
                          │                                 │
                          │                                 ▼
                          │                       queue analysis/summary
                          │                                 │
                          │ ◀─── WS: AI insights ────────────┘
                          │
                  finalize session
                          │
                          ▼
                   ┌─────────────┐
                   │  COMPLETED  │──▶ generate clinical note (draft)
                   └─────────────┘            │
                                              ▼
                                      professional edits
                                              │
                                              ▼
                                       finalize note (immutable)
```

---

## 8. Real-Time Communication

WebSocket events (channels: `org:{orgId}`, `session:{sessionId}`):

| Event | Direction | Payload |
|---|---|---|
| `session:transcript:progress` | server → client | `{ sessionId, segmentCount, lastSegment }` |
| `session:transcript:complete` | server → client | `{ sessionId, transcriptId }` |
| `session:ai:insight` | server → client | `{ sessionId, type, content }` |
| `session:status` | server → client | `{ sessionId, status }` |
| `worker:heartbeat` | worker → server | `{ workerId, status, models }` |

---

## 9. Observability

- **Logs**: `pino` structured JSON, fields `{ timestamp, level, requestId, orgId, userId, msg, ...props }`.
- **Health endpoints**:
  - `GET /health` — liveness (process alive)
  - `GET /ready` — readiness (DB + Redis reachable)
- **Error responses**: standardized shape `{ error: { code, message, details? } }`. Never expose stack traces.

---

## 10. Security Posture

- **Auth**: BI Identity SSO (cookie-based) (ADR-006)
- **Passwords**: bcrypt (cost 12)
- **Tenant isolation**: app filter + RLS (ADR-002)
- **Input validation**: Zod at all boundaries (ADR-012)
- **Rate limiting**: `@fastify/rate-limit` (per-IP + per-user)
- **CORS**: explicit origin allowlist
- **Helmet**: security headers via `@fastify/helmet`
- **Audit log**: immutable `AuditLog` table records all sensitive actions
- **LGPD**: consent records, soft-delete, encrypted sensitive fields (ADR-008)

---

## 11. Testing Strategy

| Layer | Tool | Coverage target |
|---|---|---|
| Domain logic (services) | Vitest | High — pure functions, Result<T,E> |
| API endpoints | Vitest + supertest | Critical paths: auth, RBAC, tenant isolation |
| AI providers | Vitest + nock | Health check, chat, error cases |
| Web | Vitest + Testing Library | Component rendering, form validation |
| E2E | Playwright (future) | Login → create patient → create session |

---

## 12. Deployment

- **Dev**: `docker compose up` → all services local.
- **Prod (VPS)**: see `docs/deploy.md` (mirrors trivestia pattern: local build → rsync → Docker rebuild → healthcheck → migrations).
- **URL**: `brunointegrations.com/avesia/` (nginx reverse proxy).

---

## 13. Phase Roadmap

| Phase | Scope | Status |
|---|---|---|
| **1 — Foundation** | Scaffold, Docker, schema, auth, multi-tenant, AI providers (real), CRUD (org/patients/sessions), login + dashboard | In progress |
| **2 — Pipeline** | Recording upload → MinIO → transcription queue → transcript editor | Planned |
| **3 — AI Insights** | Real-time analysis, summary, topics, keywords, draft note generation | Planned |
| **4 — Polish** | Full RBAC UI, audit log viewer, consent management, settings | Planned |
| **5 — Hardening** | Tests, OpenAPI docs, deploy automation, monitoring | Planned |
