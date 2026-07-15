"""SQLAlchemy ORM entities for principles: the codified engineering convictions the platform
holds every repository to, and the per-audit verdicts.

A principle is a natural-language rule ("every endpoint must require auth"). An audit runs one
engine job per (principle, repository); the verdict — upheld or violated, with cited files —
lands on a check row. Checks are append-only, so compliance history accumulates per repo.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from hobits.core.db import Base

PRINCIPLE_SEVERITIES = ("info", "warning", "critical")

# Check lifecycle: pending (job queued/running) → upheld | violated | error.
CHECK_STATUSES = ("pending", "upheld", "violated", "error")


class PrincipleRow(Base):
    __tablename__ = "principles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    # The rule itself, in plain language — this is what the auditor enforces.
    statement: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16), default="warning", server_default="warning")
    # NULL = applies to every repository; set = scoped to one repository.
    repository_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True, index=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PrincipleCheckRow(Base):
    """One audit verdict for one principle against one repository (append-only history;
    the newest row per pair is the current compliance state)."""

    __tablename__ = "principle_checks"
    __table_args__ = (
        Index("ix_principle_checks_pair_created", "principle_id", "repository_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    principle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("principles.id", ondelete="CASCADE"), index=True
    )
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    # The engine job that produced (or will produce) the verdict.
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Cited violations: [{file, line?, explanation}].
    violations: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Provenance: what was audited.
    commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
