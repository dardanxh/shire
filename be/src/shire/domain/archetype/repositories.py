"""Data access for project archetypes."""

from __future__ import annotations

import uuid

from fastapi_pagination import Params
from fastapi_pagination.bases import AbstractPage
from fastapi_pagination.ext.sqlalchemy import paginate
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from shire.domain.archetype.models import ProjectArchetypeRow


class SqlArchetypeRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def search(
        self,
        params: Params,
        transformer,
        family: str | None = None,
        kind: str | None = None,
        is_initiative: bool | None = None,
        q: str | None = None,
        include_archived: bool = False,
    ) -> AbstractPage:
        query: Select = select(ProjectArchetypeRow).order_by(
            ProjectArchetypeRow.family, ProjectArchetypeRow.position, ProjectArchetypeRow.name
        )
        if not include_archived:
            query = query.where(ProjectArchetypeRow.archived.is_(False))
        if family:
            query = query.where(ProjectArchetypeRow.family == family)
        if kind == "greenfield":
            query = query.where(ProjectArchetypeRow.supports_greenfield.is_(True))
        elif kind == "brownfield":
            query = query.where(ProjectArchetypeRow.supports_brownfield.is_(True))
        if is_initiative is not None:
            query = query.where(ProjectArchetypeRow.is_initiative.is_(is_initiative))
        if q:
            pattern = f"%{q}%"
            query = query.where(
                ProjectArchetypeRow.name.ilike(pattern)
                | ProjectArchetypeRow.slug.ilike(pattern)
                | ProjectArchetypeRow.summary.ilike(pattern)
            )
        return paginate(self._session, query, params, transformer=transformer)

    def get(self, archetype_ids: list[uuid.UUID]) -> list[ProjectArchetypeRow]:
        if not archetype_ids:
            return []
        return list(
            self._session.scalars(
                select(ProjectArchetypeRow).where(ProjectArchetypeRow.id.in_(archetype_ids))
            )
        )

    def get_by_slugs(self, slugs: list[str]) -> list[ProjectArchetypeRow]:
        if not slugs:
            return []
        return list(
            self._session.scalars(
                select(ProjectArchetypeRow).where(ProjectArchetypeRow.slug.in_(slugs))
            )
        )

    def list_all(self) -> list[ProjectArchetypeRow]:
        return list(self._session.scalars(select(ProjectArchetypeRow)))

    def add_all(self, archetypes: list[ProjectArchetypeRow]) -> None:
        self._session.add_all(archetypes)

    def delete_all(self, archetypes: list[ProjectArchetypeRow]) -> None:
        for archetype in archetypes:
            self._session.delete(archetype)
