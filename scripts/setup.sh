#!/usr/bin/env bash
# Shire — one-shot NATIVE dev setup: external tools + backend + frontend + database.
# Idempotent; safe to re-run. See docs/external-tools.md and docs/running-phase-1.md.
# For the containerized stack use ./setup.sh at the repo root instead (the two flows keep
# separate databases).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> [0/5] Checking prerequisites"
missing=0
for tool in uv docker node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    case "$tool" in
      uv)     echo "  ! uv not found — install: https://docs.astral.sh/uv/getting-started/installation/" ;;
      docker) echo "  ! docker not found (needed for Postgres) — https://docs.docker.com/get-docker/" ;;
      node)   echo "  ! node not found (need 20+) — https://nodejs.org or brew install node" ;;
    esac
    missing=1
  fi
done
[ "$missing" = 1 ] && { echo "Install the missing prerequisites and re-run."; exit 1; }
node_major="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [ "$node_major" -lt 20 ]; then
  echo "  ! Node $node_major found, but 20+ is required. Upgrade and re-run."
  exit 1
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "  ! Claude Code CLI not found — agent features (hobits, ask, council…) won't run."
  echo "    Everything else works. Install later with: npm install -g @anthropic-ai/claude-code"
fi

echo "==> [1/5] External analysis tools (brew)"
# Source of truth for this list: be/src/shire/integrations/external_tools/
if command -v brew >/dev/null 2>&1; then
  brew install scc syft osv-scanner gitleaks scorecard || true
else
  echo "  ! Homebrew not found. Install these manually (see docs/external-tools.md):"
  echo "    scc, syft, osv-scanner, gitleaks, scorecard"
fi

echo "==> [2/5] Backend dependencies (uv, Python 3.13)"
( cd be && uv sync )

echo "==> [3/5] Database (Docker Postgres + pgvector)"
( cd be && docker compose up -d )
echo "    waiting for Postgres to be healthy..."
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' shire-db 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && break
  sleep 2
done

echo "==> [4/5] Database migrations (Alembic)"
( cd be && uv run alembic upgrade head )

echo "==> [5/5] Frontend dependencies (pnpm)"
if command -v pnpm >/dev/null 2>&1; then
  ( cd ui && pnpm install )
else
  ( cd ui && npm install -g pnpm@9 && pnpm install ) \
    || { echo "  ! pnpm not found and global install failed; falling back to npm"; ( cd ui && npm install ); }
fi

echo ""
echo "Setup complete. Start everything with:  ./scripts/run.sh"
echo "Tool availability will be at:           http://localhost:8000/tools"
