"""Pydantic I/O schemas for the news domain (Create / Update / Result)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from shire.domain.news.models import (
    NewsItemRow,
    NewsPollRow,
    NewsRecommendationRow,
    NewsSourceRow,
    NewsTopicRow,
)


class CreateNewsTopic(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    enabled: bool = True


class UpdateNewsTopic(CreateNewsTopic):
    """Full edit — same shape as create."""


class CreateNewsSource(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    note: str | None = Field(default=None, max_length=255)


class UpdateNewsConfig(BaseModel):
    cadence: str = Field(min_length=1, max_length=64)
    max_items_per_topic: int = Field(ge=1, le=50)


class NewsSourceResult(BaseModel):
    id: uuid.UUID
    topic_id: uuid.UUID
    url: str
    note: str | None
    created_at: datetime

    @classmethod
    def of(cls, row: NewsSourceRow) -> NewsSourceResult:
        return cls(
            id=row.id, topic_id=row.topic_id, url=row.url, note=row.note,
            created_at=row.created_at,
        )


class NewsPollResult(BaseModel):
    """One poll run (the newest one per topic doubles as its current fetch state)."""

    id: uuid.UUID
    topic_id: uuid.UUID
    job_id: uuid.UUID | None
    status: str
    trigger: str
    items_found: int | None
    items_inserted: int | None
    error: str | None
    duration_seconds: float | None
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(cls, row: NewsPollRow) -> NewsPollResult:
        return cls(
            id=row.id,
            topic_id=row.topic_id,
            job_id=row.job_id,
            status=row.status,
            trigger=row.trigger,
            items_found=row.items_found,
            items_inserted=row.items_inserted,
            error=row.error,
            duration_seconds=row.duration_seconds,
            created_at=row.created_at,
            finished_at=row.finished_at,
        )


class NewsTopicResult(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    enabled: bool
    last_polled_at: datetime | None
    created_at: datetime
    updated_at: datetime
    sources: list[NewsSourceResult]
    latest_poll: NewsPollResult | None
    unread_count: int

    @classmethod
    def of(
        cls,
        row: NewsTopicRow,
        *,
        sources: list[NewsSourceRow],
        latest_poll: NewsPollRow | None,
        unread_count: int,
    ) -> NewsTopicResult:
        return cls(
            id=row.id,
            name=row.name,
            description=row.description,
            enabled=row.enabled,
            last_polled_at=row.last_polled_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
            sources=[NewsSourceResult.of(s) for s in sources],
            latest_poll=NewsPollResult.of(latest_poll) if latest_poll else None,
            unread_count=unread_count,
        )


class NewsItemResult(BaseModel):
    id: uuid.UUID
    topic_id: uuid.UUID
    topic_name: str
    title: str
    url: str
    domain: str | None
    summary: str | None
    published_at: datetime | None
    from_configured_source: bool
    created_at: datetime
    read_at: datetime | None

    @classmethod
    def of(cls, row: NewsItemRow, topic_name: str) -> NewsItemResult:
        return cls(
            id=row.id,
            topic_id=row.topic_id,
            topic_name=topic_name,
            title=row.title,
            url=row.url,
            domain=row.domain,
            summary=row.summary,
            published_at=row.published_at,
            from_configured_source=row.from_configured_source,
            created_at=row.created_at,
            read_at=row.read_at,
        )


class NewsRecommendationResult(BaseModel):
    id: uuid.UUID
    name: str
    rationale: str | None
    status: str
    topic_id: uuid.UUID | None
    job_id: uuid.UUID | None
    created_at: datetime
    decided_at: datetime | None

    @classmethod
    def of(cls, row: NewsRecommendationRow) -> NewsRecommendationResult:
        return cls(
            id=row.id,
            name=row.name,
            rationale=row.rationale,
            status=row.status,
            topic_id=row.topic_id,
            job_id=row.job_id,
            created_at=row.created_at,
            decided_at=row.decided_at,
        )


class NewsConfigResult(BaseModel):
    cadence: str
    max_items_per_topic: int
    # Whether the Prefect scheduler is on for this install — the config panel uses it to warn
    # that a non-manual cadence won't fire until the scheduler stack is enabled.
    scheduler_enabled: bool
    updated_at: datetime


class GenerateRecommendationsResult(BaseModel):
    """The enqueued generation job — the UI tracks it and re-polls the suggestion list."""

    job_id: uuid.UUID
