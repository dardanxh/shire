"""Modelling strategy catalog service.

Plain CRUD over a seeded catalog. Updates flip `source` to "user" so a later
`shire-seed` run never clobbers manual edits.
"""

from __future__ import annotations

import uuid

from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.domain.modelling.models import ModellingStrategyRow
from shire.domain.modelling.repositories import SqlModellingStrategyRepository
from shire.domain.modelling.schemas import (
    TOPIC_BY_FAMILY,
    CreateModellingStrategy,
    ModellingStrategyResult,
    UpdateModellingStrategy,
)


class ModellingStrategyService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._strategies = SqlModellingStrategyRepository(session)

    def list_strategies(
        self,
        params: Params,
        topic: str | None = None,
        family: str | None = None,
        complexity: str | None = None,
        q: str | None = None,
    ) -> Page[ModellingStrategyResult]:
        transformer = lambda rows: [ModellingStrategyResult.model_validate(row) for row in rows]  # noqa: E731
        return self._strategies.search(
            params, transformer, topic=topic, family=family, complexity=complexity, q=q
        )

    def get_strategies(self, strategy_ids: list[uuid.UUID]) -> list[ModellingStrategyResult]:
        rows = self._get_rows(strategy_ids)
        return [ModellingStrategyResult.model_validate(row) for row in rows]

    def create_strategies(
        self, strategies: list[CreateModellingStrategy]
    ) -> list[ModellingStrategyResult]:
        slugs = [strategy.slug for strategy in strategies]
        if self._strategies.get_by_slugs(slugs):
            raise ConflictError(f"Modelling strategy slug already exists: {slugs}")
        for strategy in strategies:
            _check_topic_family(strategy.topic, strategy.family)
        rows = [
            ModellingStrategyRow(**strategy.model_dump(), source="user")
            for strategy in strategies
        ]
        self._strategies.add_all(rows)
        self._session.flush()
        return [ModellingStrategyResult.model_validate(row) for row in rows]

    def update_strategies(
        self, updates: list[tuple[uuid.UUID, UpdateModellingStrategy]]
    ) -> list[ModellingStrategyResult]:
        rows = self._get_rows([strategy_id for strategy_id, _ in updates])
        results: list[ModellingStrategyResult] = []
        for row, (_, update) in zip(rows, updates, strict=True):
            changes = update.model_dump(exclude_unset=True)
            slug_taken = (
                "slug" in changes
                and changes["slug"] != row.slug
                and self._strategies.get_by_slugs([changes["slug"]])
            )
            if slug_taken:
                raise ConflictError(
                    f"Modelling strategy slug already exists: {changes['slug']}"
                )
            if "topic" in changes or "family" in changes:
                _check_topic_family(
                    changes.get("topic", row.topic), changes.get("family", row.family)
                )
            for field, value in changes.items():
                setattr(row, field, value)
            row.source = "user"
            results.append(ModellingStrategyResult.model_validate(row))
        self._session.flush()
        return results

    def delete_strategies(self, strategy_ids: list[uuid.UUID]) -> None:
        rows = self._get_rows(strategy_ids)
        self._strategies.delete_all(rows)
        self._session.flush()

    def _get_rows(self, strategy_ids: list[uuid.UUID]) -> list[ModellingStrategyRow]:
        rows = {row.id: row for row in self._strategies.get(strategy_ids)}
        missing = [str(sid) for sid in strategy_ids if sid not in rows]
        if missing:
            raise NotFoundError(f"Modelling strategy not found: {', '.join(missing)}")
        return [rows[strategy_id] for strategy_id in strategy_ids]


def _check_topic_family(topic: str, family: str) -> None:
    if TOPIC_BY_FAMILY.get(family) != topic:
        raise ValidationError(f"Family '{family}' does not belong to topic '{topic}'")
