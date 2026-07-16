#!/usr/bin/env bash
# Hobits — one-shot setup: external tools + backend + frontend + database.
# Idempotent; safe to re-run. See docs/external-tools.md and docs/running-phase-1.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> [1/5] External analysis tools (brew)"
# Source of truth for this list: be/src/hobits/substrate/infrastructure/external_tools/
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

echo "==> [5/5] Frontend dependencies (npm)"
( cd ui && npm install )

echo ""
echo "Setup complete. Start everything with:  ./scripts/run.sh"
echo "Tool availability will be at:           http://localhost:8000/tools"
