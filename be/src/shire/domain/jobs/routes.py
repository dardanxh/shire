"""FastAPI routes for the jobs domain: the observability surface the Jobs UI polls, the
engine's runtime config, and the cancel/retry lifecycle actions.

NOTE: /jobs/config and /jobs/stats must be registered BEFORE /jobs/{job_id} — FastAPI
matches in order, and "config" is not a UUID.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.core.pagination import Page, PaginationParams
from shire.domain.jobs.schemas import (
    EngineConfigResult,
    JobDetailResult,
    JobResult,
    JobStatsResult,
    UpdateEngineConfig,
)
from shire.domain.jobs.services import JobService

router = APIRouter(tags=["jobs"])


@router.get("/jobs", response_model=Page[JobResult])
def list_jobs(
    status: str | None = None,
    repository_id: uuid.UUID | None = None,
    kind: str | None = None,
    params: PaginationParams = Depends(),
    session: Session = Depends(get_session),
) -> Page[JobResult]:
    """All engine jobs, newest first (the Jobs page's poll target); optionally scoped to one
    repository and/or job kind (the repo view's Jobs tab)."""
    return JobService(session).list(params, status, repository_id, kind)


@router.get("/jobs/config", response_model=EngineConfigResult)
def get_engine_config(session: Session = Depends(get_session)) -> EngineConfigResult:
    """The engine's runtime settings + the model choices the CLI accepts."""
    return JobService(session).get_config()


@router.put("/jobs/config", response_model=EngineConfigResult)
def update_engine_config(
    body: UpdateEngineConfig, session: Session = Depends(get_session)
) -> EngineConfigResult:
    """Save runtime settings. Model/timeout apply to newly enqueued jobs; attempts and
    concurrency are picked up by every engine worker within a few seconds."""
    return JobService(session).update_config(body)


@router.get("/jobs/stats", response_model=JobStatsResult)
def job_stats(session: Session = Depends(get_session)) -> JobStatsResult:
    """Aggregate token/cost totals (today / last 7 days / all time)."""
    return JobService(session).stats()


@router.get("/jobs/{job_id}", response_model=JobDetailResult)
def get_job(job_id: uuid.UUID, session: Session = Depends(get_session)) -> JobDetailResult:
    """One job with its exact prompt and raw engine result."""
    return JobService(session).get(job_id)


@router.post("/jobs/{job_id}/cancel", response_model=JobDetailResult)
def cancel_job(job_id: uuid.UUID, session: Session = Depends(get_session)) -> JobDetailResult:
    """Cancel a job still waiting in the queue (409 once a worker has claimed it)."""
    return JobService(session).cancel(job_id)


@router.post("/jobs/{job_id}/retry", response_model=JobResult, status_code=202)
def retry_job(job_id: uuid.UUID, session: Session = Depends(get_session)) -> JobResult:
    """Re-run a failed or cancelled job as a fresh job (MR stages: use Reanalyze instead)."""
    return JobService(session).retry(job_id)
