"""Archetype catalog service."""

from __future__ import annotations

import uuid

from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError
from shire.domain.archetype.models import ProjectArchetypeRow
from shire.domain.archetype.repositories import SqlArchetypeRepository
from shire.domain.archetype.schemas import (
    ArchetypeResult,
    CreateArchetype,
    UpdateArchetype,
)


class ArchetypeService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._archetypes = SqlArchetypeRepository(session)

    def list_archetypes(
        self,
        params: Params,
        family: str | None = None,
        kind: str | None = None,
        is_initiative: bool | None = None,
        q: str | None = None,
        include_archived: bool = False,
    ) -> Page[ArchetypeResult]:
        transformer = lambda rows: [ArchetypeResult.model_validate(row) for row in rows]  # noqa: E731
        return self._archetypes.search(
            params,
            transformer,
            family=family,
            kind=kind,
            is_initiative=is_initiative,
            q=q,
            include_archived=include_archived,
        )

    def get_archetypes(self, archetype_ids: list[uuid.UUID]) -> list[ArchetypeResult]:
        rows = self._get_rows(archetype_ids)
        return [ArchetypeResult.model_validate(row) for row in rows]

    def create_archetypes(self, archetypes: list[CreateArchetype]) -> list[ArchetypeResult]:
        slugs = [archetype.slug for archetype in archetypes]
        if self._archetypes.get_by_slugs(slugs):
            raise ConflictError(f"Archetype slug already exists: {slugs}")
        rows = [
            ProjectArchetypeRow(**archetype.model_dump(), source="user")
            for archetype in archetypes
        ]
        self._archetypes.add_all(rows)
        self._session.flush()
        return [ArchetypeResult.model_validate(row) for row in rows]

    def update_archetypes(
        self, updates: list[tuple[uuid.UUID, UpdateArchetype]]
    ) -> list[ArchetypeResult]:
        rows = self._get_rows([archetype_id for archetype_id, _ in updates])
        results: list[ArchetypeResult] = []
        for row, (_, update) in zip(rows, updates, strict=True):
            changes = update.model_dump(exclude_unset=True)
            slug_taken = (
                "slug" in changes
                and changes["slug"] != row.slug
                and self._archetypes.get_by_slugs([changes["slug"]])
            )
            if slug_taken:
                raise ConflictError(f"Archetype slug already exists: {changes['slug']}")
            for field, value in changes.items():
                setattr(row, field, value)
            row.source = "user"
            results.append(ArchetypeResult.model_validate(row))
        self._session.flush()
        return results

    def delete_archetypes(self, archetype_ids: list[uuid.UUID]) -> None:
        rows = self._get_rows(archetype_ids)
        self._archetypes.delete_all(rows)
        self._session.flush()

    def _get_rows(self, archetype_ids: list[uuid.UUID]) -> list[ProjectArchetypeRow]:
        rows = {row.id: row for row in self._archetypes.get(archetype_ids)}
        missing = [str(aid) for aid in archetype_ids if aid not in rows]
        if missing:
            raise NotFoundError(f"Archetype not found: {', '.join(missing)}")
        return [rows[archetype_id] for archetype_id in archetype_ids]
