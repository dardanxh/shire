"""Data access for jobs. The engine service claims rows with its own raw-SQL path; this
repository covers the BE side: enqueue reads, the Jobs API, and the completion dispatcher."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from hobits.domain.jobs.models import JobRow

SETTLED_STATUSES = ("succeeded", "failed")


class SqlJobRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: JobRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, job_id: uuid.UUID) -> JobRow | None:
        return self._session.get(JobRow, job_id)

    def list(
        self,
        *,
        status: str | None,
        repository_id: uuid.UUID | None,
        limit: int,
        offset: int,
    ) -> list[JobRow]:
        stmt = select(JobRow).order_by(JobRow.created_at.desc())
        if status is not None:
            stmt = stmt.where(JobRow.status == status)
        if repository_id is not None:
            stmt = stmt.where(JobRow.repository_id == repository_id)
        return list(self._session.scalars(stmt.limit(limit).offset(offset)))

    def count(self, *, status: str | None, repository_id: uuid.UUID | None) -> int:
        stmt = select(func.count()).select_from(JobRow)
        if status is not None:
            stmt = stmt.where(JobRow.status == status)
        if repository_id is not None:
            stmt = stmt.where(JobRow.repository_id == repository_id)
        return self._session.scalar(stmt) or 0

    def unapplied_settled(self, limit: int = 50) -> list[JobRow]:
        """Settled jobs whose domain effects haven't been applied yet — the dispatcher's sweep
        target (crash-safe fallback for missed NOTIFYs)."""
        stmt = (
            select(JobRow)
            .where(JobRow.status.in_(SETTLED_STATUSES), JobRow.result_applied.is_(False))
            .order_by(JobRow.finished_at)
            .limit(limit)
        )
        return list(self._session.scalars(stmt))

    def try_mark_applied(self, job_id: uuid.UUID) -> bool:
        """Atomically claim the right to apply a settled job's result. False means another
        dispatcher pass already applied (or is applying) it — the duplicate-handler guard."""
        result = self._session.execute(
            update(JobRow)
            .where(JobRow.id == job_id, JobRow.result_applied.is_(False))
            .values(result_applied=True, applied_at=datetime.now(UTC))
        )
        return result.rowcount == 1

    def latest_unsettled(self, kind: str, repository_id: uuid.UUID) -> JobRow | None:
        """The most recent pending/running job of a kind for a repository (e.g. the in-flight
        dependency-gains enrichment surfaced on the freshness panel)."""
        stmt = (
            select(JobRow)
            .where(
                JobRow.kind == kind,
                JobRow.repository_id == repository_id,
                JobRow.status.in_(("pending", "running")),
            )
            .order_by(JobRow.created_at.desc())
            .limit(1)
        )
        return self._session.scalars(stmt).first()
