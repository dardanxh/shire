"""ORM models for the CI/CD analysis, its suggestions, and implement-with-AI executions.

One `cicd_analyses` row per repository — a scan replaces it whole, so the JSONB payloads are a
render target rather than something to query by field. Suggestions follow the AI-readiness rules:
a fresh run replaces the `proposed` rows of that source; `applied` rows stay as history, linked to
the execution that implemented them. Executions only ever produce a LOCAL branch + commit — no
push, no PR.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base


class CicdAnalysisRow(Base):
    __tablename__ = "cicd_analyses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), unique=True, index=True
    )
    # CiCdSystem values the scan actually reasoned about (the focused three).
    platforms: Mapped[list] = mapped_column(JSONB, default=list)
    config_files: Mapped[list] = mapped_column(JSONB, default=list)
    summary: Mapped[str] = mapped_column(Text, default="")
    # Long-living environments, promotion transitions between them, and the pipelines behind
    # both — shapes defined by the schemas in this domain.
    environments: Mapped[list] = mapped_column(JSONB, default=list)
    transitions: Mapped[list] = mapped_column(JSONB, default=list)
    pipelines: Mapped[list] = mapped_column(JSONB, default=list)
    branch: Mapped[str] = mapped_column(String(160), default="")
    commit_sha: Mapped[str] = mapped_column(String(64), default="")
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CicdSuggestionRow(Base):
    __tablename__ = "cicd_suggestions"
    __table_args__ = (
        CheckConstraint("source IN ('scan', 'hobit')", name="ck_cicd_suggestions_source"),
        CheckConstraint(
            "status IN ('proposed', 'applied')", name="ck_cicd_suggestions_status"
        ),
        CheckConstraint(
            "impact IN ('high', 'medium', 'low')", name="ck_cicd_suggestions_impact"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    # Which engine found it: the structured tab scan, or the deeper ci-cd hobit audit.
    source: Mapped[str] = mapped_column(String(8), default="scan")
    category: Mapped[str] = mapped_column(String(24), default="practice")
    impact: Mapped[str] = mapped_column(String(8), default="medium")
    effort: Mapped[str] = mapped_column(String(8), default="medium")
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(Text, default="")
    # Pipeline files the suggestion targets — what the apply run is allowed to touch.
    paths: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(10), default="proposed")
    execution_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CicdExecutionRow(Base):
    __tablename__ = "cicd_executions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed')",
            name="ck_cicd_executions_status",
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
    changed_files: Mapped[list] = mapped_column(JSONB, default=list)
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
