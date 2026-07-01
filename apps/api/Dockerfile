# =============================================================================
# apps/api/Dockerfile — Multi-stage build for Avesia API (Fastify)
#
# Stages:  deps → build → runtime
# Runtime: Node 22 Alpine, dumb-init, non-root, minimal
# =============================================================================

# ── Stage 1: deps ──────────────────────────────────────────────────────────────
# Install all workspace dependencies (including devDeps for build).
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.32.0 --activate

# Copy workspace root files needed for resolution
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile || pnpm install

# ── Stage 2: build ─────────────────────────────────────────────────────────────
# Compile TypeScript to dist/.
FROM deps AS build
WORKDIR /app

# Copy full source for all workspace packages the API depends on
COPY tsconfig*.json ./
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/

# Build shared packages first, then API
RUN pnpm --filter "@avesia/..." build || pnpm --filter @avesia/api build || npx tsc -p apps/api/tsconfig.json

# Prune dev dependencies for lean production image
RUN pnpm prune --prod

# ── Stage 3: runtime ───────────────────────────────────────────────────────────
# Minimal image: only compiled code + production node_modules.
FROM node:22-alpine AS runtime

# dumb-init handles signals correctly (PID 1)
RUN apk add --no-cache dumb-init wget

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S avesia -u 1001 -G nodejs

# Copy built artifacts
COPY --from=build --chown=avesia:nodejs /app/apps/api/dist ./dist
COPY --from=build --chown=avesia:nodejs /app/apps/api/package.json ./package.json
COPY --from=build --chown=avesia:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=avesia:nodejs /app/apps/api/prisma ./prisma

USER avesia

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --spider -q http://localhost:3100/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
