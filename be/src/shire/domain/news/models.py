"""SQLAlchemy ORM entities for the news module: web-news topics, their source URLs, the
deduplicated article feed, per-topic poll runs, and repo-context topic recommendations.

A topic is a standing interest ("agentic AI") with optional source URLs the polling agent
must check; each poll run is one engine job per topic whose parsed items land in the feed.
`news_items.fingerprint` (a hash of the normalized article URL) is globally unique — the hard
guarantee that the same article never appears twice, no matter how many runs report it.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base

# Poll lifecycle: pending (job queued/running) → succeeded | error.
POLL_STATUSES = ("pending", "succeeded", "error")
POLL_TRIGGERS = ("manual", "scheduled")

# Recommendation lifecycle: suggested → accepted (topic created) | dismissed (never re-suggested).
RECOMMENDATION_STATUSES = ("suggested", "accepted", "dismissed")


class NewsTopicRow(Base):
    __tablename__ = "news_topics"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    # Optional plain-language framing — injected into the poll prompt to sharpen search queries.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # When the last successful poll settled; drives the "items newer than X" cutoff in the prompt.
    last_polled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class NewsSourceRow(Base):
    """One URL the polling agent must fetch for a topic (release-notes pages, vendor blogs, ...)."""

    __tablename__ = "news_sources"
    __table_args__ = (UniqueConstraint("topic_id", "url", name="uq_news_sources_topic_url"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    topic_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("news_topics.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(2048))
    # Optional human label ("Databricks release notes") shown in the config UI.
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class NewsItemRow(Base):
    """One deduplicated article in the feed."""

    __tablename__ = "news_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    topic_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("news_topics.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500))
    # The article URL exactly as the agent reported it (the fingerprint holds the normalized form).
    url: Mapped[str] = mapped_column(Text)
    # Lowercased host, for the feed's source chip.
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Best-effort publication date as reported by the agent.
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # sha256 hex of the normalized URL. Globally unique: the same article never enters the feed
    # twice, even when two topics surface it — the first insert wins.
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # Whether it came from a configured source URL (vs. discovered by web search).
    from_configured_source: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    # The engine job that reported it.
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    # When the user marked this item seen. NULL = unread (drives the unread counts).
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )


class NewsPollRow(Base):
    """One poll run for one topic (append-only; the newest row per topic is its current state)."""

    __tablename__ = "news_polls"
    __table_args__ = (Index("ix_news_polls_topic_created", "topic_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    topic_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("news_topics.id", ondelete="CASCADE"), index=True
    )
    # The engine job that runs (or ran) the poll.
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    trigger: Mapped[str] = mapped_column(String(16), default="manual", server_default="manual")
    # found = what the agent reported; inserted = what survived dedup (inserted < found is normal).
    items_found: Mapped[int | None] = mapped_column(Integer, nullable=True)
    items_inserted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NewsRecommendationRow(Base):
    """One topic suggestion derived from the repo portfolio's context digest."""

    __tablename__ = "news_recommendations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    # Why the portfolio suggests this topic ("3 repos depend on langgraph ...").
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), default="suggested", server_default="suggested", index=True
    )
    # The topic created on accept.
    topic_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    # The engine job that generated the suggestion.
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NewsConfigRow(Base):
    """News module settings — one row (id=1), edited from the News → Topics tab.

    The cadence feeds the Prefect deployment (`sync_news`); it persists even with the scheduler
    disabled so enabling Prefect later converges on startup. Seeded lazily with defaults.
    """

    __tablename__ = "news_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    # manual | hourly | daily | weekly | cron:<expr> (validated by validate_cadence).
    cadence: Mapped[str] = mapped_column(String(64), default="daily", server_default="daily")
    # Cap on articles the agent may report per topic per run.
    max_items_per_topic: Mapped[int] = mapped_column(Integer, default=10, server_default="10")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
