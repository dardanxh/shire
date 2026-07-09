"""Data access for briefing items."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from hobits.domain.briefing.models import BriefingItemRow


class SqlBriefingRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, item: BriefingItemRow) -> None:
        self._session.add(item)

    def list_all(self, hobit_slug: str | None = None) -> list[BriefingItemRow]:
        """Briefing items newest first — optionally filtered to one hobit."""
        stmt = select(BriefingItemRow).order_by(BriefingItemRow.created_at.desc())
        if hobit_slug is not None:
            stmt = stmt.where(BriefingItemRow.hobit_slug == hobit_slug)
        return list(self._session.scalars(stmt))

    def unread_counts(self) -> dict[str, int]:
        """{hobit_slug: number of unread posts} across all repositories."""
        stmt = (
            select(BriefingItemRow.hobit_slug, func.count())
            .where(BriefingItemRow.read_at.is_(None))
            .group_by(BriefingItemRow.hobit_slug)
        )
        return dict(self._session.execute(stmt).all())

    def mark_read(self, item_id: uuid.UUID) -> None:
        self._session.execute(
            update(BriefingItemRow)
            .where(BriefingItemRow.id == item_id, BriefingItemRow.read_at.is_(None))
            .values(read_at=datetime.now(UTC))
        )

    def mark_read_for_hobit(self, hobit_slug: str | None) -> None:
        """Mark every unread post read — all hobits, or just one when a slug is given."""
        stmt = update(BriefingItemRow).where(BriefingItemRow.read_at.is_(None))
        if hobit_slug is not None:
            stmt = stmt.where(BriefingItemRow.hobit_slug == hobit_slug)
        self._session.execute(stmt.values(read_at=datetime.now(UTC)))
