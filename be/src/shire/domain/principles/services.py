"""Principles service: CRUD for the codified rules + audit orchestration.

An audit enqueues one engine job per applicable enabled principle; each job's completion
handler (jobs.py) parses the structured verdict and settles the corresponding check row.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.services import JobService
from shire.domain.principles.jobs import build_audit_prompt
from shire.domain.principles.models import (
    PRINCIPLE_SEVERITIES,
    PRINCIPLE_TECHS,
    PrincipleCheckRow,
    PrincipleRow,
)
from shire.domain.principles.repositories import (
    SqlPrincipleCheckRepository,
    SqlPrincipleRepository,
)
from shire.domain.principles.schemas import (
    CreatePrinciple,
    PrincipleCheckResult,
    PrincipleResult,
    RepoPrincipleStatusResult,
    UpdatePrinciple,
)
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.integrations.scanners._common import walk_files


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
            tech=data.tech,
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
        row.tech = data.tech
        row.repository_id = data.repository_id
        row.enabled = data.enabled
        # Any edit — including just disabling — makes it the user's: the seeder must
        # never clobber a principle the user has customized or opted out of.
        row.source = "user"
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
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        techs = self._repo_techs(repo.clone_path)
        latest = self._checks.latest_for_repository(repository_id)
        return [
            RepoPrincipleStatusResult(
                principle=PrincipleResult.of(row),
                latest_check=(
                    PrincipleCheckResult.of(latest[row.id]) if row.id in latest else None
                ),
            )
            for row in self._principles.list_for_repository(repository_id)
            if row.tech in techs
        ]

    def audit_repository(self, repository_id: uuid.UUID) -> list[RepoPrincipleStatusResult]:
        """Enqueue one audit job per applicable enabled principle (non-blocking; the repo tab
        polls). Skips principles that already have an unsettled check in flight."""
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        if not repo.clone_path or not Path(repo.clone_path).is_dir():
            raise ConflictError("Repository has not been cloned yet")

        techs = self._repo_techs(repo.clone_path)
        applicable = [
            row
            for row in self._principles.list_for_repository(repository_id, enabled_only=True)
            if row.tech in techs
        ]
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

    @staticmethod
    def _repo_techs(clone_path: str | None) -> set[str]:
        """Which principle techs this repo warrants: general always; python/sql only when
        the clone shows matching code — a dbt rule has no business auditing a FastAPI repo."""
        techs = {"general"}
        if not clone_path:
            return techs
        root = Path(clone_path)
        if not root.is_dir():
            return techs
        if (
            (root / "pyproject.toml").is_file()
            or (root / "setup.py").is_file()
            or (root / "dbt_project.yml").is_file()
        ):
            if (root / "dbt_project.yml").is_file():
                techs.add("sql")
            if (root / "pyproject.toml").is_file() or (root / "setup.py").is_file():
                techs.add("python")
        for path in walk_files(root):
            if "python" in techs and "sql" in techs:
                break
            suffix = path.suffix.lower()
            if suffix == ".py":
                techs.add("python")
            elif suffix == ".sql":
                techs.add("sql")
        return techs

    def _require(self, principle_id: uuid.UUID) -> PrincipleRow:
        row = self._principles.get(principle_id)
        if row is None:
            raise NotFoundError("Principle not found")
        return row

    def _validate(self, data: CreatePrinciple) -> None:
        if data.severity not in PRINCIPLE_SEVERITIES:
            raise ValidationError(f"Unknown severity: {data.severity}")
        if data.tech not in PRINCIPLE_TECHS:
            raise ValidationError(f"Unknown tech: {data.tech}")
        if data.repository_id is not None and self._repos.get(data.repository_id) is None:
            raise NotFoundError("Repository not found")

    def _to_result(self, row: PrincipleRow) -> PrincipleResult:
        latest = self._checks.latest_per_repository(row.id)
        upheld = sum(1 for c in latest.values() if c.status == "upheld")
        violated = sum(1 for c in latest.values() if c.status == "violated")
        return PrincipleResult.of(row, upheld_count=upheld, violated_count=violated)
