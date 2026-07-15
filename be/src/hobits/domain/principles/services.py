"""Principles service: CRUD for the codified rules + audit orchestration.

An audit enqueues one engine job per applicable enabled principle; each job's completion
handler (jobs.py) parses the structured verdict and settles the corresponding check row.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from hobits.core.exceptions import ConflictError, NotFoundError, ValidationError
from hobits.domain.jobs import kinds as job_kinds
from hobits.domain.jobs.services import JobService
from hobits.domain.principles.jobs import build_audit_prompt
from hobits.domain.principles.models import (
    PRINCIPLE_SEVERITIES,
    PrincipleCheckRow,
    PrincipleRow,
)
from hobits.domain.principles.repositories import (
    SqlPrincipleCheckRepository,
    SqlPrincipleRepository,
)
from hobits.domain.principles.schemas import (
    CreatePrinciple,
    PrincipleCheckResult,
    PrincipleResult,
    RepoPrincipleStatusResult,
    UpdatePrinciple,
)
from hobits.domain.repository.repositories import SqlRepositoryRepository


class PrincipleService:
    """Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._principles = SqlPrincipleRepository(session)
        self._checks = SqlPrincipleCheckRepository(session)
        self._repos = SqlRepositoryRepository(session)

    # --- CRUD -------------------------------------------------------------------
    def create(self, data: CreatePrinciple) -> PrincipleResult:
        self._validate(data)
        now = datetime.now(UTC)
        row = PrincipleRow(
            name=data.name.strip(),
            statement=data.statement.strip(),
            severity=data.severity,
            repository_id=data.repository_id,
            enabled=data.enabled,
            created_at=now,
            updated_at=now,
        )
        self._principles.add(row)
        return PrincipleResult.of(row)

    def update(self, principle_id: uuid.UUID, data: UpdatePrinciple) -> PrincipleResult:
        row = self._require(principle_id)
        self._validate(data)
        row.name = data.name.strip()
        row.statement = data.statement.strip()
        row.severity = data.severity
        row.repository_id = data.repository_id
        row.enabled = data.enabled
        row.updated_at = datetime.now(UTC)
        return self._to_result(row)

    def delete(self, principle_id: uuid.UUID) -> None:
        self._require(principle_id)
        self._principles.delete(principle_id)

    def list(self) -> list[PrincipleResult]:
        return [self._to_result(row) for row in self._principles.list()]

    def get(self, principle_id: uuid.UUID) -> PrincipleResult:
        return self._to_result(self._require(principle_id))

    # --- per-repo standing + audits ----------------------------------------------
    def repo_status(self, repository_id: uuid.UUID) -> list[RepoPrincipleStatusResult]:
        """Every principle applicable to this repo with its newest verdict (the repo tab)."""
        if self._repos.get(repository_id) is None:
            raise NotFoundError("Repository not found")
        latest = self._checks.latest_for_repository(repository_id)
        return [
            RepoPrincipleStatusResult(
                principle=PrincipleResult.of(row),
                latest_check=(
                    PrincipleCheckResult.of(latest[row.id]) if row.id in latest else None
                ),
            )
            for row in self._principles.list_for_repository(repository_id)
        ]

    def audit_repository(self, repository_id: uuid.UUID) -> list[RepoPrincipleStatusResult]:
        """Enqueue one audit job per applicable enabled principle (non-blocking; the repo tab
        polls). Skips principles that already have an unsettled check in flight."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        if not repo.clone_path or not Path(repo.clone_path).is_dir():
            raise ConflictError("Repository has not been cloned yet")

        applicable = self._principles.list_for_repository(repository_id, enabled_only=True)
        if not applicable:
            raise ConflictError("No enabled principles apply to this repository.")

        latest = self._checks.latest_for_repository(repository_id)
        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        branch = repo.current_branch or repo.default_branch
        now = datetime.now(UTC)

        for principle in applicable:
            current = latest.get(principle.id)
            if current is not None and current.status == "pending":
                continue  # an audit for this principle is already in flight
            check = PrincipleCheckRow(
                principle_id=principle.id,
                repository_id=repository_id,
                status="pending",
                commit_sha=repo.last_analyzed_commit,
                branch=branch,
                created_at=now,
            )
            self._checks.add(check)
            job = jobs.enqueue(
                kind=job_kinds.PRINCIPLE_AUDIT,
                title=f"Principle audit: {principle.name} — {repo.coordinates.slug}",
                prompt=build_audit_prompt(repo.coordinates.slug, principle),
                payload={
                    "cwd": repo.clone_path,
                    "model": model,
                    "timeout_seconds": timeout_seconds,
                    "repository_id": str(repository_id),
                    "principle_id": str(principle.id),
                    "check_id": str(check.id),
                    "branch": branch,
                },
                repository_id=repository_id,
            )
            check.job_id = job.id

        return self.repo_status(repository_id)

    # --- internals ----------------------------------------------------------------
    def _require(self, principle_id: uuid.UUID) -> PrincipleRow:
        row = self._principles.get(principle_id)
        if row is None:
            raise NotFoundError("Principle not found")
        return row

    def _validate(self, data: CreatePrinciple) -> None:
        if data.severity not in PRINCIPLE_SEVERITIES:
            raise ValidationError(f"Unknown severity: {data.severity}")
        if data.repository_id is not None and self._repos.get(data.repository_id) is None:
            raise NotFoundError("Repository not found")

    def _to_result(self, row: PrincipleRow) -> PrincipleResult:
        latest = self._checks.latest_per_repository(row.id)
        upheld = sum(1 for c in latest.values() if c.status == "upheld")
        violated = sum(1 for c in latest.values() if c.status == "violated")
        return PrincipleResult.of(row, upheld_count=upheld, violated_count=violated)
