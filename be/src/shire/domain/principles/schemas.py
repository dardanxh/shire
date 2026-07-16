"""Pydantic I/O schemas for the principles domain (Create / Update / Result)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from shire.domain.principles.models import PrincipleCheckRow, PrincipleRow


class CreatePrinciple(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    statement: str = Field(min_length=1)
    severity: str = "warning"
    # None = applies to every repository.
    repository_id: uuid.UUID | None = None
    enabled: bool = True


class UpdatePrinciple(CreatePrinciple):
    """Full edit — same shape as create."""


class PrincipleCheckResult(BaseModel):
    """One audit verdict (the newest one doubles as current compliance)."""

    id: uuid.UUID
    principle_id: uuid.UUID
    repository_id: uuid.UUID
    job_id: uuid.UUID | None
    status: str
    summary: str | None
    violations: list[dict[str, Any]]
    error: str | None
    commit_sha: str | None
    branch: str | None
    duration_seconds: float | None
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(cls, row: PrincipleCheckRow) -> PrincipleCheckResult:
        return cls(
            id=row.id,
            principle_id=row.principle_id,
            repository_id=row.repository_id,
            job_id=row.job_id,
            status=row.status,
            summary=row.summary,
            violations=list(row.violations or []),
            error=row.error,
            commit_sha=row.commit_sha,
            branch=row.branch,
            duration_seconds=row.duration_seconds,
            created_at=row.created_at,
            finished_at=row.finished_at,
        )


class PrincipleResult(BaseModel):
    id: uuid.UUID
    name: str
    statement: str
    severity: str
    repository_id: uuid.UUID | None
    enabled: bool
    created_at: datetime
    updated_at: datetime
    # Fleet standing from the newest check per repository (upheld/violated counts).
    upheld_count: int = 0
    violated_count: int = 0

    @classmethod
    def of(
        cls, row: PrincipleRow, *, upheld_count: int = 0, violated_count: int = 0
    ) -> PrincipleResult:
        return cls(
            id=row.id,
            name=row.name,
            statement=row.statement,
            severity=row.severity,
            repository_id=row.repository_id,
            enabled=row.enabled,
            created_at=row.created_at,
            updated_at=row.updated_at,
            upheld_count=upheld_count,
            violated_count=violated_count,
        )


class RepoPrincipleStatusResult(BaseModel):
    """One principle's standing against one repository — the repo tab's row shape."""

    principle: PrincipleResult
    latest_check: PrincipleCheckResult | None
