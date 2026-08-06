"""Data access for highlights."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from shire.domain.highlights.models import HighlightRow


class SqlHighlightRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: HighlightRow) -> None:
        self._session.add(row)
        self._session.flush()  # row.id available to the caller

    def get(self, highlight_id: uuid.UUID) -> HighlightRow | None:
        return self._session.get(HighlightRow, highlight_id)

    def count(self) -> int:
        return self._session.scalar(select(func.count()).select_from(HighlightRow)) or 0

    def list(self, *, limit: int, offset: int) -> list[HighlightRow]:
        """Newest first. The id tiebreaker keeps paging stable when two highlights share a
        timestamp (saving several passages in one sitting)."""
        stmt = (
            select(HighlightRow)
            .order_by(HighlightRow.created_at.desc(), HighlightRow.id)
            .limit(limit)
            .offset(offset)
        )
        return list(self._session.scalars(stmt))

    def delete(self, highlight_id: uuid.UUID) -> None:
        self._session.execute(delete(HighlightRow).where(HighlightRow.id == highlight_id))
