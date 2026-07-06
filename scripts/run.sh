#!/usr/bin/env bash
# Hobits — start everything: database, backend API (:8000), frontend (:3000).
# Backend runs in the background; the frontend runs in the foreground (Ctrl+C to stop it).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Database"
( cd be && docker compose up -d && uv run alembic upgrade head )

echo "==> Backend API on http://localhost:8000  (docs: /docs, tools: /tools)"
( cd be && uv run uvicorn hobits.main:app --port 8000 ) &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT

echo "==> Frontend on http://localhost:3000"
( cd ui && npm run dev )
