"""ORM model for compliance checks — one row per (repository, regulation) run.

Every run is kept (history, newest first in the UI); re-running the same pair adds a new
row so drift over time stays visible. The regulation is referenced softly (slug + name
denormalized) so catalog edits never mutate past results.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base


class ComplianceCheckRow(Base):
    __tablename__ = "compliance_checks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'done', 'failed')", name="ck_compliance_checks_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    # Denormalized for display — a check remains readable even if the repo is renamed.
    repository_slug: Mapped[str] = mapped_column(String(320))
    regulation_slug: Mapped[str] = mapped_column(String(160), index=True)
    regulation_name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(10), default="queued")
    # Agent verdict: compliant | partial | non_compliant | not_applicable (None until done).
    verdict: Mapped[str | None] = mapped_column(String(20), nullable=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    # [{title, status: ok|gap|unclear, note, article_ref?}] — code-level observations.
    findings: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
