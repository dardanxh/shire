"""Data access for modelling strategies."""

from __future__ import annotations

import uuid

from fastapi_pagination import Params
from fastapi_pagination.bases import AbstractPage
from fastapi_pagination.ext.sqlalchemy import paginate
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from shire.domain.modelling.models import ModellingStrategyRow


class SqlModellingStrategyRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def search(
        self,
        params: Params,
        transformer,
        topic: str | None = None,
        family: str | None = None,
        complexity: str | None = None,
        q: str | None = None,
        starred: bool | None = None,
    ) -> AbstractPage:
        query: Select = select(ModellingStrategyRow).order_by(
            ModellingStrategyRow.family,
            ModellingStrategyRow.position,
            ModellingStrategyRow.name,
        )
        if topic:
            query = query.where(ModellingStrategyRow.topic == topic)
        if starred is not None:
            query = query.where(ModellingStrategyRow.starred.is_(starred))
        if family:
            query = query.where(ModellingStrategyRow.family == family)
        if complexity:
            query = query.where(ModellingStrategyRow.complexity == complexity)
        if q:
            pattern = f"%{q}%"
            query = query.where(
                ModellingStrategyRow.name.ilike(pattern)
                | ModellingStrategyRow.slug.ilike(pattern)
                | ModellingStrategyRow.best_for.ilike(pattern)
            )
        return paginate(self._session, query, params, transformer=transformer)

    def get(self, strategy_ids: list[uuid.UUID]) -> list[ModellingStrategyRow]:
        if not strategy_ids:
            return []
        return list(
            self._session.scalars(
                select(ModellingStrategyRow).where(ModellingStrategyRow.id.in_(strategy_ids))
            )
        )

    def get_by_slugs(self, slugs: list[str]) -> list[ModellingStrategyRow]:
        if not slugs:
            return []
        return list(
            self._session.scalars(
                select(ModellingStrategyRow).where(ModellingStrategyRow.slug.in_(slugs))
            )
        )

    def list_all(self) -> list[ModellingStrategyRow]:
        return list(self._session.scalars(select(ModellingStrategyRow)))

    def add_all(self, strategies: list[ModellingStrategyRow]) -> None:
        self._session.add_all(strategies)

    def delete_all(self, strategies: list[ModellingStrategyRow]) -> None:
        for strategy in strategies:
            self._session.delete(strategy)
