#!/usr/bin/env bash
# Apply migrations, then start the API. Alembic reads SHIRE_DATABASE_URL via migrations/env.py.
set -euo pipefail
cd /app
uv run --no-sync alembic upgrade head
exec uv run --no-sync uvicorn shire.main:app --host 0.0.0.0 --port 8000
