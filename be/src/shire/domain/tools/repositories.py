"""Data access for the tools catalog projection."""

from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from shire.domain.tools.models import ToolRow


class SqlToolRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> list[ToolRow]:
        return list(self._session.scalars(select(ToolRow).order_by(ToolRow.position)))

    def count(self) -> int:
        return self._session.scalar(select(func.count()).select_from(ToolRow)) or 0

    def replace_all(self, rows: list[ToolRow]) -> None:
        """The catalog is fully recomputed each sync, so wipe and re-insert."""
        self._session.execute(delete(ToolRow))
        self._session.flush()
        self._session.add_all(rows)
