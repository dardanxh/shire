"""Data access for blueprints."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from shire.domain.blueprint.models import (
    ArchitectureBlueprintRow,
    BlueprintStageRow,
)


class SqlBlueprintRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def search(
        self,
        family_tag: str | None = None,
        technology_id: uuid.UUID | None = None,
        q: str | None = None,
        source: str | None = None,
        use_case: str | None = None,
    ) -> list[ArchitectureBlueprintRow]:
        query = (
            select(ArchitectureBlueprintRow)
            .options(selectinload(ArchitectureBlueprintRow.stages))
            .order_by(ArchitectureBlueprintRow.position, ArchitectureBlueprintRow.name)
        )
        if source:
            query = query.where(ArchitectureBlueprintRow.source == source)
        if use_case:
            query = query.where(ArchitectureBlueprintRow.use_cases.contains([use_case]))
        if family_tag:
            query = query.where(ArchitectureBlueprintRow.family_tags.contains([family_tag]))
        if technology_id is not None:
            stage_match = (
                select(BlueprintStageRow.id)
                .where(
                    BlueprintStageRow.blueprint_id == ArchitectureBlueprintRow.id,
                    (BlueprintStageRow.recommended_technology_id == technology_id)
                    | BlueprintStageRow.alternative_technology_ids.contains(
                        [str(technology_id)]
                    ),
                )
                .exists()
            )
            query = query.where(stage_match)
        if q:
            pattern = f"%{q}%"
            query = query.where(
                ArchitectureBlueprintRow.name.ilike(pattern)
                | ArchitectureBlueprintRow.slug.ilike(pattern)
                | ArchitectureBlueprintRow.use_case.ilike(pattern)
                | ArchitectureBlueprintRow.description.ilike(pattern)
            )
        return list(self._session.scalars(query).unique())

    def get(self, blueprint_ids: list[uuid.UUID]) -> list[ArchitectureBlueprintRow]:
        if not blueprint_ids:
            return []
        return list(
            self._session.scalars(
                select(ArchitectureBlueprintRow)
                .options(selectinload(ArchitectureBlueprintRow.stages))
                .where(ArchitectureBlueprintRow.id.in_(blueprint_ids))
            ).unique()
        )

    def get_by_slugs(self, slugs: list[str]) -> list[ArchitectureBlueprintRow]:
        if not slugs:
            return []
        return list(
            self._session.scalars(
                select(ArchitectureBlueprintRow)
                .options(selectinload(ArchitectureBlueprintRow.stages))
                .where(ArchitectureBlueprintRow.slug.in_(slugs))
            ).unique()
        )

    def add_all(self, blueprints: list[ArchitectureBlueprintRow]) -> None:
        self._session.add_all(blueprints)

    def delete_all(self, blueprints: list[ArchitectureBlueprintRow]) -> None:
        for blueprint in blueprints:
            self._session.delete(blueprint)
