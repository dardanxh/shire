"""SQLAlchemy ORM entities for the hobits domain: config overrides + run history."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from hobits.core.db import Base


class HobitConfigRow(Base):
    """User overrides for a code-defined hobit (keyed by its registry slug). NULL = use default."""

    __tablename__ = "hobit_configs"

    slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
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
