#!/usr/bin/env bash
# Hobits — Phase 2.5 orchestration: the Prefect server (:4200, UI + API) and a process worker that
# executes scheduled, change-gated hobit runs. Run this alongside `scripts/run.sh`. See
# docs/running-phase-2.5.md.
#
# The server runs in the background; the worker runs in the foreground (Ctrl+C to stop both).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/be"

POOL="${SHIRE_PREFECT_WORK_POOL:-shire-pool}"
export PREFECT_API_URL="${SHIRE_PREFECT_API_URL:-http://127.0.0.1:4200/api}"

echo "==> Prefect server (UI + API) on ${PREFECT_API_URL%/api}"
uv run prefect server start &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

echo "==> Waiting for the Prefect API..."
until curl -sf "${PREFECT_API_URL}/health" >/dev/null 2>&1; do sleep 1; done

echo "==> Process work pool '${POOL}'"
uv run prefect work-pool create "$POOL" --type process 2>/dev/null \
  || echo "    (work pool already exists)"

echo "==> Worker polling '${POOL}'  (Ctrl+C to stop the worker + server)"
echo "    Reminder: start the API with SHIRE_SCHEDULER_ENABLED=true so it registers schedules."
uv run prefect worker start --pool "$POOL"
