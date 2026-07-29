"""Home service: one status read-model for the landing page.

This is a pure reporting domain — it imports other domains' ORM entities strictly for
read-only counts (the precedent is briefing/services.py) and never mutates anything. The
Claude probe shells out, so its result is cached in-process with a short TTL: only a cold
hit pays the subprocess, and the route runs sync in FastAPI's threadpool anyway.
"""

from __future__ import annotations

import threading
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import exists, func, select, text
from sqlalchemy.orm import Session

from shire.core.pagination import Page, PaginationParams
from shire.core.settings import get_settings
from shire.domain.briefing.models import BriefingItemRow
from shire.domain.connections.models import ConnectionRow
from shire.domain.council.models import CouncilTopicRow
from shire.domain.hobits.models import HobitRunRow
from shire.domain.home.schemas import (
    ActivityEventResult,
    AttentionResult,
    ClaudeStatusResult,
    EngineStatusResult,
    HomeStatusResult,
    OnboardingChecklistResult,
)
from shire.domain.jobs.models import JobRow
from shire.domain.jobs.services import JobService
from shire.domain.merge_review.models import MergeReviewRow
from shire.domain.principles.models import PrincipleRow
from shire.domain.repository.models import RepositoryRow
from shire.domain.roadmap.models import (
    RoadmapDriftFindingRow,
    RoadmapExecutionRow,
    RoadmapItemRow,
)
from shire.domain.substrate.models import AnalysisRow, RepositoryToolRow
from shire.integrations.claude_agent import ClaudeAgent

_CLAUDE_VERSION_TTL_SECONDS = 300.0
_claude_cache: tuple[float, str | None] = (0.0, None)
_claude_lock = threading.Lock()

# An engine that claimed a job this recently is treated as alive even when the LISTEN
# backend isn't visible (e.g. the roles ever diverge and pg_stat_activity masks queries).
_JOB_ACTIVITY_WINDOW = timedelta(minutes=2)

# Job kinds hidden from the activity feed: internal fan-out (a council convene spawns
# roster/take/chair jobs, a merge review spawns mr.* jobs — the feed shows the umbrella
# event from the owning table instead) and scheduled background ticks.
_FEED_HIDDEN_JOB_KINDS = (
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


def _claude_version() -> str | None:
    """`claude --version`, cached for 5 minutes (the binary doesn't change under us)."""
    global _claude_cache
    with _claude_lock:
        cached_at, cached = _claude_cache
        if time.monotonic() - cached_at < _CLAUDE_VERSION_TTL_SECONDS:
            return cached
        version = ClaudeAgent(binary=get_settings().claude_binary).version()
        _claude_cache = (time.monotonic(), version)
        return version


class HomeService:
    """Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def status(self) -> HomeStatusResult:
        return HomeStatusResult(
            claude=self._claude_status(),
            engine=self._engine_status(),
            checklist=self._checklist(),
            attention=self._attention(),
        )

    def activity(self, params: PaginationParams) -> Page[ActivityEventResult]:
        """Reverse-chronological feed of recent work, derived — no event table.

        Jobs already record most actions (with a human title); the other sources cover
        what never becomes a job (onboarding, scanner refreshes) or is better shown as
        one umbrella event than as its fan-out jobs (council convenes, merge reviews).
        Each source is fetched newest-first up to offset+limit, merged in memory, and
        sliced — cheap at feed page sizes, and one ORDER BY per already-indexed column.
        """
        session = self._session
        fetch = params.offset + params.limit
        events: list[ActivityEventResult] = []

        for job in session.scalars(
            select(JobRow)
            .where(JobRow.kind.notin_(_FEED_HIDDEN_JOB_KINDS))
            .order_by(JobRow.created_at.desc())
            .limit(fetch)
        ):
            events.append(
                ActivityEventResult(
                    id=job.id,
                    kind=job.kind,
                    title=job.title,
                    status=job.status,
                    repository_id=job.repository_id,
                    repository_slug=None,
                    occurred_at=job.created_at,
                )
            )

        for repo_id, owner, name, created_at in session.execute(
            select(
                RepositoryRow.id, RepositoryRow.owner, RepositoryRow.name, RepositoryRow.created_at
            )
            .order_by(RepositoryRow.created_at.desc())
            .limit(fetch)
        ):
            events.append(
                ActivityEventResult(
                    id=repo_id,
                    kind="repository.onboarded",
                    title=f"{owner}/{name}",
                    status=None,
                    repository_id=repo_id,
                    repository_slug=f"{owner}/{name}",
                    occurred_at=created_at,
                )
            )

        for analysis in session.scalars(
            select(AnalysisRow).order_by(AnalysisRow.analyzed_at.desc()).limit(fetch)
        ):
            events.append(
                ActivityEventResult(
                    id=analysis.id,
                    kind="repository.analyzed",
                    title=analysis.commit_sha[:12],
                    status=analysis.status,
                    repository_id=analysis.repository_id,
                    repository_slug=None,
                    occurred_at=analysis.analyzed_at,
                )
            )

        for topic in session.scalars(
            select(CouncilTopicRow)
            .where(CouncilTopicRow.convened_at.is_not(None))
            .order_by(CouncilTopicRow.convened_at.desc())
            .limit(fetch)
        ):
            events.append(
                ActivityEventResult(
                    id=topic.id,
                    kind="council.convened",
                    title=topic.name,
                    status=topic.status,
                    repository_id=None,
                    repository_slug=None,
                    occurred_at=topic.convened_at,  # type: ignore[arg-type]  # filtered not-null
                )
            )

        for review in session.scalars(
            select(MergeReviewRow).order_by(MergeReviewRow.created_at.desc()).limit(fetch)
        ):
            events.append(
                ActivityEventResult(
                    id=review.id,
                    kind="merge_review.created",
                    title=f"{review.source_branch} → {review.target_branch}",
                    status=review.overall_status,
                    repository_id=review.repository_id,
                    repository_slug=None,
                    occurred_at=review.created_at,
                )
            )

        events.sort(key=lambda e: (e.occurred_at, str(e.id)), reverse=True)
        page_events = events[params.offset : params.offset + params.limit]

        # One lookup stitches repo slugs onto job/analysis/review events; analyses keep no
        # FK, so a deleted repo simply yields no slug.
        missing = {
            e.repository_id for e in page_events if e.repository_id and not e.repository_slug
        }
        if missing:
            slug_by_id = {
                row.id: f"{row.owner}/{row.name}"
                for row in session.execute(
                    select(RepositoryRow.id, RepositoryRow.owner, RepositoryRow.name).where(
                        RepositoryRow.id.in_(missing)
                    )
                )
            }
            for event in page_events:
                if event.repository_id and not event.repository_slug:
                    event.repository_slug = slug_by_id.get(event.repository_id)

        total = sum(
            int(session.scalar(query) or 0)
            for query in (
                select(func.count(JobRow.id)).where(JobRow.kind.notin_(_FEED_HIDDEN_JOB_KINDS)),
                select(func.count(RepositoryRow.id)),
                select(func.count(AnalysisRow.id)),
                select(func.count(CouncilTopicRow.id)).where(
                    CouncilTopicRow.convened_at.is_not(None)
                ),
                select(func.count(MergeReviewRow.id)),
            )
        )
        return Page.create(items=page_events, total=total, params=params)

    def _claude_status(self) -> ClaudeStatusResult:
        version = _claude_version()
        return ClaudeStatusResult(
            installed=version is not None,
            version=version or None,
            default_model=JobService(self._session).get_config().model,
        )

    def _engine_status(self) -> EngineStatusResult:
        # The engine holds one dedicated LISTEN connection per instance and never runs
        # another statement on it, so pg_stat_activity.query stays frozen at the LISTEN —
        # a reliable liveness signal while BE and engine share the DB role.
        listeners = int(
            self._session.execute(
                text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE query ILIKE 'listen shire_jobs_new%'"
                )
            ).scalar()
            or 0
        )
        last_started = self._session.scalar(select(func.max(JobRow.started_at)))
        if listeners > 0:
            return EngineStatusResult(
                running=True,
                listeners=listeners,
                last_job_activity_at=last_started,
                detail="pg listener",
            )
        recently_active = (
            last_started is not None and datetime.now(UTC) - last_started < _JOB_ACTIVITY_WINDOW
        )
        return EngineStatusResult(
            running=recently_active,
            listeners=0,
            last_job_activity_at=last_started,
            detail="recent job activity" if recently_active else None,
        )

    def _attention(self) -> AttentionResult:
        session = self._session
        drift_findings = int(
            session.scalar(
                select(func.count(RoadmapDriftFindingRow.id)).where(
                    RoadmapDriftFindingRow.status == "open"
                )
            )
            or 0
        )
        open_prs = int(
            session.scalar(
                select(func.count(RoadmapExecutionRow.id))
                .join(RoadmapItemRow, RoadmapItemRow.id == RoadmapExecutionRow.item_id)
                .where(
                    RoadmapExecutionRow.pr_state == "open",
                    RoadmapItemRow.status == "in_progress",
                )
            )
            or 0
        )
        failed_jobs_24h = int(
            session.scalar(
                select(func.count(JobRow.id)).where(
                    JobRow.status == "failed",
                    JobRow.finished_at >= datetime.now(UTC) - timedelta(hours=24),
                )
            )
            or 0
        )
        # Newest check per (principle, repo) pair — the pair's current compliance state.
        violated = int(
            session.execute(
                text(
                    """
                    SELECT count(*) FROM (
                        SELECT DISTINCT ON (principle_id, repository_id) status
                        FROM principle_checks
                        ORDER BY principle_id, repository_id, created_at DESC
                    ) latest WHERE status = 'violated'
                    """
                )
            ).scalar()
            or 0
        )
        briefing_now = int(
            session.scalar(
                select(func.count(BriefingItemRow.id)).where(
                    BriefingItemRow.tier == "NOW",
                    BriefingItemRow.read_at.is_(None),
                )
            )
            or 0
        )
        return AttentionResult(
            drift_findings=drift_findings,
            open_prs=open_prs,
            failed_jobs_24h=failed_jobs_24h,
            violated_principles=violated,
            briefing_now_unread=briefing_now,
        )

    def _checklist(self) -> OnboardingChecklistResult:
        session = self._session
        first_repo_id = session.scalar(
            select(RepositoryRow.id).order_by(RepositoryRow.created_at.asc()).limit(1)
        )
        return OnboardingChecklistResult(
            repository_count=int(session.scalar(select(func.count(RepositoryRow.id))) or 0),
            connection_count=int(session.scalar(select(func.count(ConnectionRow.id))) or 0),
            principle_count=int(session.scalar(select(func.count(PrincipleRow.id))) or 0),
            has_linked_tool=bool(
                session.scalar(select(exists().where(RepositoryToolRow.tool_id.is_not(None))))
            ),
            has_hobit_run=bool(session.scalar(select(exists().where(HobitRunRow.id.is_not(None))))),
            first_repository_id=first_repo_id,
        )
