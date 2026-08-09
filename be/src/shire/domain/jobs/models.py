"""SQLAlchemy ORM entity for jobs — the Postgres-backed work queue shared with the engine service.

One row per Claude invocation. The row is simultaneously the queue message (claimed by an engine
worker via `FOR UPDATE SKIP LOCKED`), the durable crash-recovery record, and the observability
surface the Jobs UI reads (prompt in, result out, timestamps, worker attribution).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base

# Lifecycle: pending → running (engine claims) → succeeded | failed (engine settles), or
# pending → cancelled (user, before a worker claims it).
# `result_applied` is a separate BE-side flag: the completion dispatcher flips it exactly once
# before running the domain handler, so a settled job is never applied twice.
JOB_STATUSES = ("pending", "running", "succeeded", "failed", "cancelled")


class JobRow(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        # Claim scan: engine workers pick the oldest pending job.
        Index("ix_jobs_status_created_at", "status", "created_at"),
        # Dispatcher sweep: settled jobs whose domain effects haven't been applied yet.
        Index(
            "ix_jobs_unapplied",
            "finished_at",
            postgresql_where=text(
                "status IN ('succeeded','failed','cancelled') AND NOT result_applied"
            ),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default="pending", index=True
    )
    repository_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # The full engine request (prompt/system/cwd/allowed_tools/model/timeout_seconds) plus the
    # domain refs the completion handler needs (review_id, slug, run_id, ...).
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # Denormalized copy of payload["prompt"] so the Jobs UI reads it without unpacking JSONB.
    prompt: Mapped[str] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Session-cumulative token accounting written by the engine: input_tokens,
    # output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
    # total_cost_usd, num_turns.
    usage: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Live agent transcript, streamed by the engine while the job runs (capped list of
    # compact events: {type: text|tool|tool_result, text?, tool?, detail?, error?}).
    progress: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)

    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    worker_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    result_applied: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)


class EngineConfigRow(Base):
    """The engine's runtime settings — one row (id=1), edited from the Jobs → Config tab.

    The backend reads it at enqueue time (default model + timeout baked into new payloads);
    engine workers poll it every few seconds (retry attempts, concurrency), so changes apply
    to every running instance without restarts. Seeded lazily from env-settings defaults.
    """

    __tablename__ = "engine_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    timeout_seconds: Mapped[float] = mapped_column(Float)
    model: Mapped[str] = mapped_column(String(64))
    # Attempts a job may consume before the stale sweep fails it (dead-worker recovery).
    max_attempts: Mapped[int] = mapped_column(Integer)
    # Jobs each engine instance runs in parallel.
    concurrency: Mapped[int] = mapped_column(Integer)
    # Settled jobs older than this are deleted by the hourly cleanup; 0 = keep forever.
    retention_days: Mapped[int] = mapped_column(Integer)
    # Token efficiency: run a repo's/MR's checks in ONE Claude session instead of one per
    # check (explore once, judge N things). Off restores the one-session-per-check behavior.
    batch_checks: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Model for lightweight kinds (classification, news, distillation) — they don't need the
    # default model's depth, and haiku is ~3x cheaper.
    light_model: Mapped[str] = mapped_column(
        String(64), default="haiku", server_default="haiku"
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
