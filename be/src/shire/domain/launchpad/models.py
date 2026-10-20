"""ORM models for the Launchpad: categorised bookmarks, their optional scheduled Claude action,
and that action's run history (the rows that double as notifications).

Usage ranking is a decayed counter (`frecency`) rather than a visit log: each visit decays the
stored score to "now" and adds one, so ordering is a single expression over two columns.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base

LOGO_KINDS = ("favicon", "upload", "monogram")
NOTIFY_ON = ("new_items", "any_attention", "always")
RUN_STATUSES = ("pending", "succeeded", "error")
RUN_OUTCOMES = ("attention", "clear", "error")


class LaunchpadCategoryRow(Base):
    __tablename__ = "launchpad_categories"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    # A lucide icon name, rendered by the UI; free-form so new icons need no migration.
    icon: Mapped[str | None] = mapped_column(String(60), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class BookmarkRow(Base):
    __tablename__ = "launchpad_bookmarks"
    __table_args__ = (
        CheckConstraint(
            "logo_kind IN ('favicon', 'upload', 'monogram')",
            name="ck_launchpad_bookmarks_logo_kind",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(2048))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("launchpad_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    starred: Mapped[bool] = mapped_column(Boolean, default=False)
    logo_kind: Mapped[str] = mapped_column(String(10), default="monogram")
    # Small images only (capped in the service) — a separate blob store would be overkill.
    logo_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    logo_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)
    logo_color: Mapped[str | None] = mapped_column(String(9), nullable=True)
    visit_count: Mapped[int] = mapped_column(Integer, default=0)
    last_visited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Score as of `last_visited_at`; decayed to "now" at read time (see services.frecency_now).
    frecency: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class BookmarkActionRow(Base):
    """The one scheduled Claude action a bookmark may carry."""

    __tablename__ = "launchpad_actions"
    __table_args__ = (
        CheckConstraint(
            "notify_on IN ('new_items', 'any_attention', 'always')",
            name="ck_launchpad_actions_notify_on",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    bookmark_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("launchpad_bookmarks.id", ondelete="CASCADE"), unique=True
    )
    prompt: Mapped[str] = mapped_column(Text)
    mcp_servers: Mapped[list[str]] = mapped_column(ARRAY(String(200)), default=list)
    allow_writes: Mapped[bool] = mapped_column(Boolean, default=False)
    model: Mapped[str | None] = mapped_column(String(60), nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=600)
    cadence: Mapped[str] = mapped_column(String(120), default="manual")
    # IANA zone the cadence's wall-clock times are read in (the browser's, captured on save).
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_on: Mapped[str] = mapped_column(String(20), default="new_items")
    # Item keys already reported (e.g. Jira issue keys) so a ticket notifies once, not every run.
    seen_keys: Mapped[list[str]] = mapped_column(JSONB, default=list)
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ActionRunRow(Base):
    """One execution of an action. Rows with `notify` set are the user's notifications."""

    __tablename__ = "launchpad_action_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'succeeded', 'error')", name="ck_launchpad_runs_status"
        ),
        CheckConstraint(
            "outcome IS NULL OR outcome IN ('attention', 'clear', 'error')",
            name="ck_launchpad_runs_outcome",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    action_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("launchpad_actions.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True
    )
    trigger: Mapped[str] = mapped_column(String(20), default="manual")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    outcome: Mapped[str | None] = mapped_column(String(20), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{key, title, url, detail, is_new}]
    items: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    new_count: Mapped[int] = mapped_column(Integer, default=0)
    notify: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
