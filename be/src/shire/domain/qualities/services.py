"""Architecture-qualities catalog service.

Content is read-only: list + get over the seeded catalog. The only mutation is
star-only curation (`starred`), which never flips `source` — seed refreshes keep
updating starred rows.
"""

from __future__ import annotations

import uuid

from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.exceptions import NotFoundError
from shire.domain.qualities.models import ArchitectureQualityRow
from shire.domain.qualities.repositories import SqlArchitectureQualityRepository
from shire.domain.qualities.schemas import (
    ArchitectureQualityResult,
    UpdateArchitectureQuality,
)


class ArchitectureQualityService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._qualities = SqlArchitectureQualityRepository(session)

    def list_qualities(
        self,
        params: Params,
        category: str | None = None,
        q: str | None = None,
        starred: bool | None = None,
    ) -> Page[ArchitectureQualityResult]:
        transformer = lambda rows: [  # noqa: E731
            ArchitectureQualityResult.model_validate(row) for row in rows
        ]
        return self._qualities.search(
            params, transformer, category=category, q=q, starred=starred
        )

    def get_qualities(
        self, quality_ids: list[uuid.UUID]
    ) -> list[ArchitectureQualityResult]:
        return [
            ArchitectureQualityResult.model_validate(row)
            for row in self._get_rows(quality_ids)
        ]

    def update_qualities(
        self, updates: list[tuple[uuid.UUID, UpdateArchitectureQuality]]
    ) -> list[ArchitectureQualityResult]:
        rows = self._get_rows([quality_id for quality_id, _ in updates])
        for row, (_, update) in zip(rows, updates, strict=True):
            for field, value in update.model_dump(exclude_unset=True).items():
                setattr(row, field, value)
        self._session.flush()
        return [ArchitectureQualityResult.model_validate(row) for row in rows]

    def _get_rows(self, quality_ids: list[uuid.UUID]) -> list[ArchitectureQualityRow]:
        rows = {row.id: row for row in self._qualities.get(quality_ids)}
        missing = [str(qid) for qid in quality_ids if qid not in rows]
        if missing:
            raise NotFoundError(f"Architecture quality not found: {', '.join(missing)}")
        return [rows[qid] for qid in quality_ids]
