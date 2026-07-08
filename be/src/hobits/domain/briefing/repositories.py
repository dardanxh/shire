"""Data access for briefing items."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from hobits.domain.briefing.models import BriefingItemRow


class SqlBriefingRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, item: BriefingItemRow) -> None:
        self._session.add(item)

    def list_all(self) -> list[BriefingItemRow]:
        """Every briefing item, newest first (fleet-wide)."""
        stmt = select(BriefingItemRow).order_by(BriefingItemRow.created_at.desc())
        return list(self._session.scalars(stmt))
