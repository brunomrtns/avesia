# =============================================================================
# apps/web/Dockerfile — Multi-stage build for Avesia Web (Vite React SPA)
#
# Stage 1: build Vite SPA → dist/ (with /avesia/ base path)
# Stage 2: nginx:1.27-alpine serves static files on port 3101
# =============================================================================

# ── Stage 1: build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.32.0 --activate

# Copy workspace root files + all source
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY apps/web/ ./apps/web/
COPY packages/ ./packages/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Build packages manually in dependency order
# (pnpm -r has issues with .tsbuildinfo caching in Docker)
RUN cd packages/types && pnpm exec tsc -p tsconfig.json
RUN cd packages/shared && pnpm exec tsc -p tsconfig.json
RUN cd packages/ai-providers && pnpm exec tsc -p tsconfig.build.json || true
RUN cd packages/ai-core && pnpm exec tsc -p tsconfig.build.json || true

# Build the web app with NODE_ENV=production (sets base: '/avesia/')
RUN cd apps/web && NODE_ENV=production pnpm exec vite build

# Verify dist was created
RUN ls -la /app/apps/web/dist/

# ── Stage 2: runtime (nginx) ──────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

RUN printf 'server {\n\
    listen 3101;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/spa.conf

EXPOSE 3101

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3101 || exit 1
