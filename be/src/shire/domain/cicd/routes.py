"""FastAPI routes for the CI/CD analysis."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.cicd.schemas import (
    ApplyCicdSuggestions,
    CicdExecutionResult,
    CicdStatusResult,
)
from shire.domain.cicd.services import CicdService

router = APIRouter(tags=["cicd"])


@router.get("/repositories/{repository_id}/cicd", response_model=CicdStatusResult)
def cicd_status(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> CicdStatusResult:
    """Detected pipeline files plus the persisted CI/CD map, suggestions and implement runs."""
    return CicdService(session).status(repository_id)


@router.post(
    "/repositories/{repository_id}/cicd/scan",
    response_model=CicdStatusResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def scan_cicd(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> CicdStatusResult:
    """Enqueue the engine scan (non-blocking — poll the GET while `scan_pending` is true)."""
    return CicdService(session).enqueue_scan(repository_id)


@router.post(
    "/repositories/{repository_id}/cicd/apply",
    response_model=CicdExecutionResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def apply_cicd_suggestions(
    repository_id: uuid.UUID,
    body: ApplyCicdSuggestions,
    session: Session = Depends(get_session),
) -> CicdExecutionResult:
    """Implement the selected suggestions on a fresh local `cicd/*` branch."""
    return CicdService(session).apply(repository_id, body)
