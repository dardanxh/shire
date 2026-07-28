"""Data access for the architecture-qualities catalog."""

from __future__ import annotations

import uuid

from fastapi_pagination import Params
from fastapi_pagination.bases import AbstractPage
from fastapi_pagination.ext.sqlalchemy import paginate
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from shire.domain.qualities.models import ArchitectureQualityRow


class SqlArchitectureQualityRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def search(
        self,
        params: Params,
        transformer,
        category: str | None = None,
        q: str | None = None,
        starred: bool | None = None,
    ) -> AbstractPage:
        query: Select = select(ArchitectureQualityRow).order_by(
            ArchitectureQualityRow.category,
            ArchitectureQualityRow.position,
            ArchitectureQualityRow.name,
        )
        if category:
            query = query.where(ArchitectureQualityRow.category == category)
        if starred is not None:
            query = query.where(ArchitectureQualityRow.starred.is_(starred))
        if q:
            pattern = f"%{q}%"
            query = query.where(
                ArchitectureQualityRow.name.ilike(pattern)
                | ArchitectureQualityRow.summary.ilike(pattern)
                | ArchitectureQualityRow.description.ilike(pattern)
            )
        return paginate(self._session, query, params, transformer=transformer)

    def get(self, quality_ids: list[uuid.UUID]) -> list[ArchitectureQualityRow]:
        if not quality_ids:
            return []
        return list(
            self._session.scalars(
                select(ArchitectureQualityRow).where(
                    ArchitectureQualityRow.id.in_(quality_ids)
                )
            )
        )

    def get_by_slugs(self, slugs: list[str]) -> list[ArchitectureQualityRow]:
        if not slugs:
            return []
        return list(
            self._session.scalars(
                select(ArchitectureQualityRow).where(
                    ArchitectureQualityRow.slug.in_(slugs)
                )
            )
        )

    def list_all(self) -> list[ArchitectureQualityRow]:
        return list(self._session.scalars(select(ArchitectureQualityRow)))

    def add_all(self, qualities: list[ArchitectureQualityRow]) -> None:
        self._session.add_all(qualities)
