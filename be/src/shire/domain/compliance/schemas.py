"""Pydantic input/result schemas for compliance checks."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CreateComplianceRun(BaseModel):
    """One run request fans out to a check per (repository, regulation) pair."""

    repository_ids: list[uuid.UUID] = Field(min_length=1)
    regulation_ids: list[uuid.UUID] = Field(min_length=1)


class ComplianceFinding(BaseModel):
    title: str
    status: str  # ok | gap | unclear
    note: str = ""
    article_ref: str | None = None


class ComplianceCheckResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    repository_id: uuid.UUID
    repository_slug: str
    regulation_slug: str
    regulation_name: str
    status: str
    verdict: str | None
    summary: str
    findings: list[ComplianceFinding]
    error: str | None
    job_id: uuid.UUID | None
    created_at: datetime
    finished_at: datetime | None
