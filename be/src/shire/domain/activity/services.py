"""Activity log service: record events where they happen, serve the feed in one query."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shire.core.pagination import Page, PaginationParams
from shire.domain.activity.models import ActivityLogRow
from shire.domain.activity.schemas import ActivityEventResult
from shire.domain.jobs.models import JobRow
from shire.domain.repository.models import RepositoryRow

# Job kinds that never reach the feed: internal fan-out of umbrella events the log records
# directly (a council convene spawns roster/take/chair jobs, a merge review spawns mr.*
# jobs) and scheduled background ticks.
HIDDEN_JOB_KINDS = (
    "council.roster",
    "council.take_r1",
    "council.take_r2",
    "council.chair",
    "mr.classification",
    "mr.overview",
    "mr.hobit_review",
    "hobit.feedback_distill",
    "news.poll",
    "news.recommend",
    "roadmap.drift",
)


class ActivityService:
    """Constructed per request (or per background-task session)."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def record(
        self,
        *,
        kind: str,
        title: str,
        entity_id: uuid.UUID,
        repository_id: uuid.UUID | None = None,
    ) -> None:
        """Append one feed row. Rides the caller's transaction, so the event and its feed
        entry become visible together."""
        self._session.add(
            ActivityLogRow(
                kind=kind,
                title=title[:500],
                entity_id=entity_id,
                repository_id=repository_id,
                created_at=datetime.now(UTC),
            )
        )

    def record_job(self, job: JobRow) -> None:
        """Append a feed row for a freshly enqueued job, unless its kind is feed-hidden."""
        if job.kind in HIDDEN_JOB_KINDS:
            return
        self.record(
            kind=job.kind, title=job.title, entity_id=job.id, repository_id=job.repository_id
        )

    def feed(self, params: PaginationParams) -> Page[ActivityEventResult]:
        """The feed page, newest first — repo slug and live job status joined in the same
        single query (non-job events simply miss the jobs join and carry no status)."""
        rows = self._session.execute(
            select(
                ActivityLogRow,
                RepositoryRow.owner.label("repo_owner"),
                RepositoryRow.name.label("repo_name"),
                JobRow.status.label("job_status"),
            )
            .join(RepositoryRow, RepositoryRow.id == ActivityLogRow.repository_id, isouter=True)
            .join(JobRow, JobRow.id == ActivityLogRow.entity_id, isouter=True)
            .order_by(ActivityLogRow.created_at.desc(), ActivityLogRow.id)
            .offset(params.offset)
            .limit(params.limit)
        ).all()
        items = [
            ActivityEventResult(
                id=row.ActivityLogRow.entity_id,
                kind=row.ActivityLogRow.kind,
                title=row.ActivityLogRow.title,
                status=row.job_status,
                repository_id=row.ActivityLogRow.repository_id,
                repository_slug=(
                    f"{row.repo_owner}/{row.repo_name}" if row.repo_owner is not None else None
                ),
                occurred_at=row.ActivityLogRow.created_at,
            )
            for row in rows
        ]
        total = int(self._session.scalar(select(func.count(ActivityLogRow.id))) or 0)
        return Page.create(items=items, total=total, params=params)
