"""FastAPI routes for the hobits domain — config, runs, and the run trigger."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.domain.hobits.schemas import (
    HobitConfigUpdate,
    HobitResult,
    HobitRunDetailResult,
    HobitRunResult,
    SetRepoHobitsRequest,
)
from hobits.domain.hobits.services import HobitService

router = APIRouter(tags=["hobits"])


@router.get("/hobits", response_model=list[HobitResult])
def list_hobits(session: Session = Depends(get_session)) -> list[HobitResult]:
    return HobitService(session).list_hobits()


@router.get("/hobits/{slug}", response_model=HobitResult)
def get_hobit(slug: str, session: Session = Depends(get_session)) -> HobitResult:
    return HobitService(session).get_hobit_result(slug)


@router.put("/hobits/{slug}", response_model=HobitResult)
def update_hobit(
    slug: str, body: HobitConfigUpdate, session: Session = Depends(get_session)
) -> HobitResult:
    """Save the hobit's config (model, charter, timeout, enabled) as overrides."""
    return HobitService(session).update_config(slug, body)


@router.get("/hobits/{slug}/runs", response_model=list[HobitRunResult])
def list_hobit_runs(slug: str, session: Session = Depends(get_session)) -> list[HobitRunResult]:
    """This hobit's runs across every repository, newest first."""
    return HobitService(session).list_hobit_runs(slug)


@router.get("/repositories/{repository_id}/hobits", response_model=list[HobitResult])
def list_repo_hobits(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[HobitResult]:
    """The hobits assigned to this repository (its access allow-list)."""
    return HobitService(session).list_repo_hobits(repository_id)


@router.put("/repositories/{repository_id}/hobits", response_model=list[HobitResult])
def set_repo_hobits(
    repository_id: uuid.UUID,
    body: SetRepoHobitsRequest,
    session: Session = Depends(get_session),
) -> list[HobitResult]:
    """Replace the hobits assigned to this repository."""
    return HobitService(session).set_repo_hobits(repository_id, body.slugs)


@router.post(
    "/repositories/{repository_id}/hobits/{slug}/run", response_model=HobitRunResult
)
def run_hobit(
    repository_id: uuid.UUID, slug: str, session: Session = Depends(get_session)
) -> HobitRunResult:
    """Run a hobit against a repository (blocking — the agent explores the clone)."""
    return HobitService(session).run_hobit(repository_id, slug)


@router.get(
    "/repositories/{repository_id}/hobits/runs", response_model=list[HobitRunResult]
)
def list_repo_runs(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[HobitRunResult]:
    return HobitService(session).list_runs(repository_id)


@router.get(
    "/repositories/{repository_id}/hobits/runs/{run_id}",
    response_model=HobitRunDetailResult,
)
def get_run(
    repository_id: uuid.UUID, run_id: uuid.UUID, session: Session = Depends(get_session)
) -> HobitRunDetailResult:
    return HobitService(session).get_run(run_id)
