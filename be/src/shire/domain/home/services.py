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

from shire.core.settings import get_settings
from shire.domain.briefing.models import BriefingItemRow
from shire.domain.connections.models import ConnectionRow
from shire.domain.hobits.models import HobitRunRow
from shire.domain.home.schemas import (
    AttentionResult,
    ClaudeStatusResult,
    EngineStatusResult,
    HomeStatusResult,
    OnboardingChecklistResult,
)
from shire.domain.jobs.models import JobRow
from shire.domain.jobs.services import JobService
from shire.domain.principles.models import PrincipleRow
from shire.domain.repository.models import RepositoryRow
from shire.domain.roadmap.models import (
    RoadmapDriftFindingRow,
    RoadmapExecutionRow,
    RoadmapItemRow,
)
from shire.domain.substrate.models import RepositoryToolRow
from shire.integrations.claude_agent import ClaudeAgent

_CLAUDE_VERSION_TTL_SECONDS = 300.0
_claude_cache: tuple[float, str | None] = (0.0, None)
_claude_lock = threading.Lock()

# An engine that claimed a job this recently is treated as alive even when the LISTEN
# backend isn't visible (e.g. the roles ever diverge and pg_stat_activity masks queries).
_JOB_ACTIVITY_WINDOW = timedelta(minutes=2)


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
