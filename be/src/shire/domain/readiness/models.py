"""ORM models for AI-readiness suggestions and make-ai-ready executions.

A fresh suggest run replaces the repository's `proposed` rows (fresh advice); `applied`
rows are kept as history, linked to the execution that implemented them. Executions
only ever produce a LOCAL branch + commit — no push, no PR, regardless of provider.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base


class ReadinessSuggestionRow(Base):
    __tablename__ = "readiness_suggestions"
    __table_args__ = (
        CheckConstraint("action IN ('add', 'edit')", name="ck_readiness_suggestions_action"),
        CheckConstraint(
            "status IN ('proposed', 'applied')", name="ck_readiness_suggestions_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    assistant: Mapped[str] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(String(10))
    path: Mapped[str] = mapped_column(String(300))
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(10), default="proposed")
    execution_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ReadinessExecutionRow(Base):
    __tablename__ = "readiness_executions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed')",
            name="ck_readiness_executions_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(10), default="pending")
    branch: Mapped[str] = mapped_column(String(160))
    # Absolute path while the run is in flight; cleared after cleanup.
    worktree_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    base_sha: Mapped[str] = mapped_column(String(64), default="")
    commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agent_summary: Mapped[str] = mapped_column(Text, default="")
    # Denormalized for display — which suggestion rows this run implemented.
    suggestion_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
