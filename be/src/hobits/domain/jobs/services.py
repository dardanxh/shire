"""Job service: enqueue (the only write) + the Jobs API reads.

`enqueue` inserts the row and `pg_notify`s the engine channel in the same transaction — NOTIFY is
transactional in Postgres, so the engine can never see a notification before the committed row.
Delivery is best-effort by design: engine workers also poll, so a lost notification only costs
latency, never a job.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from hobits.core.exceptions import ConflictError, NotFoundError
from hobits.core.pagination import Page, PaginationParams
from hobits.domain.jobs import kinds
from hobits.domain.jobs.models import JobRow
from hobits.domain.jobs.repositories import SqlEngineConfigRepository, SqlJobRepository
from hobits.domain.jobs.schemas import (
    EngineConfigResult,
    JobDetailResult,
    JobResult,
    JobStatsResult,
    UpdateEngineConfig,
)

# BE → engine: "a new job is pending". Engine → BE: "a job settled" (see dispatcher.py).
JOBS_NEW_CHANNEL = "hobits_jobs_new"
JOBS_DONE_CHANNEL = "hobits_jobs_done"


class JobService:
    """Constructed per request (or per handler unit-of-work) from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._jobs = SqlJobRepository(session)
        self._config = SqlEngineConfigRepository(session)

    # --- engine config ----------------------------------------------------------
    def get_config(self) -> EngineConfigResult:
        return EngineConfigResult.of(self._config.get_or_create())

    def update_config(self, data: UpdateEngineConfig) -> EngineConfigResult:
        if data.model not in kinds.AVAILABLE_MODELS:
            raise ConflictError(f"Unknown model: {data.model}")
        row = self._config.get_or_create()
        row.timeout_seconds = data.timeout_seconds
        row.model = data.model
        row.max_attempts = data.max_attempts
        row.concurrency = data.concurrency
        row.retention_days = data.retention_days
        row.updated_at = datetime.now(UTC)
        return EngineConfigResult.of(row)

    def engine_defaults(self) -> tuple[str, float]:
        """(model, timeout_seconds) for enqueue sites that don't have a more specific
        (e.g. per-hobit) configuration."""
        row = self._config.get_or_create()
        return row.model, row.timeout_seconds

    def enqueue(
        self,
        *,
        kind: str,
        title: str,
        prompt: str,
        payload: dict[str, Any],
        repository_id: uuid.UUID | None = None,
    ) -> JobRow:
        """Insert a pending job and notify the engine channel. Commits with the caller's
        transaction, so the notification fires only once the row is visible."""
        payload = {**payload, "prompt": prompt}
        # Clone paths are stored relative to the BE working directory; the engine service runs
        # elsewhere, so resolve cwd to a host-absolute path while we still know the base.
        if payload.get("cwd"):
            payload["cwd"] = str(Path(payload["cwd"]).resolve())
        row = JobRow(
            kind=kind,
            title=title,
            status="pending",
            repository_id=repository_id,
            payload=payload,
            prompt=prompt,
            created_at=datetime.now(UTC),
        )
        self._jobs.add(row)
        self._session.execute(
            text("SELECT pg_notify(:channel, :payload)"),
            {"channel": JOBS_NEW_CHANNEL, "payload": str(row.id)},
        )
        return row

    def list(self, params: PaginationParams, status: str | None = None) -> Page[JobResult]:
        total = self._jobs.count(status=status, repository_id=None)
        rows = self._jobs.list(
            status=status, repository_id=None, limit=params.limit, offset=params.offset
        )
        return Page.create([JobResult.of(row) for row in rows], total, params)

    def get(self, job_id: uuid.UUID) -> JobDetailResult:
        row = self._jobs.get(job_id)
        if row is None:
            raise NotFoundError("Job not found")
        return JobDetailResult.of_detail(row)

    def stats(self) -> JobStatsResult:
        return JobStatsResult.model_validate(self._jobs.usage_stats())

    # --- lifecycle actions --------------------------------------------------------
    def cancel(self, job_id: uuid.UUID) -> JobDetailResult:
        row = self._jobs.get(job_id)
        if row is None:
            raise NotFoundError("Job not found")
        if not self._jobs.try_cancel(job_id):
            raise ConflictError("Only pending jobs can be cancelled.")
        # Wake the dispatcher so the owning domain rows settle immediately.
        self._session.execute(
            text("SELECT pg_notify(:channel, :payload)"),
            {"channel": JOBS_DONE_CHANNEL, "payload": str(job_id)},
        )
        self._session.expire(row)
        return JobDetailResult.of_detail(self._jobs.get(job_id))

    def retry(self, job_id: uuid.UUID) -> JobResult:
        """Re-run a failed/cancelled job. Substrate jobs re-enqueue as-is (their handlers
        just rewrite the artifact); hobit runs go back through the run lifecycle so a fresh
        run row exists; MR-stage jobs must be re-run via the review's Reanalyze."""
        row = self._jobs.get(job_id)
        if row is None:
            raise NotFoundError("Job not found")
        if row.status not in ("failed", "cancelled"):
            raise ConflictError("Only failed or cancelled jobs can be retried.")
        if row.kind.startswith("mr."):
            raise ConflictError(
                "MR analysis stages can't be retried individually — use Reanalyze on the "
                "merge review."
            )
        if row.kind == kinds.HOBIT_RUN:
            # Local import: hobits.services imports JobService (enqueue path).
            from hobits.domain.hobits.services import HobitService

            HobitService(self._session).run_hobit(
                uuid.UUID(row.payload["repository_id"]),
                row.payload["slug"],
                trigger=row.payload.get("trigger", "manual"),
            )
            fresh = self._jobs.list(
                status="pending", repository_id=row.repository_id, limit=1, offset=0
            )
            return JobResult.of(fresh[0]) if fresh else JobResult.of(row)

        payload = {k: v for k, v in (row.payload or {}).items() if k != "prompt"}
        new_row = self.enqueue(
            kind=row.kind,
            title=row.title,
            prompt=row.prompt,
            payload=payload,
            repository_id=row.repository_id,
        )
        return JobResult.of(new_row)
