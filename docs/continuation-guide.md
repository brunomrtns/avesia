# Avesia — Continuation Guide

> Clinical AI Support SaaS for Psychologists
> **Status:** Wave 1 (Foundation) ✅ Complete | Wave 2 (Application) ⚠️ Partial — needs ~15 files
> **Root:** `/home/bruno/Desenvolvimento/brunointegrations/avesia/`
> **Deploy:** `brunointegrations.com/avesia/` (future)

---

## 1. Project Overview

Avesia is a production-grade clinical AI platform for psychologists. Multi-tenant SaaS with real AI provider integration (OpenRouter, NVIDIA NIM, Ollama), built for Brazilian market (LGPD compliance, pt-BR UI).

**Core workflow:** Psychologist registers clinic → manages patients → schedules sessions → records audio → AI transcribes → AI analyzes → AI generates clinical notes.

---

## 2. Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Web App    │────▶│  Fastify API │────▶│  PostgreSQL 16   │
│  (React 19) │     │  (Port 3100) │     │  (Port 5433)     │
│  Port 3101  │     │              │     ├──────────────────┤
└─────────────┘     │  BI Identity │     │  Redis 7         │
       │            │  SSO         │     │  (Port 6380)     │
       │            │  Multi-Tenant│     ├──────────────────┤
       ▼            └──────┬───────┘     │  MinIO S3        │
┌─────────────┐            │             │  (Port 9100)     │
│  Worker     │◀───────────┘             └──────────────────┘
│  BullMQ     │
│  Port 3102  │
│             │
│  AI Providers (OpenRouter / NVIDIA NIM / Ollama)
└─────────────┘
```

---

## 3. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Monorepo | pnpm + Turbo | latest |
| Runtime | Node.js | 22 (.nvmrc) |
| Language | TypeScript | 5.7 |
| API | Fastify | 5.x |
| ORM | Prisma | 6.x |
| Auth | BI Identity SSO (cookie-based, `bi_auth` cookie) | — |
| Frontend | React + Vite | 19 / 6 |
| Styling | Tailwind CSS + shadcn/ui | 3.x |
| State | @tanstack/react-query | 5.x |
| Forms | react-hook-form + zod | 7.x |
| Workers | BullMQ | 5.x |
| Cache/Queue | Redis (ioredis) | 7 / 5.x |
| Object Store | MinIO | latest |
| AI | Native fetch (no SDK) | — |
| Validation | Zod | 3.x |

---

## 4. Complete File Inventory

### 4.1 Root (8 files) ✅

| File | Purpose |
|------|---------|
| `package.json` | pnpm workspace root (turbo) |
| `pnpm-workspace.yaml` | Workspace config |
| `turbo.json` | Task runner |
| `.gitignore` | Git ignore rules |
| `.prettierrc` | Code formatting |
| `.nvmrc` | Node version |
| `.env.example` | Environment template |
| `README.md` | Project readme |

### 4.2 Infra (5 files) ✅

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Dev stack (PostgreSQL + Redis + MinIO) |
| `docker-compose.prod.yml` | Production hardened stack |
| `dev.sh` | Dev startup script |
| `nginx/avesia.conf` | Nginx reverse proxy |
| `apps/api/Dockerfile` | API container |
| `apps/web/Dockerfile` | Web container |
| `apps/worker/Dockerfile` | Worker container |

### 4.3 Docs (2 files) ✅

| File | Purpose |
|------|---------|
| `docs/architecture.md` | Architecture documentation |
| `docs/decisions.md` | 14 Architecture Decision Records |
| `docs/continuation-guide.md` | THIS FILE |

### 4.4 packages/config (6 files) ✅

| File | Purpose |
|------|---------|
| `package.json` | Config package |
| `tsconfig.base.json` | Base TS config |
| `tsconfig.node.json` | Node TS config |
| `tsconfig.react.json` | React TS config |
| `eslint.config.js` | ESLint flat config |
| `eslint.react.js` | ESLint react config |

### 4.5 packages/types (10 source files) ✅

| File | Purpose |
|------|---------|
| `src/common.ts` | Brand<T,B>, branded IDs (14 types), PaginatedResponse, ISODateString, Timestamped, SoftDeletable, TenantScoped |
| `src/enums.ts` | CONST OBJECTS (not enum): Role, SessionStatus, SessionType, SessionLocation, RecordingStatus, TranscriptStatus, PatientStatus, NoteStatus, AIAnalysisType, ConsentType, ConsentStatus, AuditAction, AttachmentKind |
| `src/domain.ts` | 13 domain interfaces: Organization, User, Specialty, Professional, Patient, ClinicalSession, SessionRecording, Transcript, TranscriptSegment, ClinicalNote, AIAnalysis, Attachment, Consent, AuditLog |
| `src/api.ts` | API DTOs: MeResponse, UpdateOrganizationRequest, CreatePatientRequest, UpdatePatientRequest, PatientListQuery, CreateSessionRequest, UpdateSessionRequest, SessionListQuery, etc. (login/register/refresh DTOs removed — handled by BI Identity) |
| `src/auth.ts` | AuthContext (BI Identity SSO — JwtPayload/AuthTokens no longer used) |
| `src/ai-provider.ts` | AI provider types |
| `src/websocket.ts` | WebSocket event types |
| `src/index.ts` | Barrel export |

### 4.6 packages/shared (7 source files) ✅

| File | Purpose |
|------|---------|
| `src/constants.ts` | AppConstants (page sizes, queue names), QUEUE_NAMES, WS_CHANNELS, PASSWORD_RULES (token expiry removed — BI Identity SSO) |
| `src/errors.ts` | AppError hierarchy: AppError, ValidationError(400), AuthError(401), NotFoundError(404), ConflictError(409), TenantError(403), RateLimitError(429), AIProviderError(502) |
| `src/result.ts` | Result<T,E> pattern |
| `src/utils.ts` | generateId (cuid2), hashPassword/comparePassword (bcryptjs), formatISODate, safeJSONParse |
| `src/logger.ts` | Pino logger setup |
| `src/zod-schemas.ts` | Zod validation schemas |
| `src/index.ts` | Barrel export |

### 4.7 packages/ai-providers (14 files) ✅ **CRITICAL — REAL AI, NO MOCKS**

| File | Purpose |
|------|---------|
| `src/types.ts` | AIProvider interface, ChatRequest/Response, HealthStatus, AIProviderName |
| `src/provider-config.ts` | Provider configuration types and env loading |
| `src/provider-router.ts` | **ProviderRouter** — local-first (Ollama) + cloud fallback (OpenRouter/NIM) |
| `src/provider-factory.ts` | Factory to create provider instances |
| `src/errors.ts` | AI-specific errors |
| `src/providers/base-openai-compatible.ts` | **Base class** — native fetch, SSE parsing, OpenAI-compatible API format |
| `src/providers/openrouter.ts` | **OpenRouterProvider** extends BaseOpenAICompatibleProvider |
| `src/providers/nvidia-nim.ts` | **NvidiaNimProvider** extends BaseOpenAICompatibleProvider |
| `src/providers/ollama.ts` | **OllamaProvider** extends BaseOpenAICompatibleProvider |
| `src/providers/health-check.ts` | Health check logic |
| `src/providers/index.ts` | Barrel |
| `src/utils/retry.ts` | Exponential backoff + jitter |
| `src/utils/sse-parser.ts` | Server-Sent Events parser |
| `src/utils/token-counter.ts` | Token counting utility |
| `src/index.ts` | Barrel export |

### 4.8 Prisma Schema (1 file + 4 seeds) ✅

| File | Purpose |
|------|---------|
| `apps/api/prisma/schema.prisma` | 17 models, multi-tenant, soft-delete, versioned notes |
| `prisma/seeds/specialties.ts` | Seed clinical specialties |
| `prisma/seeds/permissions.ts` | Seed RBAC permissions |
| `prisma/seeds/demo-org.ts` | Demo organization + users |
| `prisma/seeds/index.ts` | Seed runner |

### 4.9 API — apps/api/src (10 files) ⚠️ **PARTIAL — missing server.ts + routes**

| File | Status | Purpose |
|------|--------|---------|
| `src/config/env.ts` | ✅ Done | Zod env validation (PORT=3100, HOST, DATABASE_URL, REDIS_URL, BI_IDENTITY_URL, MINIO, CORS) |
| `src/plugins/auth.ts` | ✅ Done | authPlugin (BI Identity SSO: reads `bi_auth` cookie, validates via Identity Service, find-or-create User by email), getAuthUser/requireAuth/requireAdmin deps |
| `src/plugins/tenant.ts` | ✅ Done | tenantPlugin, requireTenant, requirePermission({resource,action}) |
| `src/plugins/prisma.ts` | ✅ Done | Decorates app.prisma |
| `src/plugins/rate-limit.ts` | ✅ Done | 100 req/min (prod) / 1000 (dev) |
| `src/plugins/error-handler.ts` | ✅ Done | Zod→400, AppError→mapped, Fastify validation→400, unknown→500 (hide in prod), 404 handler |
| `src/types/fastify.d.ts` | ✅ Done | FastifyInstance + FastifyRequest type extensions |
| `src/utils/jwt-utils.ts` | ✅ Done | (legacy — no longer used; auth is BI Identity SSO) |
| `src/utils/prisma-client.ts` | ✅ Done | Global singleton PrismaClient |
| `src/utils/audit-log.ts` | ✅ Done | writeAuditLog function |
| `src/server.ts` | ❌ **MISSING** | Fastify entry point: create app, register plugins + routes, listen |
| `src/routes/auth.ts` | ❌ **REMOVED** | No local login/register/refresh routes — auth handled by BI Identity SSO at `/id/login` |
| `src/routes/patients.ts` | ❌ **MISSING** | GET/POST /patients, GET/PATCH/DELETE /patients/:id |
| `src/routes/sessions.ts` | ❌ **MISSING** | GET/POST /sessions, GET/PATCH /sessions/:id |
| `src/routes/organization.ts` | ❌ **MISSING** | GET/PATCH /organization |
| `src/routes/health.ts` | ❌ **MISSING** | GET /health, GET /health/ai |

### 4.10 Web — apps/web/src (6 files) ⚠️ **PARTIAL — missing pages + app shell**

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/api-client.ts` | ✅ Done | Full typed HTTP client (cookie-based auth via BI Identity SSO) |
| `src/lib/auth-context.tsx` | ✅ Done | AuthProvider (BI Identity SSO — redirects to `/id/login?redirect=/avesia/dashboard` when unauthenticated) |
| `src/lib/query-client.ts` | ✅ Done | QueryClient with defaults |
| `src/lib/utils.ts` | ✅ Done | cn() helper (clsx+twMerge) |
| `src/components/ui/button.tsx` | ✅ Done | shadcn Button component |
| `src/types/env.d.ts` | ✅ Done | VITE_API_URL type |
| `index.html` | ✅ Done | SPA shell (pt-BR) |
| `vite.config.ts` | ✅ Done | Vite config with proxy |
| `tailwind.config.ts` | ✅ Done | Tailwind with shadcn variables |
| `postcss.config.js` | ✅ Done | PostCSS plugins |
| `tsconfig.json` | ✅ Done | TS config |
| `src/main.tsx` | ❌ **MISSING** | React root, QueryClientProvider, AuthProvider, BrowserRouter, App, Toaster |
| `src/App.tsx` | ❌ **MISSING** | Route definitions |
| `src/index.css` | ❌ **MISSING** | Tailwind directives + shadcn CSS vars (light/dark) |
| `src/components/layout/Layout.tsx` | ❌ **MISSING** | Sidebar + header + main outlet |
| `src/components/layout/ProtectedRoute.tsx` | ❌ **MISSING** | Auth guard |
| `src/pages/LoginPage.tsx` | ❌ **MISSING** | Login form |
| `src/pages/DashboardPage.tsx` | ❌ **MISSING** | Stats + recent sessions |
| `src/pages/PatientsPage.tsx` | ❌ **MISSING** | CRUD table with search/filter |
| `src/pages/SessionsPage.tsx` | ❌ **MISSING** | CRUD table with filters |
| `src/pages/SettingsPage.tsx` | ❌ **MISSING** | Organization settings |

### 4.11 Worker — apps/worker/src (10 files) ⚠️ **PARTIAL — missing entry point**

| File | Status | Purpose |
|------|--------|---------|
| `src/config/env.ts` | ✅ Done | Zod env (PORT=3102, REDIS_URL, DATABASE_URL, AI_PROVIDER, API keys, heartbeat) |
| `src/queues/connection.ts` | ✅ Done | Redis connection singleton, BullMQ connection helper |
| `src/queues/transcription.queue.ts` | ✅ Done | Queue<TranscriptionJobData> |
| `src/queues/analysis.queue.ts` | ✅ Done | Queue<AnalysisJobData> |
| `src/queues/summary.queue.ts` | ✅ Done | Queue<SummaryJobData> |
| `src/queues/notes.queue.ts` | ✅ Done | Queue<NotesJobData> |
| `src/queues/index.ts` | ✅ Done | Re-exports |
| `src/services/ai-service.ts` | ✅ Done | AIService: analyze, generateSummary, generateNote, healthCheck using ProviderRouter |
| `src/services/db-service.ts` | ✅ Done | Prisma singleton |
| `src/utils/heartbeat.ts` | ✅ Done | HeartbeatManager (register, start, shutdown) |
| `src/utils/logger.ts` | ✅ Done | Pino logger |
| `src/prompts/templates.ts` | ✅ Done | Clinical prompt templates (SOAP, mood, risk, etc.) |
| `src/index.ts` | ❌ **MISSING** | Entry point: bootstrap workers, register processors, start heartbeat, health server, graceful shutdown |

---

## 5. Status Summary

| Component | Files | Status |
|-----------|-------|--------|
| **Root** (turbo, pnpm, git) | 8 | ✅ Complete |
| **Infra** (Docker, nginx, dev.sh) | 7 | ✅ Complete |
| **Docs** (architecture, decisions) | 2 (+ this) | ✅ Complete |
| **packages/config** | 6 | ✅ Complete |
| **packages/types** | 10 | ✅ Complete |
| **packages/shared** | 7 | ✅ Complete |
| **packages/ai-providers** | 14 | ✅ Complete (REAL providers) |
| **Prisma schema + seeds** | 5 | ✅ Complete (17 models) |
| **API plugins + utils** | 10 | ✅ Complete |
| **API server.ts + routes** | 6 | ❌ **MISSING** |
| **Web lib + infra** | 9 | ✅ Complete |
| **Web app shell + pages** | 9 | ❌ **MISSING** |
| **Worker services + queues** | 10 | ✅ Complete |
| **Worker index.ts** | 1 | ❌ **MISSING** |

**Total source files: ~80** ✅ Done — **~16 missing** ❌

---

## 6. Detailed Technical Specifications for Missing Code

### 6.1 API — `apps/api/src/server.ts`

```
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { env, corsOrigins, isProduction } from './config/env.js'
import { prismaPlugin } from './plugins/prisma.js'
import { authPlugin } from './plugins/auth.js'
import { tenantPlugin } from './plugins/tenant.js'
import { rateLimitPlugin } from './plugins/rate-limit.js'
import { errorHandlerPlugin } from './plugins/error-handler.js'
import patientRoutes from './routes/patients.js'
import sessionRoutes from './routes/sessions.js'
import organizationRoutes from './routes/organization.js'
import healthRoutes from './routes/health.js'

1. Create Fastify({ logger: true })
2. Register plugins in order:
   - cors (origin: corsOrigins)
   - helmet
   - prismaPlugin
   - authPlugin
   - tenantPlugin
   - rateLimitPlugin
   - errorHandlerPlugin
3. Register route modules with `app.register(routes, { prefix: '/avesia/api' })`:
   - healthRoutes → prefix: ''
   - patientRoutes → prefix: ''
   - sessionRoutes → prefix: ''
   - organizationRoutes → prefix: ''
4. Exception handler: GracefulShutdown via SIGTERM/SIGINT
5. await app.listen({ port: env.PORT, host: env.HOST })
```

**Route module pattern** (Fastify 5):
```ts
import type { FastifyPluginAsync } from 'fastify'

const patientRoutes: FastifyPluginAsync = async (app) => {
  app.get('/patients', { onRequest: [app.requireAuth], preHandler: [app.requireTenant] }, handler)
  app.post('/patients', { onRequest: [app.requireAuth], preHandler: [app.requireTenant, app.requirePermission({resource:'patients',action:'create'})] }, handler)
  // ...
}
export default patientRoutes
```
Note: requireAuth is a preHandler — it reads the `bi_auth` cookie, validates via BI Identity SSO, and sets request.userId/organizationId/role. No local auth routes (login/register/refresh) — those are handled by BI Identity at `/id/login`.

### 6.2 API — Route Specifications

#### Auth (BI Identity SSO — no local routes)
Auth is handled externally by BI Identity. The API auth plugin (`apps/api/src/plugins/auth.ts`) reads the `bi_auth` cookie and validates it via `http://bi-api:3300/api/auth/check`. If valid, the local User is find-or-created by email match via Prisma. There are no `/auth/login`, `/auth/register`, `/auth/refresh`, or `/auth/logout` routes in Avesia. Login happens at `/id/login` (BI Identity). The frontend redirects to `/id/login?redirect=/avesia/dashboard` when unauthenticated. Environment variable: `BI_IDENTITY_URL`.

#### Patients (`routes/patients.ts`)
All routes require `onRequest: [app.requireAuth]` + `preHandler: [app.requireTenant]`.
- **GET /patients**: Paginated list with search (fullName ILIKE), status filter, pagination (page/pageSize). Scoped to request.organizationId. Return `{ items: Patient[], page, pageSize, total }`.
- **GET /patients/:id**: FindUnique by id + organizationId. NotFoundError if missing.
- **POST /patients**: requirePermission({resource:'patients',action:'create'}). CreatePatientRequest. Check unique [orgId, email]. generateId for id.
- **PATCH /patients/:id**: requirePermission({resource:'patients',action:'update'}). Partial update.
- **DELETE /patients/:id**: requirePermission({resource:'patients',action:'delete'}). Soft delete (set deletedAt).

#### Sessions (`routes/sessions.ts`)
All routes require auth + tenant.
- **GET /sessions**: Paginated list with filters: patientId, professionalId, status, scheduledAt date range (from/to). Scoped to orgId.
- **GET /sessions/:id**: FindUnique or 404.
- **POST /sessions**: requirePermission('sessions','create'). CreateSessionRequest.
- **PATCH /sessions/:id**: requirePermission('sessions','update'). Partial update.

#### Organization (`routes/organization.ts`)
- **GET /organization**: requireAuth+requireTenant. FindUnique org by request.organizationId.
- **PATCH /organization**: requirePermission('organization','update'). UpdateOrganizationRequest.

#### Health (`routes/health.ts`)
- **GET /health**: `{ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() }`
- **GET /health/ai**: `{ status: 'ok' | 'error', provider: '...', timestamp }` (basic — pings no external service)

### 6.3 Web — Specifications

#### `src/main.tsx`
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/lib/auth-context'
import { queryClient } from '@/lib/query-client'
import App from '@/App'
import '@/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
```

#### `src/index.css`
- @tailwind base/components/utilities directives
- shadcn CSS custom properties (@layer base) for light and `.dark` themes:
  - --background, --foreground, --card, --card-foreground
  - --primary, --primary-foreground (clinical blue-ish: ~221.2 83.2% 53.3%)
  - --secondary, --muted, --accent, --destructive, --border, --input, --ring
  - --radius: 0.5rem
- Dark mode: `.dark` selector with same vars in darker shades
- Body: bg-background text-foreground, font-sans

#### `src/App.tsx`
- react-router-dom v7 Routes definition:
  ```
  <Routes>
    <Route element={<ProtectedRoute />}>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Route>
  </Routes>
  ```
- ProtectedRoute checks useAuth().isAuthenticated, redirects to `/id/login?redirect=/avesia/dashboard` if not

#### `src/components/layout/ProtectedRoute.tsx`
- Import AuthContext from auth-context
- If isLoading → show spinner (div with animate-spin)
- If !isAuthenticated → redirect to `/id/login?redirect=/avesia/dashboard` (BI Identity)
- Else → Outlet

#### `src/components/layout/Layout.tsx`
- Sidebar (left, fixed, w-64):
  - Logo/name "Avesia" at top
  - Nav links with icons (lucide-react): LayoutDashboard (/), Users (/patients), Calendar (/sessions), Settings (/settings)
  - Active link highlighted (useLocation)
- Header (top):
  - Page title (derive from route)
  - Right: user name + avatar (from AuthContext), dropdown with "Sair"
- Main: <Outlet /> with p-6, ml-64
- Mobile: hamburger toggle sidebar

#### `src/pages/LoginPage.tsx`
- No local login page — login is handled by BI Identity at `/id/login`
- When unauthenticated, the frontend redirects to `/id/login?redirect=/avesia/dashboard`
- This page may not exist; if it does, it should redirect to BI Identity

#### `src/pages/DashboardPage.tsx`
- useQuery for stats: api.patients.list({pageSize:1}) for total count, api.sessions.list() for counts
- 4 stat cards in grid: Total Pacientes, Sessões Hoje, Sessões da Semana, Sessões Realizadas
- Recent sessions table (last 5 from api.sessions.list({pageSize:5}))
- Each stat card: title, number, icon, background color

#### `src/pages/PatientsPage.tsx`
- Search bar (debounced) + status filter + "Novo Paciente" button
- Patient table columns: Nome, Email, Telefone, Status (badge), Ações (edit/delete buttons)
- Create patient dialog (Dialog from radix): form with name (required), email (optional), phone (optional), dateOfBirth (optional)
- Pagination at bottom
- useQuery for list, useMutation for create/update/delete
- Confirmation before delete

#### `src/pages/SessionsPage.tsx`
- Filters row: patient select (if patients loaded), status select, date range inputs
- Session table: Paciente, Tipo (badge), Data (formatted with date-fns), Status (badge), Duração, Local, Ações
- Create session dialog: patientId (select), scheduledAt (datetime), type (select: INICIAL/ACOMPANHAMENTO/EMERGÊNCIA), location (select: PRESENCIAL/VIDEO/TELEFONE), durationMinutes
- Pagination

#### `src/pages/SettingsPage.tsx`
- Organization name and slug display/edit
- useQuery for api.organization.get()
- useMutation for api.organization.update()
- Simple form with save button

### 6.4 Worker — `apps/worker/src/index.ts`

```
import { loadEnv } from './config/env.js'
import { AIService } from './services/ai-service.js'
import { getPrismaClient, disconnectPrisma } from './services/db-service.js'
import { loadProviderConfigFromEnv } from '@avesia/ai-providers'
import { getBullMQConnection, closeRedisConnection } from './queues/connection.js'
import { Worker } from 'bullmq'
import { QUEUE_NAMES } from '@avesia/shared'
import { HeartbeatManager } from './utils/heartbeat.js'
import { getLogger } from './utils/logger.js'
import Fastify from 'fastify'

1. loadEnv()
2. Initialize:
   - prisma = getPrismaClient()
   - providerConfig = loadProviderConfigFromEnv()
   - aiService = new AIService(providerConfig)
   - connection = getBullMQConnection()
3. Create BullMQ Workers (4):
   a. TranscriptionWorker:
      - Queue: QUEUE_NAMES.transcription ('transcription')
      - On job: Find SessionRecording by recordingId, update status to 'PROCESSING'
        → log "Transcription would process recording {id}" (placeholder — actual STT integration later)
        → update status to 'COMPLETED' or 'FAILED'
   b. AnalysisWorker:
      - Queue: QUEUE_NAMES.analysis ('analysis')
      - On job: Find Transcript by transcriptId, get content (or segments)
        → Call aiService.analyze(analysisType, transcriptContent)
        → Create AIAnalysis record with result (type, content, model, tokensUsed, status='COMPLETED')
        → Use prisma to create the record scoped to organizationId
   c. SummaryWorker:
      - Queue: QUEUE_NAMES.summarization ('summarization')
      - On job: Find ClinicalSession + related transcript/segments
        → Call aiService.generateSummary(transcriptContent)
        → Update session.summary
   d. NotesWorker:
      - Queue: QUEUE_NAMES.notesGeneration ('notes-generation')
      - On job: Find session + transcript
        → Call aiService.generateNote(context, noteType)
        → Create ClinicalNote record with status='DRAFT', content=result.content
4. Create HeartbeatManager(prisma, aiService.getRouter(), env.WORKER_ID, env.HEARTBEAT_INTERVAL_MS)
5. heartbeatManager.register() → heartbeatManager.start()
6. Create Fastify health server on port env.PORT (3102):
   - GET /health → { status: 'ok', workerId, activeProvider, local: router.isLocalWorkerOnline(), timestamp }
   - GET /health/ai → { status, provider, model, error? }
7. Graceful shutdown:
   - SIGTERM / SIGINT handler:
     - Close all workers: workers.forEach(w => w.close())
     - heartbeatManager.shutdown()
     - healthServer.close()
     - closeRedisConnection()
     - disconnectPrisma()
     - process.exit(0)
8. Log: logger.info({ workerId, port, provider }, 'Worker started')
```

**DB access pattern for worker processors:**
```ts
// Get prisma per job (the singleton is shared)
const prisma = getPrismaClient()
const session = await prisma.clinicalSession.findUnique({
  where: { id: job.data.sessionId },
  include: { ... }
})
```

---

## 7. Key Design Conventions

### Code Style
- **NO `any`** — use `unknown` with proper type guards
- **NO `enum`** — use `as const` objects + type alias (pattern: `const X = { A: 'A' } as const; type X = (typeof X)[keyof typeof X]`)
- **NO `@ts-ignore`** or `@ts-expect-error`
- **NO mock implementations** — real DB queries, real BI Identity SSO validation
- **ESM** everywhere — `"type": "module"`, imports with `.js` extension
- **Named exports** preferred, no default exports except route modules
- **Explicit return types** on all exported functions
- **`readonly`** on interfaces and props

### Architecture Conventions
- Multi-tenant: app-layer `organizationId` filter on every query (NO RLS yet)
- Soft delete: `deletedAt: DateTime?` on Organization, User, Professional, Patient
- Auth: BI Identity SSO (cookie-based) — reads `bi_auth` cookie, validates via Identity Service at `http://bi-api:3300/api/auth/check`, find-or-create User by email
- RBAC: OWNER > ADMIN > PROFESSIONAL. Permission table with [role, resource, action] unique
- AI: Local-first (Ollama) + cloud fallback (OpenRouter → NVIDIA NIM)
- Audit logging: immutable trail for all mutations
- Clinical notes: versioned (never overwrite, each edit creates new version)

### Port Mapping
| Service | Port |
|---------|------|
| Fastify API | 3100 |
| Vite Web | 3101 |
| BullMQ Worker | 3102 |
| PostgreSQL | 5433 |
| Redis | 6380 |
| MinIO API | 9100 |
| MinIO Console | 9101 |

### API Prefix
All API routes served under `/avesia/api`. Web Vite proxy rewrites `/avesia/api/*` to Fastify.

---

## 8. Design Decisions (ADRs from docs/decisions.md)

| ADR | Decision |
|-----|----------|
| 001 | pnpm + Turbo monorepo |
| 002 | Multi-tenant via app-layer filter + Postgres RLS |
| 003 | AI Provider abstraction with OpenAI-compatible base (native fetch, NO openai SDK) |
| 004 | Local worker with heartbeat + auto cloud fallback |
| 005 | LocalWorker table for heartbeat tracking |
| 006 | BI Identity SSO (cookie-based) — replaces JWT access/refresh rotation |
| 007 | Versioned clinical notes (no overwrite) |
| 008 | Soft delete for people entities |
| 009 | Branded IDs for domain identification |
| 010 | Result<T,E> pattern for business logic |
| 011 | Pino structured logging |
| 012 | Zod for all trust-boundary validation |
| 013 | String constants (NOT enum) for enumerations |
| 014 | Prisma with snake_case naming convention |

---

## 9. Data Model (17 Tables Summary)

| Table | Key Fields | Relationships |
|-------|-----------|--------------|
| `organizations` | slug (unique), status, settings, deletedAt | root tenant |
| `users` | [orgId, email] unique, passwordHash, role, status | → Organization |
| `specialties` | slug (unique), name, description | → Professional |
| `professionals` | userId (unique), specialtyId, license, deletedAt | → User, Specialty, Organization |
| `patients` | [orgId, email] unique, fullName, status, deletedAt | → Organization, ClinicalSession |
| `clinical_sessions` | patientId, professionalId, scheduledAt, status, type, location | → Organization, Patient, Professional |
| `session_recordings` | sessionId, storageKey, format, status | → Organization, Session |
| `transcripts` | recordingId, sessionId, status, language | → Organization, Recording, Session |
| `transcript_segments` | transcriptId, sequence (unique), speaker, text, start/endTime | → Transcript |
| `clinical_notes` | sessionId, patientId, versioned, SOAP content (JSON), status | → Organization, Session, Patient, User |
| `ai_analyses` | sessionId, type, provider, model, input/output (JSON), tokens | → Organization, Session, Transcript |
| `attachments` | sessionId/patientId, storageKey, type, mimeType | → Organization, Session, Patient, User |
| `consents` | patientId, type, granted, tracked by user | → Organization, Patient, User |
| `audit_logs` | userId, action, resource, immutable | → Organization, User |
| `refresh_tokens` | (legacy — no longer used with BI Identity SSO) | → Organization, User |
| `permissions` | [role, resource, action] unique | global |
| `local_workers` | workerId (unique), hostname, capabilities, status | → Organization (optional) |

---

## 10. API Routes Reference

### Auth (BI Identity SSO — no local routes)
Auth is handled by BI Identity. No `/auth/login`, `/auth/register`, `/auth/refresh`, or `/auth/logout` routes exist in Avesia. The auth plugin (`apps/api/src/plugins/auth.ts`) reads the `bi_auth` cookie and validates via `http://bi-api:3300/api/auth/check`. Login is at `/id/login` (BI Identity). Env var: `BI_IDENTITY_URL`.

### Patients
| Method | Path | Permission | Query | Response |
|--------|------|-----------|-------|----------|
| GET | /patients | read | ?search,status,page,pageSize | {items,page,pageSize,total} |
| GET | /patients/:id | read | — | Patient |
| POST | /patients | create | — | Patient |
| PATCH | /patients/:id | update | — | Patient |
| DELETE | /patients/:id | delete | — | 204 |

### Sessions
| Method | Path | Permission | Query | Response |
|--------|------|-----------|-------|----------|
| GET | /sessions | read | ?patientId,status,from,to,page,pageSize | {items,page,pageSize,total} |
| GET | /sessions/:id | read | — | ClinicalSession |
| POST | /sessions | create | — | ClinicalSession |
| PATCH | /sessions/:id | update | — | ClinicalSession |

### Organization
| Method | Path | Permission | Response |
|--------|------|-----------|----------|
| GET | /organization | read | Organization |
| PATCH | /organization | update | Organization |

### Health
| Method | Path | Response |
|--------|------|----------|
| GET | /health | {status, timestamp, uptime} |
| GET | /health/ai | {status, timestamp} |

---

## 11. AI Provider Architecture

```
ProviderRouter.getProvider()
  │
  ├── Ollama online? → return OllamaProvider
  │
  └── else → return createProvider(config.activeProvider)
                ├── 'openrouter' → OpenRouterProvider
                ├── 'nvidia-nim' → NvidiaNimProvider
                └── 'ollama' → OllamaProvider

All providers extend BaseOpenAICompatibleProvider
  → native fetch + SSE parser (no openai SDK)
  → retry with exponential backoff + jitter
  → token counter
```

**Env vars for AI:**
```
AI_PROVIDER=openrouter|nvidia-nim|ollama
OPENROUTER_API_KEY=sk-...
NVIDIA_NIM_API_KEY=nvapi-...
OLLAMA_BASE_URL=http://localhost:11434
```

---

## 12. Development Setup

```bash
# Start infra (PostgreSQL, Redis, MinIO)
docker compose up -d

# Install dependencies
pnpm install

# Generate Prisma client
pnpm --filter @avesia/api db:generate

# Run migrations
pnpm --filter @avesia/api db:migrate

# Seed database
pnpm --filter @avesia/api db:seed

# Start API in dev mode
pnpm --filter @avesia/api dev

# Start Web in dev mode
pnpm --filter @avesia/web dev

# Start Worker in dev mode
pnpm --filter @avesia/worker dev
```

**Ports after starting:**
- API: http://localhost:3100
- Web: http://localhost:3101
- Worker: http://localhost:3102
- PG: localhost:5433
- Redis: localhost:6380
- MinIO: localhost:9100 (API), localhost:9101 (Console)

---

## 13. Critical Constraints (MUST Follow)

1. **NO `any` type** — use `unknown` + proper typing
2. **NO `enum`** — use `as const` objects
3. **NO `@ts-ignore`** or `@ts-expect-error`
4. **NO mock implementations** — real database queries, real BI Identity SSO validation
5. **ESM** — `.js` extensions in imports, `"type": "module"`
6. **Real AI providers** only — OpenRouter, NVIDIA NIM, Ollama. No fake provider.
7. **Shadcn UI patterns** — cva, radix primitives, Tailwind CSS variables
8. **pt-BR** locale, Brazilian LGPD compliance context

---

## 14. Next Steps for Continuation

### Immediate (should take 1 session):
1. Write `server.ts` + 5 route files (API) — ~400 lines
2. Write `main.tsx`, `App.tsx`, `index.css`, Layout, ProtectedRoute, 5 pages (Web) — ~800 lines
3. Write `index.ts` with 4 workers + health server (Worker) — ~250 lines
4. `pnpm install` → `prisma generate` → typecheck all 3 apps
5. `docker compose up` + migrate + seed → manual E2E test

### Near future:
6. Integration tests
7. Session recording upload flow (MinIO)
8. Transcription integration (Whisper/STT)
9. WebSocket for real-time updates
10. Production deployment (docker-compose.prod.yml)
11. Monitoring (health check endpoints exist but need dashboard)
