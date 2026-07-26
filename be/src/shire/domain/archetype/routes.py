"""FastAPI routes for the archetype catalog."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.archetype.schemas import (
    ArchetypeResult,
    CreateArchetype,
    Family,
    Kind,
    UpdateArchetype,
)
from shire.domain.archetype.services import ArchetypeService

router = APIRouter(prefix="/archetypes", tags=["archetypes"])


@router.get("", response_model=Page[ArchetypeResult])
def list_archetypes(
    params: Params = Depends(),
    family: Family | None = None,
    kind: Kind | None = None,
    is_initiative: bool | None = None,
    q: str | None = None,
    include_archived: bool = False,
    session: Session = Depends(get_session),
) -> Page[ArchetypeResult]:
    """Paginated catalog. Archived archetypes are hidden unless `include_archived`."""
    return ArchetypeService(session).list_archetypes(
        params,
        family=family,
        kind=kind,
        is_initiative=is_initiative,
        q=q,
        include_archived=include_archived,
    )


@router.post("", response_model=ArchetypeResult, status_code=status.HTTP_201_CREATED)
def create_archetype(
    body: CreateArchetype, session: Session = Depends(get_session)
) -> ArchetypeResult:
    return ArchetypeService(session).create_archetypes([body])[0]


@router.get("/{archetype_id}", response_model=ArchetypeResult)
def get_archetype(
    archetype_id: uuid.UUID, session: Session = Depends(get_session)
) -> ArchetypeResult:
    return ArchetypeService(session).get_archetypes([archetype_id])[0]


@router.patch("/{archetype_id}", response_model=ArchetypeResult)
def update_archetype(
    archetype_id: uuid.UUID, body: UpdateArchetype, session: Session = Depends(get_session)
) -> ArchetypeResult:
    return ArchetypeService(session).update_archetypes([(archetype_id, body)])[0]


@router.delete("/{archetype_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_archetype(archetype_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    """Deletes the archetype."""
    ArchetypeService(session).delete_archetypes([archetype_id])
