"""FastAPI routes for the jobs domain. Read-only: jobs are enqueued by domain services, executed
by the engine service — this API is the observability surface the Jobs UI polls."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.core.pagination import Page, PaginationParams
from hobits.domain.jobs.schemas import JobDetailResult, JobResult
from hobits.domain.jobs.services import JobService

router = APIRouter(tags=["jobs"])


@router.get("/jobs", response_model=Page[JobResult])
def list_jobs(
    status: str | None = None,
    params: PaginationParams = Depends(),
    session: Session = Depends(get_session),
) -> Page[JobResult]:
    """All engine jobs, newest first (the Jobs page's poll target)."""
    return JobService(session).list(params, status)


@router.get("/jobs/{job_id}", response_model=JobDetailResult)
def get_job(job_id: uuid.UUID, session: Session = Depends(get_session)) -> JobDetailResult:
    """One job with its exact prompt and raw engine result."""
    return JobService(session).get(job_id)
