# ADR — Architecture Decision Records

> Each record captures a decision, its context, and consequences.
> Format: **ADR-XXX** — Title (Status: Proposed|Accepted|Superseded)

---

## ADR-001 — Monorepo with pnpm workspaces + Turborepo

**Status**: Accepted

**Context**: System has 3 deployables (api, web, worker) and 5+ shared packages. Need code sharing, atomic cross-package changes, and consistent tooling.

**Decision**: pnpm workspaces + Turborepo. Packages referenced via `workspace:*` protocol.

**Alternatives considered**:
- Nx: heavier, more config, no clear benefit at this scale
- Single repo with shared dir: no workspace isolation, dependency hell

**Consequences**: (+) Atomic cross-package commits. (+) Turborepo caching speeds CI. (−) All apps share one git history. (−) Slightly more complex CI (must build deps first).

---

## ADR-002 — Multi-tenant via Row-Level Security + App-Layer Filter

**Status**: Accepted

**Context**: LGPD requires absolute tenant isolation. Single bug in a WHERE clause could leak clinical data between clinics.

**Decision**: Two-layer defense:
1. **App layer**: Prisma client extension auto-injects `organizationId` filter on every query (derived from JWT).
2. **DB layer**: PostgreSQL Row-Level Security (RLS) policies enforce `organization_id = current_setting('app.current_org')` even if app layer is bypassed.

**Alternatives considered**:
- App-layer only: single bug = data leak. Unacceptable for clinical data.
- Schema-per-tenant: operationally expensive at scale, complex migrations.
- Database-per-tenant: overkill for POC, cost-prohibitive.

**Consequences**: (+) Defense in depth — app bug alone cannot leak data. (+) Clean mental model for developers. (−) RLS policies require Prisma `previewFeatures = ["postgis"]`-style raw SQL for policy creation. (−) Performance: RLS adds ~5% overhead on queries (acceptable).

---

## ADR-003 — Specialty as Entity, NOT Enum

**Status**: Accepted

**Context**: Spec mandates architecture prepared for expansion beyond Psychology. Hardcoding `PSYCHOLOGY` enum in schema would force migrations per specialty.

**Decision**: `Specialty` is a database entity (table). Psychology seeded as initial record. Each `Professional` links to a `Specialty`.

**Consequences**: (+) Add Psychiatry/Nutrition = INSERT, not migration. (+) Per-specialty metadata possible. (−) One JOIN per query involving specialty (negligible).

---

## ADR-004 — AI Provider Abstraction with OpenAI-Compatible Base

**Status**: Accepted

**Context**: Spec requires swappable AI providers (OpenRouter, NIM, Ollama, OpenAI, Gemini, vLLM, LM Studio). No module may depend on a specific model.

**Key Insight**: OpenRouter, NVIDIA NIM, and Ollama all expose **OpenAI-compatible** REST APIs (`/v1/chat/completions`). Building 3 separate clients is wasteful.

**Decision**:
1. Define `AIProvider` interface (`chat`, `chatStream`, `healthCheck`).
2. Implement `BaseOpenAICompatibleProvider` — shared HTTP client using native `fetch`.
3. `OpenRouterProvider`, `NvidiaNimProvider`, `OllamaProvider` extend base, differing only in auth headers + base URL + default models.
4. `ProviderRouter` selects active provider based on config + local worker availability.
5. **NO `openai` npm package** — raw HTTP for full control and zero dep creep.

**Alternatives considered**:
- `openai` npm SDK: heavy, opinionated, hard to extend for non-OpenAI quirks.
- LangChain: massive overkill, hides details, poor TS types.

**Consequences**: (+) Adding Gemini/vLLM later = new class extending base. (+) Streaming via SSE works uniformly. (+) Zero vendor lock-in. (−) Must maintain our own SSE parser (~50 lines).

---

## ADR-005 — Local Worker with Heartbeat + Automatic Cloud Fallback

**Status**: Accepted

**Context**: Local Ollama is preferred (free, private) but not always online. System must not break when local worker is down.

**Decision**:
1. Local worker registers heartbeat to API every 5s via WebSocket.
2. `ProviderRouter` tracks heartbeat freshness (offline if >15s stale).
3. On AI request: if local worker alive → route to Ollama; else → fall back to configured cloud provider (OpenRouter or NIM).
4. **Fallback logic lives ONLY in `ProviderRouter`** — rest of system never knows.

**Consequences**: (+) Best-effort local execution with zero downtime. (+) Cost optimization (local when possible). (−) Latency variance between local/cloud — caller must handle timeouts.

---

## ADR-006 — Auth: JWT Access + Refresh Token Rotation

**Status**: Accepted

**Context**: Need stateless auth with revocation capability for compromised sessions.

**Decision**:
- **Access token**: JWT, 15min TTL, contains `{sub, orgId, role}`. Verified statelessly.
- **Refresh token**: JWT, 7d TTL, stored in DB (hash). On refresh: old token invalidated, new token issued (rotation).
- **Reuse detection**: if a rotated refresh token is presented again → entire token family revoked (assumed stolen).
- Web client stores tokens in **HttpOnly + Secure + SameSite=Lax** cookies.

**Consequences**: (+) Stateless access verification (no DB hit). (+) Stolen refresh tokens are self-healing via rotation. (−) Refresh token rotation requires DB write per refresh.

---

## ADR-007 — Clinical Note Versioning via Self-Reference

**Status**: Accepted

**Context**: Spec mandates "never overwrite previous versions" for clinical notes. Medical record integrity is a legal requirement.

**Decision**:
- Each edit creates a new `ClinicalNote` row with incremented `version` and `previousVersionId` pointing to the prior version.
- `@@unique([sessionId, version])` prevents version collision.
- Only `DRAFT` notes are editable in place. `FINALIZED` is immutable.
- Query for "latest note of session X" = `ORDER BY version DESC LIMIT 1`.

**Alternatives considered**:
- JSONB diff column: unreadable, hard to audit.
- Separate `_versions` table: same data, more indirection.

**Consequences**: (+) Full audit trail as first-class records. (+) Easy diff between versions. (−) Storage grows linearly with edits (acceptable; notes are small text).

---

## ADR-008 — Soft Delete + Field-Level Encryption for Sensitive Data

**Status**: Accepted

**Context**: LGPD requires data deletion capability AND audit trail. Hard delete loses audit trail; soft delete preserves it.

**Decision**:
- Most entities: `deletedAt DateTime?` — query filter excludes non-null by default via Prisma extension.
- Sensitive fields (patient name, document numbers): encrypted at rest using `pgcrypto` extension.
- LGPD "right to erasure": set `deletedAt` + anonymize encrypted fields (keep ID + timestamps for audit).

**Consequences**: (+) Reversible deletes. (+) Audit-compliant. (−) Index must include `deletedAt IS NULL` filter. (−) Encryption adds ~1ms per field on read/write.

---

## ADR-009 — WebSocket via @fastify/websocket (Single Process)

**Status**: Accepted

**Context**: Need real-time updates for session progress, transcription streaming, AI insights.

**Decision**: Use `@fastify/websocket` within the API process (no separate WS server). Channels keyed by `organizationId` + `sessionId`.

**Alternatives considered**:
- Socket.IO: heavier, requires sticky sessions, adapter for horizontal scale.
- Separate WS gateway service: overkill at POC scale.

**Consequences**: (+) Shares auth/middleware with REST API. (+) One process to deploy. (−) For horizontal scaling later, need Redis adapter (documented, not implemented yet).

---

## ADR-010 — BullMQ for Async AI Pipeline

**Status**: Accepted

**Context**: Transcription, summarization, analysis are long-running (seconds to minutes). Must not block API responses.

**Decision**: BullMQ queues on Redis. Worker process consumes jobs. API publishes + exposes status via WebSocket.

**Queues**:
- `transcription` — audio → transcript
- `analysis` — transcript → AIAnalysis (topics, keywords, insights)
- `summarization` — transcript → summary
- `notes-generation` — transcript → draft clinical note

**Consequences**: (+) Decouples AI latency from API. (+) Retries + backoff built-in. (−) Operational complexity (worker process + Redis required).

---

## ADR-011 — Result<T, E> Pattern for Domain Errors

**Status**: Accepted

**Context**: Throwing exceptions for expected business outcomes (patient not found, validation failed) conflates control flow with error handling. Stack traces are expensive and misleading.

**Decision**: Domain layer returns `Result<T, E>` instead of throwing. HTTP layer maps `E` to appropriate status code.

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

**Scope**: Domain services, repository results. NOT for truly exceptional cases (DB connection lost, OOM) — those throw.

**Consequences**: (+) Explicit error handling at boundaries. (+) No try/catch noise in business logic. (−) Verbose call sites (`.map`/`.flatMap`).

---

## ADR-012 — Zod at Runtime Boundaries Only

**Status**: Accepted

**Context**: TypeScript types are compile-time only. External data (HTTP, env, WS messages) needs runtime validation.

**Decision**: Zod schemas at every system boundary: incoming HTTP requests, env var loading, WebSocket messages, AI provider responses. Internal code trusts typed data (no double-validation).

**Consequences**: (+) Single source of truth (Zod schema → TS type via `z.infer`). (+) Fail-fast on bad data. (−) Small perf cost at boundaries (negligible).

---

## ADR-013 — Const Objects over TypeScript `enum`

**Status**: Accepted

**Context**: TS `enum` has known issues: runtime overhead, incompatibility with `isolatedModules`, nominal typing prevents union tricks.

**Decision**: Use `const` objects with `as const` assertion + derived union type.

```typescript
export const Role = { OWNER: 'OWNER', ADMIN: 'ADMIN', PROFESSIONAL: 'PROFESSIONAL' } as const;
export type Role = (typeof Role)[keyof typeof Role];
```

**Consequences**: (+) Zero runtime overhead. (+) Plays well with tree-shaking. (+) Native JSON serialization. (−) Slightly more boilerplate.

---

## ADR-014 — Naming and Port Allocation (Avesia on shared VPS)

**Status**: Accepted

**Context**: Avesia co-exists with trivestia on the same VPS (`brunointegrations.com`). Must avoid resource conflicts.

**Decision**:
| Resource | Avesia | Trivestia (existing) |
|---|---|---|
| Container prefix | `avesia-*` | `trivestia-*` |
| Network | `avesia-net` | `trivestia-net` |
| URL prefix | `/avesia/` | `/trivestia/` |
| API internal port | 3100 | 3001 |
| Worker internal port | 3102 | (chat: 3002) |
| PostgreSQL host port (dev) | 5433 | 5432 |
| Redis host port (dev) | 6380 | 6379 |
| MinIO port | 9100/9101 | (trivestia: 9000) |
| VPS path | `/opt/avesia/` | `/opt/trivestia/` |
| DB name | `avesia` | `trivestia_db` |

**Consequences**: (+) Clean isolation. (+) Independent deploy/restart. (−) Must add new nginx location block to existing config for `/avesia/` route.
