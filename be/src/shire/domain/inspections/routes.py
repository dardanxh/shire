"""FastAPI routes for repository inspections."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.inspections.schemas import (
    InspectionDetailResult,
    InspectionOverviewItem,
    RunInspectionsRequest,
    RunInspectionsResult,
)
from shire.domain.inspections.services import DEFAULT_ACTIVITY_DAYS, InspectionService

router = APIRouter(tags=["inspections"])


# Its own prefix rather than /repositories/inspections/overview: a literal segment there
# would be matched against `/repositories/{repository_id}` and 422 on the UUID parse.
@router.get("/inspections/overview", response_model=list[InspectionOverviewItem])
def inspections_overview(
    repos: Annotated[list[uuid.UUID] | None, Query()] = None,
    days: int = Query(DEFAULT_ACTIVITY_DAYS, ge=1, le=365),
    session: Session = Depends(get_session),
) -> list[InspectionOverviewItem]:
    """Completion counts + recent commit activity per repository (all repos when `repos` is
    omitted) — the repositories table's Activity and Checks columns in one read."""
    return InspectionService(session).overview(repos, days)


@router.get(
    "/repositories/{repository_id}/inspections", response_model=InspectionDetailResult
)
def repository_inspections(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> InspectionDetailResult:
    """Every inspection's state for one repository — the Suggested Actions checklist."""
    return InspectionService(session).detail(repository_id)


@router.post(
    "/repositories/{repository_id}/inspections/run",
    response_model=RunInspectionsResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_repository_inspections(
    repository_id: uuid.UUID,
    body: RunInspectionsRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> RunInspectionsResult:
    """Start inspections (non-blocking). Omit `keys` to run every bulk-eligible inspection
    that hasn't been done yet; hobits and principles are never included."""
    return InspectionService(session).run(repository_id, body.keys, background_tasks)
