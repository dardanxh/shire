#!/usr/bin/env bash
# Apply migrations and refresh seed catalogs, then start the API. Alembic reads
# SHIRE_DATABASE_URL via migrations/env.py. Seeding is idempotent: rows with
# source='user' are never touched.
set -euo pipefail
cd /app
uv run --no-sync alembic upgrade head
uv run --no-sync shire-seed
exec uv run --no-sync uvicorn shire.main:app --host 0.0.0.0 --port 8000
