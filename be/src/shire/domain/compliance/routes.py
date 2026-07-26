"""FastAPI routes for compliance checks."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.compliance.schemas import ComplianceCheckResult, CreateComplianceRun
from shire.domain.compliance.services import ComplianceService

router = APIRouter(prefix="/compliance-checks", tags=["compliance"])


@router.get("", response_model=Page[ComplianceCheckResult])
def list_checks(
    params: Params = Depends(), session: Session = Depends(get_session)
) -> Page[ComplianceCheckResult]:
    """Every run, newest first — the Results tab is a history."""
    return ComplianceService(session).list_checks(params)


@router.post(
    "/run",
    response_model=list[ComplianceCheckResult],
    status_code=status.HTTP_202_ACCEPTED,
)
def run_checks(
    body: CreateComplianceRun, session: Session = Depends(get_session)
) -> list[ComplianceCheckResult]:
    """Fan out one engine job per (repository, regulation) pair (non-blocking)."""
    return ComplianceService(session).create_runs(body)


@router.delete("/{check_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_check(check_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    ComplianceService(session).delete_check(check_id)
