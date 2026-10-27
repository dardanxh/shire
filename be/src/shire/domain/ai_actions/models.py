"""SQLAlchemy ORM entity for AI Actions.

One row per action: the prompt and how to run it, plus its *latest* run. There is deliberately no
run-history table — only the last result is kept, so each run overwrites the `last_*` columns.
The report HTML itself is `deferred`: the card grid never loads it, only the report endpoint does.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, deferred, mapped_column

from shire.core.db import Base

# Settled state of the last run, as the action row records it. `running` is never stored: while
# the engine works the row says `pending`, and the service reads the live job status on top.
RUN_STATUSES = ("pending", "succeeded", "failed")
TRIGGERS = ("manual", "schedule")


class AiActionRow(Base):
    __tablename__ = "ai_actions"
    __table_args__ = (
        CheckConstraint(
            "last_status IS NULL OR last_status IN ('pending', 'succeeded', 'failed')",
            name="ck_ai_actions_last_status",
        ),
        CheckConstraint(
            "last_trigger IS NULL OR last_trigger IN ('manual', 'schedule')",
            name="ck_ai_actions_last_trigger",
        ),
        CheckConstraint(
            "last_report_format IS NULL OR last_report_format IN ('html', 'text')",
            name="ck_ai_actions_last_report_format",
        ),
        # The ticker's scan: enabled actions whose next slot has passed.
        Index("ix_ai_actions_next_run_at", "next_run_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200))
    prompt: Mapped[str] = mapped_column(Text)
    # None = the engine default from the Jobs → Config tab.
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    schedule: Mapped[str] = mapped_column(String(200), default="manual")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    # Pauses the schedule without losing it; "Run now" still works.
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Shell access (Bash). Skills often need it for `date`/`git`; free-form prompts rarely do.
    allow_shell: Mapped[bool] = mapped_column(Boolean, default=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=900)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # --- the latest run ------------------------------------------------------------------
    last_job_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True
    )
    last_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_trigger: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # What the last manual run appended to the prompt (`14` for `/dx-github-prs 14`), so the
    # Run box can offer it again. Scheduled runs never take arguments.
    last_arguments: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_queued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_usage: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The newest *successful* report. A failed run records its error but keeps the previous
    # report on screen rather than blanking it.
    last_report_html: Mapped[str | None] = deferred(mapped_column(Text, nullable=True))
    last_report_format: Mapped[str | None] = mapped_column(String(8), nullable=True)
    last_report_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
