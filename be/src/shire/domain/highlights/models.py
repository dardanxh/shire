"""SQLAlchemy ORM entity for highlights — passages the user kept while reading AI prose.

One row per highlight: the selected text plus enough about where it came from to link back.
The source is a generic pointer (`source_kind` + `source_id`), the same shape `activity_log`
uses — no foreign key, because targets span tables, and no UI path, because mapping a kind to
a route is the SPA's job. `source_label` is denormalized so the list renders without joining
across half the domains.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class HighlightRow(Base):
    __tablename__ = "highlights"
    __table_args__ = (Index("ix_highlights_created_at", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # The passage itself, exactly as the user selected it (whitespace-collapsed by the service).
    text: Mapped[str] = mapped_column(Text)
    # Where it was read: a dotted kind the UI turns back into a route, e.g. "repository.ask",
    # "merge_review", "council", "developments.feed".
    source_kind: Mapped[str] = mapped_column(String(64))
    # The entity to return to (repository, merge review, council topic). No FK — targets span
    # tables. NULL for pages that have no entity of their own (Developments).
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    # What to show in the list ("repos/data-dbt · Ask") — captured at save time, so a later
    # rename or deletion can't leave the entry unreadable.
    source_label: Mapped[str] = mapped_column(String(300))
    repository_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
