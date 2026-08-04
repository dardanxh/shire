"""Data access for jobs. The engine service claims rows with its own raw-SQL path; this
repository covers the BE side: enqueue reads, the Jobs API, and the completion dispatcher."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from shire.core.settings import get_settings
from shire.domain.jobs.models import EngineConfigRow, JobRow

SETTLED_STATUSES = ("succeeded", "failed", "cancelled")


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
        kind: str | None = None,
    ) -> list[JobRow]:
        stmt = select(JobRow).order_by(JobRow.created_at.desc())
        if status is not None:
            stmt = stmt.where(JobRow.status == status)
        if repository_id is not None:
            stmt = stmt.where(JobRow.repository_id == repository_id)
        if kind is not None:
            stmt = stmt.where(JobRow.kind == kind)
        return list(self._session.scalars(stmt.limit(limit).offset(offset)))

    def count(
        self,
        *,
        status: str | None,
        repository_id: uuid.UUID | None,
        kind: str | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(JobRow)
        if status is not None:
            stmt = stmt.where(JobRow.status == status)
        if repository_id is not None:
            stmt = stmt.where(JobRow.repository_id == repository_id)
        if kind is not None:
            stmt = stmt.where(JobRow.kind == kind)
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

    def try_cancel(self, job_id: uuid.UUID) -> bool:
        """Atomically cancel a job that no worker has claimed yet. False when it already
        started (a running CLI subprocess can't be interrupted) or already settled."""
        result = self._session.execute(
            update(JobRow)
            .where(JobRow.id == job_id, JobRow.status == "pending")
            .values(
                status="cancelled",
                error="Cancelled by user",
                finished_at=datetime.now(UTC),
            )
        )
        return result.rowcount == 1

    def usage_stats(self) -> dict[str, dict]:
        """Aggregate token/cost totals for the stats header: today, last 7 days, all time."""
        now = datetime.now(UTC)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week = now - timedelta(days=7)

        token_expr = (
            func.coalesce(JobRow.usage["input_tokens"].as_integer(), 0)
            + func.coalesce(JobRow.usage["output_tokens"].as_integer(), 0)
            + func.coalesce(JobRow.usage["cache_creation_input_tokens"].as_integer(), 0)
            + func.coalesce(JobRow.usage["cache_read_input_tokens"].as_integer(), 0)
        )
        cost_expr = func.coalesce(JobRow.usage["total_cost_usd"].as_float(), 0.0)

        def bucket(since: datetime | None) -> tuple:
            condition = JobRow.created_at >= since if since is not None else None
            return (
                func.count(JobRow.id).filter(condition)
                if condition is not None
                else func.count(JobRow.id),
                func.sum(token_expr).filter(condition)
                if condition is not None
                else func.sum(token_expr),
                func.sum(cost_expr).filter(condition)
                if condition is not None
                else func.sum(cost_expr),
            )

        row = self._session.execute(
            select(*bucket(today), *bucket(week), *bucket(None))
        ).one()

        def shape(offset: int) -> dict:
            return {
                "jobs": row[offset],
                "total_tokens": int(row[offset + 1] or 0),
                "total_cost_usd": float(row[offset + 2] or 0),
            }

        return {"today": shape(0), "last_7_days": shape(3), "all_time": shape(6)}

    def delete_older_than(self, days: int) -> int:
        """Retention cleanup: drop settled + applied jobs whose results are past their keep
        window. Returns the number of rows deleted."""
        cutoff = datetime.now(UTC) - timedelta(days=days)
        result = self._session.execute(
            delete(JobRow).where(
                JobRow.status.in_(SETTLED_STATUSES),
                JobRow.result_applied.is_(True),
                JobRow.finished_at < cutoff,
            )
        )
        return result.rowcount

    def unsettled_for_repository(self, repository_id: uuid.UUID) -> list[JobRow]:
        """Every pending/running job for a repository, newest first — one query for callers
        that need in-flight state across many job kinds at once (the inspections checklist)."""
        stmt = (
            select(JobRow)
            .where(
                JobRow.repository_id == repository_id,
                JobRow.status.in_(("pending", "running")),
            )
            .order_by(JobRow.created_at.desc())
        )
        return list(self._session.scalars(stmt))

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


class SqlEngineConfigRepository:
    """The singleton engine-config row, seeded lazily from env-settings defaults."""

    _ROW_ID = 1

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_or_create(self) -> EngineConfigRow:
        row = self._session.get(EngineConfigRow, self._ROW_ID)
        if row is None:
            settings = get_settings()
            row = EngineConfigRow(
                id=self._ROW_ID,
                timeout_seconds=settings.claude_timeout_seconds,
                model=settings.claude_model,
                max_attempts=2,
                concurrency=2,
                retention_days=0,
                updated_at=datetime.now(UTC),
            )
            self._session.add(row)
            self._session.flush()
        return row
