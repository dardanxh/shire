"""Compliance service: fan a run request out to one engine job per (repository, regulation)."""

from __future__ import annotations

import uuid

from fastapi_pagination import Page, Params
from fastapi_pagination.ext.sqlalchemy import paginate
from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.core.exceptions import NotFoundError
from shire.domain.compliance.jobs import build_check_prompt
from shire.domain.compliance.models import ComplianceCheckRow
from shire.domain.compliance.schemas import ComplianceCheckResult, CreateComplianceRun
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.services import JobService
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.domain.security.models import DataRegulationRow


class ComplianceService:
    def __init__(self, session: Session) -> None:
        self._session = session
        # Cross-domain read (clone path + slug) — checks are tightly coupled to a clone.
        self._repos = SqlRepositoryRepository(session)

    def create_runs(self, body: CreateComplianceRun) -> list[ComplianceCheckResult]:
        regulations = {
            row.id: row
            for row in self._session.scalars(
                select(DataRegulationRow).where(DataRegulationRow.id.in_(body.regulation_ids))
            )
        }
        missing = [str(rid) for rid in body.regulation_ids if rid not in regulations]
        if missing:
            raise NotFoundError(f"Regulation not found: {', '.join(missing)}")

        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        rows: list[ComplianceCheckRow] = []
        for repository_id in body.repository_ids:
            repo = self._repos.get(repository_id)
            if repo is None or not repo.clone_path:
                raise NotFoundError(f"Repository not cloned: {repository_id}")
            for regulation_id in body.regulation_ids:
                regulation = regulations[regulation_id]
                row = ComplianceCheckRow(
                    repository_id=repository_id,
                    repository_slug=repo.coordinates.slug,
                    regulation_slug=regulation.slug,
                    regulation_name=regulation.name,
                    status="queued",
                )
                self._session.add(row)
                self._session.flush()
                job = jobs.enqueue(
                    kind=job_kinds.COMPLIANCE_CHECK,
                    title=f"Compliance: {regulation.name} — {repo.coordinates.slug}",
                    prompt=build_check_prompt(regulation, repo.coordinates.slug),
                    payload={
                        "cwd": repo.clone_path,
                        "model": model,
                        "timeout_seconds": timeout_seconds,
                        "repository_id": str(repository_id),
                        "check_id": str(row.id),
                    },
                    repository_id=repository_id,
                )
                row.job_id = job.id
                rows.append(row)
        self._session.flush()
        return [ComplianceCheckResult.model_validate(row) for row in rows]

    def list_checks(self, params: Params) -> Page[ComplianceCheckResult]:
        query = select(ComplianceCheckRow).order_by(ComplianceCheckRow.created_at.desc())
        return paginate(
            self._session,
            query,
            params,
            transformer=lambda rows: [
                ComplianceCheckResult.model_validate(row) for row in rows
            ],
        )

    def delete_check(self, check_id: uuid.UUID) -> None:
        row = self._session.get(ComplianceCheckRow, check_id)
        if row is None:
            raise NotFoundError(f"Compliance check not found: {check_id}")
        self._session.delete(row)
        self._session.flush()
