#!/usr/bin/env bash
# Shire — start everything natively: database, backend API (:8000), engine worker,
# frontend dev server (:5173). Backend + engine run in the background; the frontend runs in
# the foreground (Ctrl+C stops all). For the containerized stack use ./setup.sh at the root.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v claude >/dev/null 2>&1 \
   && [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ ! -d "${HOME}/.claude" ]; then
  echo "NOTE: no Claude CLI or auth detected — agent jobs (hobits, ask, council…) will fail."
  echo "      Everything else (ingest, scanners, catalogs) works. See README > Claude authentication."
fi

echo "==> Database"
( cd be && docker compose up -d --wait && uv run alembic upgrade head )

echo "==> Backend API on http://localhost:8000  (docs: /docs, tools: /tools)"
( cd be && uv run uvicorn shire.main:app --port 8000 ) &
BACKEND_PID=$!

echo "==> Engine worker (claims jobs from Postgres; start more instances to scale out)"
( cd engine && uv run python -m engine ) &
ENGINE_PID=$!

trap 'kill $BACKEND_PID $ENGINE_PID 2>/dev/null || true' EXIT

echo "==> Frontend on http://localhost:5173"
( cd ui && npm run dev )
