"""SQLAlchemy ORM entity for briefing items."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from hobits.core.db import Base


class BriefingItemRow(Base):
    """One curated item surfaced by a hobit run, placed in a tier by its self-score."""

    __tablename__ = "briefing_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    hobit_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("hobit_runs.id", ondelete="CASCADE"), index=True
    )
    hobit_slug: Mapped[str] = mapped_column(String(64))
    tier: Mapped[str] = mapped_column(String(8), index=True)  # NOW | DAILY | WEEKLY
    headline: Mapped[str] = mapped_column(String(500))
    importance: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[int] = mapped_column(Integer)
    urgency: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
