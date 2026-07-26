"""Architecture-qualities catalog service.

Read-only: list + get over the seeded catalog.
"""

from __future__ import annotations

import uuid

from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.exceptions import NotFoundError
from shire.domain.qualities.repositories import SqlArchitectureQualityRepository
from shire.domain.qualities.schemas import ArchitectureQualityResult


class ArchitectureQualityService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._qualities = SqlArchitectureQualityRepository(session)

    def list_qualities(
        self,
        params: Params,
        category: str | None = None,
        q: str | None = None,
    ) -> Page[ArchitectureQualityResult]:
        transformer = lambda rows: [  # noqa: E731
            ArchitectureQualityResult.model_validate(row) for row in rows
        ]
        return self._qualities.search(params, transformer, category=category, q=q)

    def get_qualities(
        self, quality_ids: list[uuid.UUID]
    ) -> list[ArchitectureQualityResult]:
        rows = {row.id: row for row in self._qualities.get(quality_ids)}
        missing = [str(qid) for qid in quality_ids if qid not in rows]
        if missing:
            raise NotFoundError(f"Architecture quality not found: {', '.join(missing)}")
        return [ArchitectureQualityResult.model_validate(rows[qid]) for qid in quality_ids]
