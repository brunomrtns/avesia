# =============================================================================
# apps/web/Dockerfile — Multi-stage build for Avesia Web (Vite React SPA)
#
# Stage 1: build Vite SPA → dist/
# Stage 2: nginx:1.27-alpine serves static files on port 3101
# =============================================================================

# ── Stage 1: build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.32.0 --activate

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile || pnpm install

# Copy full source
COPY tsconfig*.json ./
COPY apps/web/ ./apps/web/
COPY packages/ ./packages/

# Build SPA (Vite outputs to apps/web/dist)
RUN pnpm --filter "@avesia/..." build || pnpm --filter @avesia/web build || npx vite build --config apps/web/vite.config.ts

# ── Stage 2: runtime (nginx) ──────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

RUN echo 'server {\n\
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
}' > /etc/nginx/conf.d/spa.conf

EXPOSE 3101

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --spider -q http://localhost:3101 || exit 1
