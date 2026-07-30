"""SQLAlchemy ORM entity for the activity log — storage for the Home feed.

One row per user-meaningful event, written inside the transaction that creates the event
(job enqueued, repository onboarded/analyzed, council convened, merge review created).
Rows are plain notifications — a kind, a short title, and the entity to navigate to.
Job status is joined live at read time rather than synced into the row.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class ActivityLogRow(Base):
    __tablename__ = "activity_log"
    __table_args__ = (Index("ix_activity_log_created_at", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # A job kind verbatim (e.g. "hobit.run") or a synthesized kind ("repository.onboarded",
    # "repository.analyzed", "council.convened", "merge_review.created").
    kind: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(500))
    # The click target: the job id for job-backed events, otherwise the entity the event
    # describes (repository, council topic, merge review). No FK — targets span tables.
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    repository_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("repositories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
