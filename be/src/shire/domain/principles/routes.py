"""FastAPI routes for the principles domain. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.principles.schemas import (
    CreatePrinciple,
    PrincipleResult,
    RepoPrincipleStatusResult,
    UpdatePrinciple,
)
from shire.domain.principles.services import PrincipleService

router = APIRouter(tags=["principles"])


@router.get("/principles", response_model=list[PrincipleResult])
def list_principles(session: Session = Depends(get_session)) -> list[PrincipleResult]:
    """Every principle with its fleet standing (upheld/violated repo counts)."""
    return PrincipleService(session).list()


@router.post(
    "/principles", response_model=PrincipleResult, status_code=status.HTTP_201_CREATED
)
def create_principle(
    body: CreatePrinciple, session: Session = Depends(get_session)
) -> PrincipleResult:
    return PrincipleService(session).create(body)


@router.put("/principles/{principle_id}", response_model=PrincipleResult)
def update_principle(
    principle_id: uuid.UUID, body: UpdatePrinciple, session: Session = Depends(get_session)
) -> PrincipleResult:
    return PrincipleService(session).update(principle_id, body)


@router.delete("/principles/{principle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_principle(
    principle_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    PrincipleService(session).delete(principle_id)


@router.get(
    "/repositories/{repository_id}/principles",
    response_model=list[RepoPrincipleStatusResult],
)
def repository_principles(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[RepoPrincipleStatusResult]:
    """Each applicable principle with its newest verdict (the repo tab's poll target)."""
    return PrincipleService(session).repo_status(repository_id)


@router.post(
    "/repositories/{repository_id}/principles/audit",
    response_model=list[RepoPrincipleStatusResult],
    status_code=status.HTTP_202_ACCEPTED,
)
def audit_repository_principles(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[RepoPrincipleStatusResult]:
    """Audit the repository against every applicable enabled principle (one engine job per
    principle, non-blocking — poll the GET)."""
    return PrincipleService(session).audit_repository(repository_id)
