"""Data access for member exclusions and identity merges."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.domain.members.models import MemberExclusionRow, MemberMergeRow


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


class SqlMemberMergeRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> list[MemberMergeRow]:
        return list(
            self._session.scalars(
                select(MemberMergeRow).order_by(
                    MemberMergeRow.primary_email, MemberMergeRow.created_at
                )
            )
        )

    def get_by_alias(self, alias_email: str) -> MemberMergeRow | None:
        return self._session.scalars(
            select(MemberMergeRow).where(MemberMergeRow.alias_email == alias_email)
        ).first()

    def add_all(self, rows: list[MemberMergeRow]) -> None:
        self._session.add_all(rows)

    def delete(self, merge_id: uuid.UUID) -> bool:
        row = self._session.get(MemberMergeRow, merge_id)
        if row is None:
            return False
        self._session.delete(row)
        return True
