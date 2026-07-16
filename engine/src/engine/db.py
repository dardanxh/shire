"""Raw psycopg access to the shared `jobs` table — claim, complete, recover, sweep.

Each helper opens its own short autocommit connection, so they are safe to call from any worker
thread. Claiming uses `FOR UPDATE SKIP LOCKED`, the Postgres primitive that lets any number of
competing engine instances drain the same queue: each pending job is handed to exactly one
worker, with no coordination beyond the table itself.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import psycopg
from psycopg.rows import dict_row

logger = logging.getLogger(__name__)

JOBS_NEW_CHANNEL = "shire_jobs_new"
JOBS_DONE_CHANNEL = "shire_jobs_done"

_CLAIM_SQL = """
WITH next_job AS (
    SELECT id FROM jobs
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
UPDATE jobs j
SET status = 'running', started_at = now(),
    attempts = j.attempts + 1, worker_id = %(worker_id)s
FROM next_job
WHERE j.id = next_job.id
RETURNING j.id, j.kind, j.prompt, j.payload;
"""

_COMPLETE_SQL = """
UPDATE jobs
SET status = %(status)s, result = %(result)s, error = %(error)s,
    finished_at = now(), duration_seconds = %(duration)s, usage = %(usage)s::jsonb
WHERE id = %(id)s;
"""

_RECOVER_OWN_SQL = """
UPDATE jobs
SET status = 'pending', worker_id = NULL, started_at = NULL
WHERE status = 'running' AND worker_id = %(worker_id)s
RETURNING id;
"""

# Jobs `running` for longer than their own timeout plus a generous grace period belong to a dead
# worker (a live one would have settled or timed out by then). Requeue, or fail once the attempt
# budget is spent.
_SWEEP_SQL = """
UPDATE jobs
SET status      = CASE WHEN attempts >= %(max_attempts)s THEN 'failed' ELSE 'pending' END,
    error       = CASE WHEN attempts >= %(max_attempts)s
                       THEN 'engine worker died mid-run (stale job swept)' ELSE error END,
    finished_at = CASE WHEN attempts >= %(max_attempts)s THEN now() ELSE NULL END,
    started_at  = CASE WHEN attempts >= %(max_attempts)s THEN started_at ELSE NULL END,
    worker_id   = NULL
WHERE status = 'running'
  AND started_at < now()
      - ((COALESCE((payload->>'timeout_seconds')::float, 500) + 120) * interval '1 second')
RETURNING id, status;
"""


def connect(dsn: str) -> psycopg.Connection:
    return psycopg.connect(dsn, autocommit=True, row_factory=dict_row)


def fetch_config(dsn: str) -> dict[str, Any] | None:
    """The shared runtime config the backend's Config tab edits (max_attempts, concurrency).
    None when the table doesn't exist yet (engine started before the migration) — callers
    fall back to env-settings defaults."""
    try:
        with connect(dsn) as conn:
            return conn.execute(
                "SELECT max_attempts, concurrency FROM engine_config LIMIT 1"
            ).fetchone()
    except psycopg.errors.UndefinedTable:
        return None


def claim_next(dsn: str, worker_id: str) -> dict[str, Any] | None:
    """Atomically claim the oldest pending job for this worker, or None when the queue is idle."""
    with connect(dsn) as conn:
        row = conn.execute(_CLAIM_SQL, {"worker_id": worker_id}).fetchone()
    return row


_PROGRESS_SQL = """
UPDATE jobs SET progress = %(progress)s::jsonb
WHERE id = %(id)s AND status = 'running';
"""


def update_progress(dsn: str, job_id: Any, events: list[dict]) -> None:
    """Overwrite the job's live transcript (compact agent events, capped by the worker).
    Best-effort: silently skipped when the backend migration hasn't added the column yet."""
    try:
        with connect(dsn) as conn:
            conn.execute(_PROGRESS_SQL, {"id": job_id, "progress": json.dumps(events)})
    except psycopg.errors.UndefinedColumn:
        pass


def complete(
    dsn: str,
    job_id: Any,
    *,
    ok: bool,
    text: str,
    error: str | None,
    duration: float,
    usage: dict | None = None,
) -> None:
    """Settle a job and notify the backend's completion channel."""
    with connect(dsn) as conn:
        conn.execute(
            _COMPLETE_SQL,
            {
                "id": job_id,
                "status": "succeeded" if ok else "failed",
                "result": text or None,
                "error": error,
                "duration": duration,
                "usage": json.dumps(usage) if usage is not None else None,
            },
        )
        conn.execute("SELECT pg_notify(%s, %s::text)", (JOBS_DONE_CHANNEL, str(job_id)))


def recover_own(dsn: str, worker_id: str) -> int:
    """Requeue jobs this worker (same host:pid identity) left `running` when it last died.
    Never touches other workers' in-flight jobs."""
    with connect(dsn) as conn:
        rows = conn.execute(_RECOVER_OWN_SQL, {"worker_id": worker_id}).fetchall()
    return len(rows)


def sweep_stale(dsn: str, max_attempts: int) -> int:
    """Recover jobs from dead workers. Failed sweeps still notify the done channel so the
    backend stamps the domain-side failure."""
    with connect(dsn) as conn:
        rows = conn.execute(_SWEEP_SQL, {"max_attempts": max_attempts}).fetchall()
        for row in rows:
            if row["status"] == "failed":
                conn.execute("SELECT pg_notify(%s, %s::text)", (JOBS_DONE_CHANNEL, str(row["id"])))
    if rows:
        logger.warning(
            "Stale sweep recovered %d job(s): %s",
            len(rows),
            ", ".join(f"{r['id']}→{r['status']}" for r in rows),
        )
    return len(rows)
