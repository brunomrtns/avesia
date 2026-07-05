#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy do Avesia para a VPS (atualização completa)
#
# Uso:  ./deploy.sh [--build-only] [--no-build] [--migrate-only] [--no-commit]
#                   [--bump patch|minor|major]
#
# O que faz:
#   0. Verifica working tree limpa (ou commita automaticamente)
#   1. Sincroniza o código do repo local para /opt/avesia na VPS (via rsync)
#   2. Builda as 3 imagens Docker na VPS (api, web, worker)
#   3. Sobe a stack com docker compose (recreate dos containers alterados)
#   4. Roda Prisma migrations
#   5. Reinicia o AI Gateway
#   6. Reinicia o trivestia-nginx
#   7. Smoke test: verifica se API e Web respondem
#   8. Se OK: bump de versão + commit + tag vX.Y.Z + push
#
# Versionamento (semver):
#   --bump patch  (default) — bug fixes, pequenas mudanças
#   --bump minor          — novas features, backward compatible
#   --bump major          — breaking changes
#
# Pré-requisitos:
#   - my-vps instalado e configurado
#   - Docker + Docker Compose na VPS
#   - .env.prod com as variáveis de produção
# =============================================================================

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
VPS_PATH="/opt/avesia"

# ── Verificar my-vps ─────────────────────────────────────────────────────────
if ! command -v my-vps &>/dev/null; then
  echo -e "\033[1;31m  ✗\033[0m 'my-vps' não encontrado. Instale my-vps antes de fazer deploy." >&2
  exit 1
fi

# Helper: executar comando remoto na VPS via my-vps
vps() {
  my-vps --no-lock "$@"
}

# Helper: copiar arquivo local para VPS via my-vps
vps_cp() {
  my-vps --no-lock --scp "$1" "$2"
}

log() { echo -e "\033[1;34m[deploy]\033[0m $*"; }
ok()  { echo -e "\033[1;32m  ✓\033[0m $*"; }
err() { echo -e "\033[1;31m  ✗\033[0m $*" >&2; }

# ── Argumentos ───────────────────────────────────────────────────────────────
BUILD_ONLY=0
NO_BUILD=0
MIGRATE_ONLY=0
NO_COMMIT=0
AUTO_COMMIT=0
BUMP="patch"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-only)   BUILD_ONLY=1;  shift ;;
    --no-build)     NO_BUILD=1;    shift ;;
    --migrate-only) MIGRATE_ONLY=1; shift ;;
    --no-commit)    NO_COMMIT=1;   shift ;;
    --auto-commit)  AUTO_COMMIT=1; shift ;;
    --bump)         BUMP="$2";     shift 2 ;;
    -h|--help)
      echo "Uso: ./deploy.sh [opções]"
      echo ""
      echo "  --build-only       Só builda as imagens, não sobe containers"
      echo "  --no-build         Pula o build (usa imagens existentes)"
      echo "  --migrate-only     Só roda migrations"
      echo "  --no-commit        Não commita/bumpa versão após deploy"
      echo "  --auto-commit      Commita mudanças não-commitadas antes do deploy"
      echo "  --bump patch|minor|major  Tipo de bump (default: patch)"
      exit 0
      ;;
    *) echo "Argumento desconhecido: $1"; exit 1 ;;
  esac
done

# ── Helpers de versionamento ─────────────────────────────────────────────────

get_version() {
  node -p "require('./package.json').version"
}

bump_version() {
  local current="$1" type="$2"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$current"
  case "$type" in
    major)  major=$((major + 1)); minor=0; patch=0 ;;
    minor)  minor=$((minor + 1)); patch=0 ;;
    patch)  patch=$((patch + 1)) ;;
  esac
  echo "${major}.${minor}.${patch}"
}

# ── Step 0: Verificar working tree ───────────────────────────────────────────
log "Verificando pré-requisitos..."

if [[ "$MIGRATE_ONLY" -eq 0 ]]; then
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    if [[ "$AUTO_COMMIT" -eq 1 ]]; then

      # ── Safety: block sensitive files ──────────────────────────────────────
      SENSITIVE=$(git status --porcelain | awk '{print $2}' | grep -iE '\.env($|\.|[^.])|secret|\.pem|\.key|id_rsa|id_ed25519|credentials|\.p12|\.pfx' || true)
      if [[ -n "$SENSITIVE" ]]; then
        err "Arquivos sensíveis detectados — auto-commit abortado:"
        echo "$SENSITIVE" | sed 's/^/    /'
        echo ""
        echo "  Commite manualmente após revisar:"
        echo "    git add -A && git commit -m 'sua mensagem'"
        exit 1
      fi

      # ── Generate semantic commit message ───────────────────────────────────
      CHANGED_FILES=$(git status --porcelain | awk '{print $2}')
      CHANGES=$(echo "$CHANGED_FILES" | wc -l)
      log "Auto-commitando $CHANGES arquivo(s) modificado(s)..."

      # Categorize changes
      HAS_FRONTEND=$(echo "$CHANGED_FILES" | grep -qE '^apps/web/' && echo 1 || echo 0)
      HAS_BACKEND=$(echo "$CHANGED_FILES" | grep -qE '^apps/api/' && echo 1 || echo 0)
      HAS_WORKER=$(echo "$CHANGED_FILES" | grep -qE '^apps/worker-python/' && echo 1 || echo 0)
      HAS_PACKAGES=$(echo "$CHANGED_FILES" | grep -qE '^packages/' && echo 1 || echo 0)
      HAS_MIGRATIONS=$(echo "$CHANGED_FILES" | grep -qE 'migrations/' && echo 1 || echo 0)
      HAS_CONFIG=$(echo "$CHANGED_FILES" | grep -qE 'deploy\.sh|docker-compose|Dockerfile|\.gitignore|package\.json|tsconfig|eslint|\.npmrc' && echo 1 || echo 0)
      HAS_DOCS=$(echo "$CHANGED_FILES" | grep -qE '\.md$' && echo 1 || echo 0)

      # Build scope list
      SCOPES=()
      [[ "$HAS_FRONTEND" -eq 1 ]] && SCOPES+=("frontend")
      [[ "$HAS_BACKEND" -eq 1 ]] && SCOPES+=("backend")
      [[ "$HAS_WORKER" -eq 1 ]] && SCOPES+=("worker")
      [[ "$HAS_PACKAGES" -eq 1 ]] && SCOPES+=("packages")
      [[ "$HAS_MIGRATIONS" -eq 1 ]] && SCOPES+=("migrations")
      [[ "$HAS_CONFIG" -eq 1 ]] && SCOPES+=("config")
      [[ "$HAS_DOCS" -eq 1 ]] && SCOPES+=("docs")
      SCOPE_STR=$(IFS=', '; echo "${SCOPES[*]}")

      # Build file summary (top 5 files, truncated)
      FILE_SUMMARY=$(echo "$CHANGED_FILES" | head -5 | sed 's/^/  - /')
      REMAINING=$((CHANGES - 5))
      if [[ "$REMAINING" -gt 0 ]]; then
        FILE_SUMMARY="$FILE_SUMMARY
  - ... e mais $REMAINING arquivo(s)"
      fi

      git add -A
      git commit -m "$(cat <<EOF
chore(${SCOPE_STR}): pre-deploy auto-commit

Arquivos modificados:
$FILE_SUMMARY


EOF
)"
      ok "Mudanças commitadas (scope: ${SCOPE_STR})"
    else
      err "Working tree não está limpa. Commite suas mudanças antes do deploy."
      echo ""
      git status --short
      echo ""
      echo "  Para commitar manualmente:"
      echo "    git add -A && git commit -m 'sua mensagem'"
      echo ""
      echo "  Ou use --auto-commit (analisa mudanças e commita automaticamente):"
      echo "    ./deploy.sh --auto-commit"
      exit 1
    fi
  else
    ok "Working tree limpa"
  fi
fi

# Versão atual
CURRENT_VERSION=$(get_version)
log "Versão atual: v$CURRENT_VERSION"

# Criar tag de rollback antes de qualquer coisa
DEPLOY_TAG="pre-deploy-$(date +%Y%m%d-%H%M%S)"
if git rev-parse --git-dir &>/dev/null; then
  git tag "$DEPLOY_TAG" 2>/dev/null && ok "Tag de rollback criada: $DEPLOY_TAG" || true
fi

if [[ ! -f "$SCRIPT_DIR/.env.prod" ]]; then
  err ".env.prod não encontrado em $SCRIPT_DIR"
  exit 1
fi

if [[ ! -f "$SCRIPT_DIR/docker-compose.prod.yml" ]]; then
  err "docker-compose.prod.yml não encontrado"
  exit 1
fi

# Verificar conectividade com VPS via my-vps
if ! vps "echo ok" &>/dev/null; then
  err "Não foi possível conectar à VPS via my-vps"
  exit 1
fi
ok "Conexão com VPS OK (via my-vps)"

# ── Migrate only ─────────────────────────────────────────────────────────────
if [[ "$MIGRATE_ONLY" -eq 1 ]]; then
  log "Modo: migrations apenas"
  POSTGRES_USER=$(grep '^POSTGRES_USER=' "$SCRIPT_DIR/.env.prod" | cut -d= -f2-)
  POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$SCRIPT_DIR/.env.prod" | cut -d= -f2-)
  POSTGRES_DB=$(grep '^POSTGRES_DB=' "$SCRIPT_DIR/.env.prod" | cut -d= -f2-)
  # Fix renamed migration directories (idempotent)
  vps "docker run --rm --network avesia-net \
    -e PGPASSWORD='${POSTGRES_PASSWORD}' \
    avesia-postgres:latest \
    psql -h avesia-postgres -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' -c \"
      UPDATE _prisma_migrations SET migration_name = '20260818000001_storage_key_nullable' WHERE migration_name = '20260705000001_storage_key_nullable';
      UPDATE _prisma_migrations SET migration_name = '20260818000002_data_retention' WHERE migration_name = '20260705000002_data_retention';
    \" 2>/dev/null || true"
  vps "docker run --rm --network avesia-net \
    -e DATABASE_URL='postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@avesia-postgres:5432/${POSTGRES_DB}?schema=public' \
    -v $VPS_PATH/apps/api/prisma:/app/apps/api/prisma:ro \
    -w /app/apps/api avesia-api:latest \
    sh -c 'node \$(find /app/node_modules/.pnpm -path \"*/prisma/build/index.js\" | head -1) migrate deploy' 2>&1"
  ok "Migrations aplicadas"
  exit 0
fi

# ── Step 1: Sincronizar código ───────────────────────────────────────────────
log "Step 1/7: Sincronizando código para VPS..."

vps "mkdir -p $VPS_PATH/{apps/api/prisma/seeds,apps/web/src,apps/worker-python/src,packages,scripts}"

RSYNC_EXCLUDES="--exclude=.git --exclude=node_modules --exclude=**/node_modules --exclude=**/dist --exclude=**/.turbo --exclude=**/coverage --exclude=**/__pycache__ --exclude='**/*.tsbuildinfo' --exclude=.env --exclude=.env.local --exclude=.env.prod --exclude=.env-worker-local --exclude=.turbo --exclude=.devin --exclude=.claude --exclude=apps/worker-python/.venv --exclude='*.log' --exclude=deploy.sh --exclude=dev.sh --exclude=DEPLOY.md --exclude=AGENTS.md --exclude=README.md --exclude=.dockerignore --exclude=test-results --exclude=playwright-report"

if command -v rsync &>/dev/null; then
  my-vps --no-lock --rsync "$SCRIPT_DIR/" "$VPS_PATH/" --rsync-args "$RSYNC_EXCLUDES --delete" 2>&1 || {
    log "rsync falhou — usando tar"
    tar czf - --exclude='.git' --exclude='node_modules' --exclude='**/node_modules' \
      --exclude='**/dist' --exclude='**/.turbo' --exclude='**/*.tsbuildinfo' \
      --exclude='.env' --exclude='.env.local' --exclude='.env.prod' --exclude='.env-worker-local' \
      --exclude='apps/worker-python/.venv' --exclude='*.log' \
      --exclude='deploy.sh' --exclude='dev.sh' --exclude='DEPLOY.md' \
      --exclude='AGENTS.md' --exclude='README.md' \
      -C "$SCRIPT_DIR" . | my-vps --no-lock "tar xzf - -C $VPS_PATH"
  }
  ok "Código sincronizado via rsync"
else
  log "rsync não disponível — usando tar"
  tar czf - --exclude='.git' --exclude='node_modules' --exclude='**/node_modules' \
    --exclude='**/dist' --exclude='**/.turbo' --exclude='**/*.tsbuildinfo' \
    --exclude='.env' --exclude='.env.local' --exclude='.env.prod' --exclude='.env-worker-local' \
    --exclude='apps/worker-python/.venv' --exclude='*.log' \
    --exclude='deploy.sh' --exclude='dev.sh' --exclude='DEPLOY.md' \
    --exclude='AGENTS.md' --exclude='README.md' \
    -C "$SCRIPT_DIR" . | my-vps --no-lock "tar xzf - -C $VPS_PATH"
  ok "Código sincronizado via tar"
fi

# ── Step 2: Sincronizar .env ─────────────────────────────────────────────────
log "Step 2/7: Sincronizando .env..."
vps_cp "$SCRIPT_DIR/.env.prod" "$VPS_PATH/.env"
ok ".env sincronizado"

# ── Step 3: Build das imagens ────────────────────────────────────────────────
if [[ "$NO_BUILD" -eq 0 ]]; then
  log "Step 3/7: Buildando imagens Docker na VPS..."

  log "  Buildando avesia-api..."
  vps "cd $VPS_PATH && docker build -f apps/api/Dockerfile -t avesia-api:latest . 2>&1 | tail -5"
  ok "avesia-api buildada"

  log "  Buildando avesia-web..."
  vps "cd $VPS_PATH && docker build -f apps/web/Dockerfile -t avesia-web:latest . 2>&1 | tail -5"
  ok "avesia-web buildada"

  log "  Buildando avesia-worker..."
  vps "cd $VPS_PATH && docker build -f apps/worker-python/Dockerfile -t avesia-worker:latest . 2>&1 | tail -5"
  ok "avesia-worker buildada"
else
  log "Step 3/7: Build pulado (--no-build)"
fi

if [[ "$BUILD_ONLY" -eq 1 ]]; then
  log "Modo build-only — containers não serão reiniciados"
  exit 0
fi

# ── Step 4: Subir a stack ────────────────────────────────────────────────────
log "Step 4/7: Subindo stack com docker compose..."
vps "cd $VPS_PATH && docker compose -f docker-compose.prod.yml up -d 2>&1 | tail -20"
ok "Stack iniciada"

# ── Step 5: Migrations ───────────────────────────────────────────────────────
log "Step 5/7: Rodando Prisma migrations..."
POSTGRES_USER=$(grep '^POSTGRES_USER=' "$SCRIPT_DIR/.env.prod" | cut -d= -f2-)
POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$SCRIPT_DIR/.env.prod" | cut -d= -f2-)
POSTGRES_DB=$(grep '^POSTGRES_DB=' "$SCRIPT_DIR/.env.prod" | cut -d= -f2-)

# Fix renamed migration directories in _prisma_migrations (idempotent)
vps "docker run --rm --network avesia-net \
  -e PGPASSWORD='${POSTGRES_PASSWORD}' \
  avesia-postgres:latest \
  psql -h avesia-postgres -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' -c \"
    UPDATE _prisma_migrations SET migration_name = '20260818000001_storage_key_nullable' WHERE migration_name = '20260705000001_storage_key_nullable';
    UPDATE _prisma_migrations SET migration_name = '20260818000002_data_retention' WHERE migration_name = '20260705000002_data_retention';
  \" 2>/dev/null || true"

vps "docker run --rm --network avesia-net \
  -e DATABASE_URL='postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@avesia-postgres:5432/${POSTGRES_DB}?schema=public' \
  -v $VPS_PATH/apps/api/prisma:/app/apps/api/prisma:ro \
  -w /app/apps/api avesia-api:latest \
  sh -c 'node \$(find /app/node_modules/.pnpm -path \"*/prisma/build/index.js\" | head -1) migrate deploy' 2>&1"
ok "Migrations aplicadas"

# ── Step 6: Reiniciar AI Gateway + Nginx ─────────────────────────────────────
log "Step 6/7: Reiniciando AI Gateway e Trivestia nginx..."
vps_cp "$SCRIPT_DIR/scripts/ai-gateway.js" "$VPS_PATH/scripts/ai-gateway.js"
vps_cp "$SCRIPT_DIR/scripts/avesia-ai-gateway.service" "$VPS_PATH/scripts/avesia-ai-gateway.service"
vps "cp $VPS_PATH/scripts/avesia-ai-gateway.service /etc/systemd/system/avesia-ai-gateway.service && systemctl daemon-reload && systemctl restart avesia-ai-gateway 2>&1 || true"
ok "AI Gateway reiniciado"
vps "docker restart trivestia-nginx 2>&1 || true"
ok "Trivestia nginx reiniciado"

# ── Step 7: Smoke test ───────────────────────────────────────────────────────
log "Step 7/7: Smoke test..."

log "  Aguardando containers (30s)..."
sleep 30

log "  Status dos containers:"
vps "cd $VPS_PATH && docker compose -f docker-compose.prod.yml ps --format 'table {{.Name}}\t{{.Status}}' 2>&1"

# Verificar API health
log "  Verificando API health..."
API_HEALTH=$(curl -sf --max-time 10 https://brunointegrations.com/avesia/api/health 2>&1 || echo "FAIL")
API_OK=0
if [[ "$API_HEALTH" != "FAIL" ]]; then
  ok "API respondendo: $API_HEALTH"
  API_OK=1
else
  err "API não respondeu"
fi

# Verificar Web SPA
log "  Verificando Web SPA..."
WEB_STATUS=$(curl -sf --max-time 10 -o /dev/null -w "%{http_code}" https://brunointegrations.com/avesia/ 2>&1 || echo "FAIL")
WEB_OK=0
if [[ "$WEB_STATUS" == "200" ]]; then
  ok "Web SPA respondendo (HTTP 200)"
  WEB_OK=1
else
  err "Web SPA não respondeu (status: $WEB_STATUS)"
fi

# Verificar AI Gateway
log "  Verificando AI Gateway..."
GATEWAY_STATUS=$(vps "docker logs avesia-ai-gateway 2>&1 | tail -1" 2>&1 || echo "FAIL")
ok "Gateway: $GATEWAY_STATUS"

# ── Step 8: Versionamento + commit + tag + push ──────────────────────────────
if [[ "$NO_COMMIT" -eq 1 ]]; then
  log "Versionamento pulado (--no-commit)"
else
  if [[ "$API_OK" -eq 1 && "$WEB_OK" -eq 1 ]]; then
    NEW_VERSION=$(bump_version "$CURRENT_VERSION" "$BUMP")

    # Atualizar package.json
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      pkg.version = '$NEW_VERSION';
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "

    git add package.json
    git commit -m "$(cat <<EOF
chore: bump versão v$NEW_VERSION

Deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Rollback: $DEPLOY_TAG


EOF
)"

    git tag "v$NEW_VERSION"
    ok "Versão bumpada: v$CURRENT_VERSION → v$NEW_VERSION"

    # Push commits + tags
    git push origin main 2>/dev/null && ok "Commits enviados para origin/main" || err "Falha ao pushar commits"
    git push origin "v$NEW_VERSION" 2>/dev/null && ok "Tag v$NEW_VERSION enviada" || err "Falha ao pushar tag"
  else
    err "Smoke test falhou — versão não bumpada"
    err "Para rollback: git checkout $DEPLOY_TAG && ./deploy.sh --no-build"
  fi
fi

# ── Resumo final ─────────────────────────────────────────────────────────────
echo ""
log "═══════════════════════════════════════════════════════════════"
if [[ "$NO_COMMIT" -eq 0 && "${API_OK:-0}" -eq 1 && "${WEB_OK:-0}" -eq 1 ]]; then
  log "  Deploy concluído! — v$NEW_VERSION"
else
  log "  Deploy concluído!"
fi
log "  URL: https://brunointegrations.com/avesia/"
log "  API: https://brunointegrations.com/avesia/api/health"
if [[ "$NO_COMMIT" -eq 0 && "${API_OK:-0}" -eq 1 && "${WEB_OK:-0}" -eq 1 ]]; then
  log "  Tag: v$NEW_VERSION"
  log "  Rollback: $DEPLOY_TAG"
fi
log "═══════════════════════════════════════════════════════════════"
