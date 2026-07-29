"""FastAPI routes for the Home dashboard. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.core.pagination import Page, PaginationParams
from shire.domain.home.schemas import ActivityEventResult, HomeStatusResult
from shire.domain.home.services import HomeService

router = APIRouter(prefix="/home", tags=["home"])


@router.get("/status", response_model=HomeStatusResult)
def home_status(session: Session = Depends(get_session)) -> HomeStatusResult:
    """Everything the landing page needs in one read: Claude CLI availability + version,
    the engine's liveness, and the raw facts the onboarding checklist derives from."""
    return HomeService(session).status()


@router.get("/activity", response_model=Page[ActivityEventResult])
def home_activity(
    params: PaginationParams = Depends(),
    session: Session = Depends(get_session),
) -> Page[ActivityEventResult]:
    """Recent work across the workspace, newest first — derived from jobs, repository
    onboardings, analysis refreshes, council convenes, and merge reviews."""
    return HomeService(session).activity(params)
