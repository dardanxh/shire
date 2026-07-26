"""FastAPI routes for AI readiness."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.jobs.schemas import JobResult
from shire.domain.readiness.schemas import (
    ApplySuggestions,
    ReadinessExecutionResult,
    ReadinessOverviewItem,
    ReadinessStatusResult,
)
from shire.domain.readiness.services import ReadinessService

router = APIRouter(tags=["readiness"])


@router.get("/ai-readiness/overview", response_model=list[ReadinessOverviewItem])
def readiness_overview(
    session: Session = Depends(get_session),
) -> list[ReadinessOverviewItem]:
    """Assistant-config readiness across every cloned repository."""
    return ReadinessService(session).overview()


@router.get(
    "/repositories/{repository_id}/ai-readiness", response_model=ReadinessStatusResult
)
def readiness_status(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> ReadinessStatusResult:
    """Instant artifact scan + persisted suggestions and make-ai-ready runs."""
    return ReadinessService(session).status(repository_id)


@router.post(
    "/repositories/{repository_id}/ai-readiness/suggest",
    response_model=JobResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def suggest_readiness(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> JobResult:
    """Enqueue the AI suggestion run (non-blocking — track the job)."""
    return ReadinessService(session).enqueue_suggest(repository_id)


@router.post(
    "/repositories/{repository_id}/ai-readiness/apply",
    response_model=ReadinessExecutionResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def apply_readiness(
    repository_id: uuid.UUID,
    body: ApplySuggestions,
    session: Session = Depends(get_session),
) -> ReadinessExecutionResult:
    """Implement the selected suggestions on a fresh local `ai-ready/*` branch."""
    return ReadinessService(session).apply(repository_id, body)
