# =============================================================================
# apps/api/Dockerfile — Multi-stage build for Avesia API (Fastify)
#
# Stages:  build (install + compile) → runtime (clean prod install)
# Runtime: Node 22 Alpine, dumb-init, non-root, minimal
# =============================================================================

# ── Stage 1: build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.32.0 --activate
RUN apk add --no-cache openssl

# Copy workspace root files + all source
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/

# Install all workspace dependencies (including devDeps for build)
RUN pnpm install --frozen-lockfile || pnpm install

# Build packages manually in dependency order
# (pnpm -r has issues with .tsbuildinfo caching in Docker)
RUN cd packages/types && pnpm exec tsc -p tsconfig.json
RUN cd packages/shared && pnpm exec tsc -p tsconfig.json
RUN cd packages/ai-providers && pnpm exec tsc -p tsconfig.build.json || true
RUN cd packages/ai-core && pnpm exec tsc -p tsconfig.build.json || true

# Generate Prisma client (must run before tsc so generated types exist)
RUN cd apps/api && pnpm exec prisma generate

# Build the API
RUN cd apps/api && pnpm exec tsc -p tsconfig.json

# Verify dist was created
RUN ls -la /app/apps/api/dist/

# ── Stage 2: runtime ───────────────────────────────────────────────────────────
# Clean install of production dependencies only.
FROM node:22-alpine AS runtime

RUN apk add --no-cache dumb-init wget openssl
RUN corepack enable && corepack prepare pnpm@10.32.0 --activate

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S avesia -u 1001 -G nodejs

# Copy workspace root files for pnpm resolution
COPY --chown=avesia:nodejs package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY --chown=avesia:nodejs apps/api/package.json ./apps/api/
COPY --chown=avesia:nodejs packages/ ./packages/

# Copy built artifacts from build stage
COPY --chown=avesia:nodejs --from=build /app/apps/api/dist ./apps/api/dist
COPY --chown=avesia:nodejs --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --chown=avesia:nodejs --from=build /app/packages/types/dist ./packages/types/dist
COPY --chown=avesia:nodejs --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --chown=avesia:nodejs --from=build /app/packages/ai-providers/dist ./packages/ai-providers/dist
COPY --chown=avesia:nodejs --from=build /app/packages/ai-core/dist ./packages/ai-core/dist

# Install only production dependencies
ENV CI=true
ENV NODE_ENV=production
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

# Generate Prisma client in runtime (needs the schema)
RUN cd apps/api && pnpm exec prisma generate

USER avesia

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD wget --spider -q http://127.0.0.1:3100/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/server.js"]
