"""SQLAlchemy ORM entities for the Watchlist domain (Developments feed + Pulse)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class PulseSummaryRow(Base):
    """A cached Pulse "what has been accomplished" narrative.

    Keyed by (repository, window start date, head commit): the same window re-viewed costs
    zero tokens, and any new commit (head moves) naturally invalidates the cache.
    """

    __tablename__ = "pulse_summaries"
    __table_args__ = (
        UniqueConstraint(
            "repository_id", "since_date", "head_sha", name="uq_pulse_summary_window"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    since_date: Mapped[date] = mapped_column(Date)
    head_sha: Mapped[str] = mapped_column(String(64))
    narrative: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
