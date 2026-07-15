"""SQLAlchemy ORM entity for jobs — the Postgres-backed work queue shared with the engine service.

One row per Claude invocation. The row is simultaneously the queue message (claimed by an engine
worker via `FOR UPDATE SKIP LOCKED`), the durable crash-recovery record, and the observability
surface the Jobs UI reads (prompt in, result out, timestamps, worker attribution).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from hobits.core.db import Base

# Lifecycle: pending → running (engine claims) → succeeded | failed (engine settles).
# `result_applied` is a separate BE-side flag: the completion dispatcher flips it exactly once
# before running the domain handler, so a settled job is never applied twice.
JOB_STATUSES = ("pending", "running", "succeeded", "failed")


class JobRow(Base):
    __tablename__ = "jobs"

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

    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    worker_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    result_applied: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
