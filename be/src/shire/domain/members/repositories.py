"""Data access for member exclusions."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.domain.members.models import MemberExclusionRow


class SqlMemberExclusionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> list[MemberExclusionRow]:
        return list(
            self._session.scalars(
                select(MemberExclusionRow).order_by(MemberExclusionRow.created_at)
            )
        )

    def get_by_pattern(self, pattern: str) -> MemberExclusionRow | None:
        return self._session.scalars(
            select(MemberExclusionRow).where(MemberExclusionRow.pattern == pattern)
        ).first()

    def add(self, row: MemberExclusionRow) -> None:
        self._session.add(row)

    def delete(self, exclusion_id: uuid.UUID) -> bool:
        row = self._session.get(MemberExclusionRow, exclusion_id)
        if row is None:
            return False
        self._session.delete(row)
        return True
