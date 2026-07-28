"""Security & data privacy catalog services.

Content is read-only: list + get over the seeded catalogs. The only mutation is
star-only curation (`starred`), which never flips `source` — seed refreshes keep
updating starred rows.
"""

from __future__ import annotations

import uuid

from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.exceptions import NotFoundError
from shire.domain.security.models import DataRegulationRow, DataSafetyPracticeRow
from shire.domain.security.repositories import (
    SqlDataRegulationRepository,
    SqlDataSafetyPracticeRepository,
)
from shire.domain.security.schemas import (
    DataRegulationResult,
    DataSafetyPracticeResult,
    UpdateDataRegulation,
    UpdateDataSafetyPractice,
)


class DataRegulationService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._regulations = SqlDataRegulationRepository(session)

    def list_regulations(
        self,
        params: Params,
        category: str | None = None,
        region: str | None = None,
        q: str | None = None,
        starred: bool | None = None,
    ) -> Page[DataRegulationResult]:
        transformer = lambda rows: [DataRegulationResult.model_validate(row) for row in rows]  # noqa: E731
        return self._regulations.search(
            params, transformer, category=category, region=region, q=q, starred=starred
        )

    def get_regulations(self, regulation_ids: list[uuid.UUID]) -> list[DataRegulationResult]:
        return [
            DataRegulationResult.model_validate(row)
            for row in self._get_rows(regulation_ids)
        ]

    def update_regulations(
        self, updates: list[tuple[uuid.UUID, UpdateDataRegulation]]
    ) -> list[DataRegulationResult]:
        rows = self._get_rows([regulation_id for regulation_id, _ in updates])
        for row, (_, update) in zip(rows, updates, strict=True):
            for field, value in update.model_dump(exclude_unset=True).items():
                setattr(row, field, value)
        self._session.flush()
        return [DataRegulationResult.model_validate(row) for row in rows]

    def _get_rows(self, regulation_ids: list[uuid.UUID]) -> list[DataRegulationRow]:
        rows = {row.id: row for row in self._regulations.get(regulation_ids)}
        missing = [str(rid) for rid in regulation_ids if rid not in rows]
        if missing:
            raise NotFoundError(f"Data regulation not found: {', '.join(missing)}")
        return [rows[rid] for rid in regulation_ids]


class DataSafetyPracticeService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._practices = SqlDataSafetyPracticeRepository(session)

    def list_practices(
        self,
        params: Params,
        category: str | None = None,
        complexity: str | None = None,
        q: str | None = None,
        starred: bool | None = None,
    ) -> Page[DataSafetyPracticeResult]:
        transformer = lambda rows: [DataSafetyPracticeResult.model_validate(row) for row in rows]  # noqa: E731
        return self._practices.search(
            params, transformer, category=category, complexity=complexity, q=q, starred=starred
        )

    def get_practices(self, practice_ids: list[uuid.UUID]) -> list[DataSafetyPracticeResult]:
        return [
            DataSafetyPracticeResult.model_validate(row)
            for row in self._get_rows(practice_ids)
        ]

    def update_practices(
        self, updates: list[tuple[uuid.UUID, UpdateDataSafetyPractice]]
    ) -> list[DataSafetyPracticeResult]:
        rows = self._get_rows([practice_id for practice_id, _ in updates])
        for row, (_, update) in zip(rows, updates, strict=True):
            for field, value in update.model_dump(exclude_unset=True).items():
                setattr(row, field, value)
        self._session.flush()
        return [DataSafetyPracticeResult.model_validate(row) for row in rows]

    def _get_rows(self, practice_ids: list[uuid.UUID]) -> list[DataSafetyPracticeRow]:
        rows = {row.id: row for row in self._practices.get(practice_ids)}
        missing = [str(pid) for pid in practice_ids if pid not in rows]
        if missing:
            raise NotFoundError(f"Data safety practice not found: {', '.join(missing)}")
        return [rows[pid] for pid in practice_ids]
