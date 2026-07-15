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

from hobits.core.exceptions import NotFoundError
from hobits.core.pagination import Page, PaginationParams
from hobits.domain.jobs.models import JobRow
from hobits.domain.jobs.repositories import SqlJobRepository
from hobits.domain.jobs.schemas import JobDetailResult, JobResult

# BE → engine: "a new job is pending". Engine → BE: "a job settled" (see dispatcher.py).
JOBS_NEW_CHANNEL = "hobits_jobs_new"
JOBS_DONE_CHANNEL = "hobits_jobs_done"


class JobService:
    """Constructed per request (or per handler unit-of-work) from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._jobs = SqlJobRepository(session)

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
