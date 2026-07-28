"""FastAPI routes for the blueprint library."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.blueprint.schemas import (
    BlueprintResult,
    CloneBlueprint,
    CreateBlueprint,
    UpdateBlueprint,
)
from shire.domain.blueprint.services import BlueprintService

router = APIRouter(prefix="/blueprints", tags=["blueprints"])


@router.get("", response_model=list[BlueprintResult])
def list_blueprints(
    family_tag: str | None = None,
    technology_id: uuid.UUID | None = None,
    q: str | None = None,
    source: str | None = None,
    use_case: str | None = None,
    starred: bool | None = None,
    session: Session = Depends(get_session),
) -> list[BlueprintResult]:
    """The library (small, unpaginated). `technology_id` matches recommended + alternatives;
    `source` splits seed blueprints from user architectures."""
    return BlueprintService(session).list_blueprints(
        family_tag=family_tag,
        technology_id=technology_id,
        q=q,
        source=source,
        use_case=use_case,
        starred=starred,
    )


@router.post("", response_model=BlueprintResult, status_code=status.HTTP_201_CREATED)
def create_blueprint(
    body: CreateBlueprint, session: Session = Depends(get_session)
) -> BlueprintResult:
    return BlueprintService(session).create_blueprints([body])[0]


@router.post(
    "/{blueprint_id}/clone",
    response_model=BlueprintResult,
    status_code=status.HTTP_201_CREATED,
)
def clone_blueprint(
    blueprint_id: uuid.UUID,
    body: CloneBlueprint | None = None,
    session: Session = Depends(get_session),
) -> BlueprintResult:
    """Copy a blueprint into a new editable user architecture (fresh stage ids)."""
    return BlueprintService(session).clone_blueprint(
        blueprint_id, name=body.name if body else None
    )


@router.get("/{blueprint_id}", response_model=BlueprintResult)
def get_blueprint(
    blueprint_id: uuid.UUID, session: Session = Depends(get_session)
) -> BlueprintResult:
    return BlueprintService(session).get_blueprints([blueprint_id])[0]


@router.patch("/{blueprint_id}", response_model=BlueprintResult)
def update_blueprint(
    blueprint_id: uuid.UUID, body: UpdateBlueprint, session: Session = Depends(get_session)
) -> BlueprintResult:
    return BlueprintService(session).update_blueprints([(blueprint_id, body)])[0]


@router.delete("/{blueprint_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_blueprint(blueprint_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    BlueprintService(session).delete_blueprints([blueprint_id])
