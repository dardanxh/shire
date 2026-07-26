"""Security & data privacy catalog services.

Read-only this iteration: list + get over the seeded catalogs. Mutations arrive with a
later chunk if the catalogs become user-editable.
"""

from __future__ import annotations

import uuid

from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.exceptions import NotFoundError
from shire.domain.security.repositories import (
    SqlDataRegulationRepository,
    SqlDataSafetyPracticeRepository,
)
from shire.domain.security.schemas import DataRegulationResult, DataSafetyPracticeResult


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
    ) -> Page[DataRegulationResult]:
        transformer = lambda rows: [DataRegulationResult.model_validate(row) for row in rows]  # noqa: E731
        return self._regulations.search(params, transformer, category=category, region=region, q=q)

    def get_regulations(self, regulation_ids: list[uuid.UUID]) -> list[DataRegulationResult]:
        rows = {row.id: row for row in self._regulations.get(regulation_ids)}
        missing = [str(rid) for rid in regulation_ids if rid not in rows]
        if missing:
            raise NotFoundError(f"Data regulation not found: {', '.join(missing)}")
        return [DataRegulationResult.model_validate(rows[rid]) for rid in regulation_ids]


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
    ) -> Page[DataSafetyPracticeResult]:
        transformer = lambda rows: [DataSafetyPracticeResult.model_validate(row) for row in rows]  # noqa: E731
        return self._practices.search(
            params, transformer, category=category, complexity=complexity, q=q
        )

    def get_practices(self, practice_ids: list[uuid.UUID]) -> list[DataSafetyPracticeResult]:
        rows = {row.id: row for row in self._practices.get(practice_ids)}
        missing = [str(pid) for pid in practice_ids if pid not in rows]
        if missing:
            raise NotFoundError(f"Data safety practice not found: {', '.join(missing)}")
        return [DataSafetyPracticeResult.model_validate(rows[pid]) for pid in practice_ids]
