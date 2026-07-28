"""Data access for data regulations and data safety practices."""

from __future__ import annotations

import uuid

from fastapi_pagination import Params
from fastapi_pagination.bases import AbstractPage
from fastapi_pagination.ext.sqlalchemy import paginate
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from shire.domain.security.models import DataRegulationRow, DataSafetyPracticeRow


class SqlDataRegulationRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def search(
        self,
        params: Params,
        transformer,
        category: str | None = None,
        region: str | None = None,
        q: str | None = None,
        starred: bool | None = None,
    ) -> AbstractPage:
        query: Select = select(DataRegulationRow).order_by(
            DataRegulationRow.position, DataRegulationRow.name
        )
        if category:
            query = query.where(DataRegulationRow.category == category)
        if starred is not None:
            query = query.where(DataRegulationRow.starred.is_(starred))
        if region:
            query = query.where(DataRegulationRow.region == region)
        if q:
            pattern = f"%{q}%"
            query = query.where(
                DataRegulationRow.name.ilike(pattern)
                | DataRegulationRow.full_name.ilike(pattern)
                | DataRegulationRow.description.ilike(pattern)
            )
        return paginate(self._session, query, params, transformer=transformer)

    def get(self, regulation_ids: list[uuid.UUID]) -> list[DataRegulationRow]:
        if not regulation_ids:
            return []
        return list(
            self._session.scalars(
                select(DataRegulationRow).where(DataRegulationRow.id.in_(regulation_ids))
            )
        )

    def get_by_slugs(self, slugs: list[str]) -> list[DataRegulationRow]:
        if not slugs:
            return []
        return list(
            self._session.scalars(
                select(DataRegulationRow).where(DataRegulationRow.slug.in_(slugs))
            )
        )

    def list_all(self) -> list[DataRegulationRow]:
        return list(self._session.scalars(select(DataRegulationRow)))

    def add_all(self, regulations: list[DataRegulationRow]) -> None:
        self._session.add_all(regulations)


class SqlDataSafetyPracticeRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def search(
        self,
        params: Params,
        transformer,
        category: str | None = None,
        complexity: str | None = None,
        q: str | None = None,
        starred: bool | None = None,
    ) -> AbstractPage:
        query: Select = select(DataSafetyPracticeRow).order_by(
            DataSafetyPracticeRow.category,
            DataSafetyPracticeRow.position,
            DataSafetyPracticeRow.name,
        )
        if category:
            query = query.where(DataSafetyPracticeRow.category == category)
        if starred is not None:
            query = query.where(DataSafetyPracticeRow.starred.is_(starred))
        if complexity:
            query = query.where(DataSafetyPracticeRow.complexity == complexity)
        if q:
            pattern = f"%{q}%"
            query = query.where(
                DataSafetyPracticeRow.name.ilike(pattern)
                | DataSafetyPracticeRow.objective.ilike(pattern)
                | DataSafetyPracticeRow.description.ilike(pattern)
            )
        return paginate(self._session, query, params, transformer=transformer)

    def get(self, practice_ids: list[uuid.UUID]) -> list[DataSafetyPracticeRow]:
        if not practice_ids:
            return []
        return list(
            self._session.scalars(
                select(DataSafetyPracticeRow).where(
                    DataSafetyPracticeRow.id.in_(practice_ids)
                )
            )
        )

    def get_by_slugs(self, slugs: list[str]) -> list[DataSafetyPracticeRow]:
        if not slugs:
            return []
        return list(
            self._session.scalars(
                select(DataSafetyPracticeRow).where(DataSafetyPracticeRow.slug.in_(slugs))
            )
        )

    def list_all(self) -> list[DataSafetyPracticeRow]:
        return list(self._session.scalars(select(DataSafetyPracticeRow)))

    def add_all(self, practices: list[DataSafetyPracticeRow]) -> None:
        self._session.add_all(practices)
