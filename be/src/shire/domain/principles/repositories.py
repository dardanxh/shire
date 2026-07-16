"""Data access for principles and their audit checks."""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from shire.domain.principles.models import PrincipleCheckRow, PrincipleRow


class SqlPrincipleRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: PrincipleRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, principle_id: uuid.UUID) -> PrincipleRow | None:
        return self._session.get(PrincipleRow, principle_id)

    def list(self) -> list[PrincipleRow]:
        stmt = select(PrincipleRow).order_by(PrincipleRow.created_at.desc())
        return list(self._session.scalars(stmt))

    def list_for_repository(
        self, repository_id: uuid.UUID, *, enabled_only: bool = False
    ) -> list[PrincipleRow]:
        """Principles applicable to a repository: global ones plus its own."""
        stmt = (
            select(PrincipleRow)
            .where(
                or_(
                    PrincipleRow.repository_id.is_(None),
                    PrincipleRow.repository_id == repository_id,
                )
            )
            .order_by(PrincipleRow.created_at.desc())
        )
        if enabled_only:
            stmt = stmt.where(PrincipleRow.enabled.is_(True))
        return list(self._session.scalars(stmt))

    def delete(self, principle_id: uuid.UUID) -> None:
        row = self.get(principle_id)
        if row is not None:
            self._session.delete(row)
            self._session.flush()


class SqlPrincipleCheckRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: PrincipleCheckRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, check_id: uuid.UUID) -> PrincipleCheckRow | None:
        return self._session.get(PrincipleCheckRow, check_id)

    def latest_for_repository(
        self, repository_id: uuid.UUID
    ) -> dict[uuid.UUID, PrincipleCheckRow]:
        """The newest check per principle for one repository — its current compliance."""
        stmt = (
            select(PrincipleCheckRow)
            .where(PrincipleCheckRow.repository_id == repository_id)
            .order_by(PrincipleCheckRow.created_at.asc())
        )
        latest: dict[uuid.UUID, PrincipleCheckRow] = {}
        for row in self._session.scalars(stmt):
            latest[row.principle_id] = row  # ascending order → last write wins
        return latest

    def latest_per_repository(
        self, principle_id: uuid.UUID
    ) -> dict[uuid.UUID, PrincipleCheckRow]:
        """The newest check per repository for one principle — its fleet-wide standing."""
        stmt = (
            select(PrincipleCheckRow)
            .where(PrincipleCheckRow.principle_id == principle_id)
            .order_by(PrincipleCheckRow.created_at.asc())
        )
        latest: dict[uuid.UUID, PrincipleCheckRow] = {}
        for row in self._session.scalars(stmt):
            latest[row.repository_id] = row
        return latest
