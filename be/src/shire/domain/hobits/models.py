"""SQLAlchemy ORM entities for the hobits domain: config overrides + run history."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class CustomHobitRow(Base):
    """A user-authored hobit, stored in full (identity + config). Unlike the code roster, these
    are created/edited/deleted at runtime; they drive the same RepoHobit engine via their spec."""

    __tablename__ = "custom_hobits"

    slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    charter: Mapped[str] = mapped_column(Text)
    instructions: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(64))
    timeout_seconds: Mapped[float] = mapped_column(Float)
    tags: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RemovedHobitRow(Base):
    """A built-in hobit the user deleted. The code roster is a seed — this row hides its spec
    everywhere (listing, runs, assignment) until the row is deleted again."""

    __tablename__ = "removed_hobits"

    slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    removed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class HobitConfigRow(Base):
    """User overrides for a code-defined hobit (keyed by its registry slug). NULL = use default."""

    __tablename__ = "hobit_configs"

    slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    # Display-name override. NULL = use the spec's name.
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    charter: Mapped[str | None] = mapped_column(Text, nullable=True)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    timeout_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Comma-joined tag override. NULL = use the spec's default tags.
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RepositoryHobitRow(Base):
    """Per-repo hobit access allow-list — which hobits may run on a repository."""

    __tablename__ = "repository_hobits"

    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True
    )
    hobit_slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Run cadence for this assignment: "manual" | "hourly" | "daily" | "weekly" | "cron:<expr>".
    cadence: Mapped[str] = mapped_column(String(64), default="manual", server_default="manual")
    # When the scheduler last evaluated this assignment (ran or skipped-as-unchanged).
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class HobitRunRow(Base):
    """One hobit run against one repository (append-only history)."""

    __tablename__ = "hobit_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    hobit_slug: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(20))
    trigger: Mapped[str] = mapped_column(String(16), default="manual", server_default="manual")
    commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    headline: Mapped[str | None] = mapped_column(String(500), nullable=True)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    importance: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    urgency: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tier: Mapped[str | None] = mapped_column(String(8), nullable=True)
    raw_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HobitRunFeedbackRow(Base):
    """The user's rating of one run's response — one row per run, replaced on re-rate."""

    __tablename__ = "hobit_run_feedback"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_feedback_rating_range"),
    )

    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("hobit_runs.id", ondelete="CASCADE"), primary_key=True
    )
    hobit_slug: Mapped[str] = mapped_column(String(64), index=True)
    # owner/name snapshot so prompt-building never joins the repositories table.
    repository_slug: Mapped[str] = mapped_column(String(512))
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class HobitGuidanceRow(Base):
    """Machine-written standing guidance per hobit, distilled from accumulated feedback.
    Slug-keyed with no FK: built-in hobits live in code, custom ones in `custom_hobits`."""

    __tablename__ = "hobit_guidance"

    hobit_slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    guidance: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_distilled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # How many feedback entries existed when the guidance was last distilled.
    feedback_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Debounce marker: a distill job is in flight (cleared when it settles or fails).
    distill_enqueued_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
