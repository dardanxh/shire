"""News service: topic/source CRUD, poll orchestration, the feed, and topic recommendations.

A poll enqueues one web-facing engine job per enabled topic (WebSearch + WebFetch, no repo
clone); each job's completion handler (jobs.py) parses the structured item list and settles
the poll row. Recommendations embed a portfolio digest built here from the analysis tables —
the agent never reads repository files for them.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.core.pagination import Page, PaginationParams
from shire.core.settings import get_settings
from shire.domain.context.models import ContextPackRow
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.models import JobRow
from shire.domain.jobs.services import JobService
from shire.domain.news.jobs import (
    SEEN_LIMIT,
    build_poll_prompt,
    build_recommend_prompt,
)
from shire.domain.news.models import (
    NewsPollRow,
    NewsRecommendationRow,
    NewsSourceRow,
    NewsTopicRow,
)
from shire.domain.news.repositories import (
    SqlNewsConfigRepository,
    SqlNewsItemRepository,
    SqlNewsPollRepository,
    SqlNewsRecommendationRepository,
    SqlNewsSourceRepository,
    SqlNewsTopicRepository,
)
from shire.domain.news.schemas import (
    CreateNewsSource,
    CreateNewsTopic,
    GenerateRecommendationsResult,
    NewsConfigResult,
    NewsItemResult,
    NewsPollResult,
    NewsRecommendationResult,
    NewsSourceResult,
    NewsTopicResult,
    UpdateNewsConfig,
    UpdateNewsTopic,
)
from shire.domain.repository.models import RepositoryRow
from shire.domain.substrate.models import AnalysisRow, DependencyRow

# Ceiling on the recommendation prompt's portfolio digest.
_DIGEST_CHAR_BUDGET = 8_000
_DIGEST_DEPS_PER_REPO = 15
_DIGEST_NARRATIVE_CHARS = 400


class NewsService:
    """Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._topics = SqlNewsTopicRepository(session)
        self._sources = SqlNewsSourceRepository(session)
        self._items = SqlNewsItemRepository(session)
        self._polls = SqlNewsPollRepository(session)
        self._recommendations = SqlNewsRecommendationRepository(session)
        self._config = SqlNewsConfigRepository(session)

    # --- topics & sources -----------------------------------------------------------
    def list_topics(self) -> list[NewsTopicResult]:
        topics = self._topics.list()
        sources = self._sources.by_topics([t.id for t in topics])
        latest = self._polls.latest_per_topic()
        unread = self._items.unread_counts()
        return [
            NewsTopicResult.of(
                t,
                sources=sources.get(t.id, []),
                latest_poll=latest.get(t.id),
                unread_count=unread.get(t.id, 0),
            )
            for t in topics
        ]

    def create_topic(self, data: CreateNewsTopic) -> NewsTopicResult:
        now = datetime.now(UTC)
        row = NewsTopicRow(
            name=data.name.strip(),
            description=(data.description or "").strip() or None,
            enabled=data.enabled,
            created_at=now,
            updated_at=now,
        )
        self._topics.add(row)
        return NewsTopicResult.of(row, sources=[], latest_poll=None, unread_count=0)

    def update_topic(self, topic_id: uuid.UUID, data: UpdateNewsTopic) -> NewsTopicResult:
        row = self._require_topic(topic_id)
        row.name = data.name.strip()
        row.description = (data.description or "").strip() or None
        row.enabled = data.enabled
        row.updated_at = datetime.now(UTC)
        return NewsTopicResult.of(
            row,
            sources=self._sources.list_for_topic(topic_id),
            latest_poll=self._polls.latest_per_topic().get(topic_id),
            unread_count=self._items.unread_counts().get(topic_id, 0),
        )

    def delete_topic(self, topic_id: uuid.UUID) -> None:
        self._require_topic(topic_id)
        self._topics.delete(topic_id)

    def add_source(self, topic_id: uuid.UUID, data: CreateNewsSource) -> NewsSourceResult:
        self._require_topic(topic_id)
        url = data.url.strip()
        if not url.startswith(("http://", "https://")):
            raise ValidationError("Source URL must start with http:// or https://")
        if self._sources.exists(topic_id, url):
            raise ConflictError("This URL is already a source for the topic.")
        row = NewsSourceRow(
            topic_id=topic_id,
            url=url,
            note=(data.note or "").strip() or None,
            created_at=datetime.now(UTC),
        )
        self._sources.add(row)
        return NewsSourceResult.of(row)

    def delete_source(self, topic_id: uuid.UUID, source_id: uuid.UUID) -> None:
        row = self._sources.get(source_id)
        if row is None or row.topic_id != topic_id:
            raise NotFoundError("Source not found")
        self._sources.delete(source_id)

    # --- the feed ---------------------------------------------------------------------
    def list_items(
        self,
        params: PaginationParams,
        *,
        topic_id: uuid.UUID | None = None,
        unread_only: bool = False,
    ) -> Page[NewsItemResult]:
        rows, total = self._items.page(
            topic_id=topic_id,
            unread_only=unread_only,
            offset=params.offset,
            limit=params.limit,
        )
        names = {t.id: t.name for t in self._topics.list()}
        items = [NewsItemResult.of(r, names.get(r.topic_id, "")) for r in rows]
        return Page.create(items, total, params)

    def mark_item_read(self, item_id: uuid.UUID) -> None:
        row = self._items.get(item_id)
        if row is None:
            raise NotFoundError("News item not found")
        if row.read_at is None:
            row.read_at = datetime.now(UTC)

    def mark_read(self, topic_id: uuid.UUID | None) -> None:
        if topic_id is not None:
            self._require_topic(topic_id)
        self._items.mark_all_read(topic_id)

    # --- polling ------------------------------------------------------------------------
    def poll_topic(self, topic_id: uuid.UUID, *, trigger: str = "manual") -> NewsPollResult:
        """Enqueue one poll job for one topic (non-blocking; the UI polls the runs)."""
        topic = self._require_topic(topic_id)
        if self._polls.has_pending(topic_id):
            raise ConflictError("A poll for this topic is already in flight.")
        return NewsPollResult.of(self._enqueue_poll(topic, trigger))

    def poll_all(self, *, trigger: str = "manual") -> list[NewsPollResult]:
        """Enqueue a poll job per enabled topic, skipping any with a run already in flight."""
        return [
            NewsPollResult.of(self._enqueue_poll(topic, trigger))
            for topic in self._topics.list(enabled_only=True)
            if not self._polls.has_pending(topic.id)
        ]

    def list_polls(self, *, topic_id: uuid.UUID | None = None) -> list[NewsPollResult]:
        return [NewsPollResult.of(r) for r in self._polls.list_recent(topic_id=topic_id)]

    def _enqueue_poll(self, topic: NewsTopicRow, trigger: str) -> NewsPollRow:
        config = self._config.get_or_create()
        jobs = JobService(self._session)
        # Polling headlines is retrieval + filtering — the light tier is plenty.
        _, timeout_seconds = jobs.engine_defaults()
        model = jobs.light_model()
        poll = NewsPollRow(
            topic_id=topic.id,
            status="pending",
            trigger=trigger,
            created_at=datetime.now(UTC),
        )
        self._polls.add(poll)
        job = jobs.enqueue(
            kind=job_kinds.NEWS_POLL,
            title=f"News poll: {topic.name}",
            prompt=build_poll_prompt(
                topic,
                self._sources.list_for_topic(topic.id),
                self._items.recent_for_topic(topic.id, SEEN_LIMIT),
                config.max_items_per_topic,
            ),
            payload={
                # The first web-facing job kind: no repo clone, no cwd (the worker runs in its
                # own directory) — the agent works entirely through WebSearch/WebFetch.
                "allowed_tools": ["WebSearch", "WebFetch"],
                "model": model,
                "timeout_seconds": timeout_seconds,
                "topic_id": str(topic.id),
                "poll_id": str(poll.id),
                "max_items": config.max_items_per_topic,
            },
        )
        poll.job_id = job.id
        return poll

    # --- config ---------------------------------------------------------------------------
    def get_config(self) -> NewsConfigResult:
        row = self._config.get_or_create()
        return self._config_result(row)

    def update_config(self, data: UpdateNewsConfig) -> NewsConfigResult:
        from shire.orchestration.schedule_sync import PrefectScheduleSync, validate_cadence

        try:
            validate_cadence(data.cadence)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        row = self._config.get_or_create()
        row.cadence = data.cadence.strip()
        row.max_items_per_topic = data.max_items_per_topic
        row.updated_at = datetime.now(UTC)
        PrefectScheduleSync(self._session).sync_news()
        return self._config_result(row)

    def _config_result(self, row) -> NewsConfigResult:
        return NewsConfigResult(
            cadence=row.cadence,
            max_items_per_topic=row.max_items_per_topic,
            scheduler_enabled=get_settings().scheduler_enabled,
            updated_at=row.updated_at,
        )

    # --- recommendations --------------------------------------------------------------------
    def list_recommendations(self, *, status: str | None = None) -> list[NewsRecommendationResult]:
        return [NewsRecommendationResult.of(r) for r in self._recommendations.list(status=status)]

    def generate_recommendations(self) -> GenerateRecommendationsResult:
        """Enqueue one recommendation job over the portfolio digest (non-blocking)."""
        if self._has_unsettled_recommend_job():
            raise ConflictError("A topic-recommendation run is already in flight.")
        digest = self._portfolio_digest()
        if not digest:
            raise ConflictError("No analyzed repositories yet — nothing to recommend from.")
        jobs = JobService(self._session)
        _, timeout_seconds = jobs.engine_defaults()
        model = jobs.light_model()
        job = jobs.enqueue(
            kind=job_kinds.NEWS_RECOMMEND,
            title="News: recommend topics",
            prompt=build_recommend_prompt(
                digest,
                sorted(self._topics.names()),
                sorted(self._recommendations.names_with_status("dismissed")),
            ),
            # No tools needed: the digest is embedded in the prompt.
            payload={"model": model, "timeout_seconds": timeout_seconds},
        )
        return GenerateRecommendationsResult(job_id=job.id)

    def accept_recommendation(self, recommendation_id: uuid.UUID) -> NewsTopicResult:
        row = self._require_recommendation(recommendation_id)
        if row.status != "suggested":
            raise ConflictError("This suggestion has already been decided.")
        topic = self.create_topic(
            CreateNewsTopic(name=row.name, description=row.rationale, enabled=True)
        )
        row.status = "accepted"
        row.topic_id = topic.id
        row.decided_at = datetime.now(UTC)
        return topic

    def dismiss_recommendation(self, recommendation_id: uuid.UUID) -> None:
        row = self._require_recommendation(recommendation_id)
        if row.status != "suggested":
            raise ConflictError("This suggestion has already been decided.")
        row.status = "dismissed"
        row.decided_at = datetime.now(UTC)

    # --- internals --------------------------------------------------------------------------
    def _require_topic(self, topic_id: uuid.UUID) -> NewsTopicRow:
        row = self._topics.get(topic_id)
        if row is None:
            raise NotFoundError("Topic not found")
        return row

    def _require_recommendation(self, recommendation_id: uuid.UUID) -> NewsRecommendationRow:
        row = self._recommendations.get(recommendation_id)
        if row is None:
            raise NotFoundError("Recommendation not found")
        return row

    def _has_unsettled_recommend_job(self) -> bool:
        stmt = select(JobRow.id).where(
            JobRow.kind == job_kinds.NEWS_RECOMMEND,
            JobRow.status.in_(("pending", "running")),
        )
        return self._session.scalars(stmt).first() is not None

    def _portfolio_digest(self) -> str:
        """A compact markdown digest of every analyzed repository, for the recommend prompt."""
        sections: list[str] = []
        for repo in self._session.scalars(select(RepositoryRow)):
            analysis = self._session.scalars(
                select(AnalysisRow)
                .where(AnalysisRow.repository_id == repo.id)
                .order_by(AnalysisRow.analyzed_at.desc())
                .limit(1)
            ).first()
            if analysis is None:
                continue
            deps = self._session.scalars(
                select(DependencyRow.name)
                .where(DependencyRow.analysis_id == analysis.id, DependencyRow.is_dev.is_(False))
                .order_by(DependencyRow.name)
                .limit(_DIGEST_DEPS_PER_REPO)
            ).all()
            lines = [f"### {repo.owner}/{repo.name}"]
            if analysis.primary_language:
                lines.append(f"- Primary language: {analysis.primary_language}")
            if deps:
                lines.append(f"- Key dependencies: {', '.join(deps)}")
            if analysis.vulnerability_count:
                lines.append(
                    f"- Vulnerabilities: {analysis.vulnerability_count} "
                    f"(critical {analysis.vuln_critical}, high {analysis.vuln_high})"
                )
            if analysis.maintenance_status:
                lines.append(f"- Maintenance: {analysis.maintenance_status}")
            pack = self._session.get(ContextPackRow, repo.id)
            if pack is not None and pack.narrative:
                lines.append(f"- Narrative: {pack.narrative[:_DIGEST_NARRATIVE_CHARS]}")
            sections.append("\n".join(lines))
        digest = "\n\n".join(sections)
        return digest[:_DIGEST_CHAR_BUDGET]
