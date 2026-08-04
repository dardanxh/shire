"""Completion handlers for Watchlist engine jobs (Pulse accomplishment summaries)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select

from shire.core.db import unit_of_work
from shire.domain.jobs.models import JobRow
from shire.domain.watchlist.models import PulseSummaryRow


def handle_pulse_summary(job: JobRow) -> None:
    """Persist the Pulse "what has been accomplished" narrative for its window."""
    if job.status != "succeeded":
        return
    narrative = (job.result or "").strip()
    if not narrative:
        _mark_failed(job.id, "The agent returned an empty accomplishment summary.")
        return
    payload = job.payload or {}
    repository_id = uuid.UUID(payload["repository_id"])
    since_date = date.fromisoformat(payload["since_date"])
    head_sha = str(payload.get("head_sha") or "")
    with unit_of_work() as session:
        existing = session.scalars(
            select(PulseSummaryRow).where(
                PulseSummaryRow.repository_id == repository_id,
                PulseSummaryRow.since_date == since_date,
                PulseSummaryRow.head_sha == head_sha,
            )
        ).first()
        if existing is not None:
            existing.narrative = narrative
            existing.created_at = datetime.now(UTC)
        else:
            session.add(
                PulseSummaryRow(
                    repository_id=repository_id,
                    since_date=since_date,
                    head_sha=head_sha,
                    narrative=narrative,
                    created_at=datetime.now(UTC),
                )
            )


def _mark_failed(job_id: uuid.UUID, reason: str) -> None:
    """A succeeded engine run with unusable output is, for observability, a failed job."""
    with unit_of_work() as session:
        row = session.get(JobRow, job_id)
        if row is not None:
            row.status = "failed"
            row.error = reason
