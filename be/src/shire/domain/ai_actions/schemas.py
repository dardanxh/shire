"""Pydantic schemas for the AI Actions domain."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from shire.domain.ai_actions.models import AiActionRow

# What the card shows. `idle` = never run; `running` comes from the live job, not the row.
ActionStatus = Literal["idle", "pending", "running", "succeeded", "failed"]


class _ActionFields(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=100_000)
    # None = the engine default (Jobs → Config).
    model: str | None = Field(default=None, max_length=64)
    schedule: str = Field(default="manual", max_length=200)
    timezone: str = Field(default="UTC", max_length=64)
    enabled: bool = True
    allow_shell: bool = False
    timeout_seconds: int = Field(default=900, ge=60, le=3_600)


class CreateAiAction(_ActionFields):
    pass


class UpdateAiAction(_ActionFields):
    """Full replacement — the form always sends every field."""


class RunAiAction(BaseModel):
    # Appended to the prompt for this run only: `/dx-github-open-prs` + `14` runs
    # `/dx-github-open-prs 14`.
    arguments: str = Field(default="", max_length=2_000)


class AiActionResult(BaseModel):
    id: uuid.UUID
    title: str
    prompt: str
    model: str | None
    schedule: str
    timezone: str
    enabled: bool
    allow_shell: bool
    timeout_seconds: int
    next_run_at: datetime | None

    status: ActionStatus
    last_job_id: uuid.UUID | None
    last_trigger: str | None
    last_arguments: str | None
    last_queued_at: datetime | None
    # When the engine actually picked the run up (from the live job; None while queued).
    last_started_at: datetime | None
    last_finished_at: datetime | None
    last_duration_seconds: float | None
    last_cost_usd: float | None
    last_error: str | None

    has_report: bool
    last_report_format: str | None
    last_report_at: datetime | None

    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(
        cls,
        row: AiActionRow,
        *,
        job_status: str | None = None,
        job_started_at: datetime | None = None,
    ) -> AiActionResult:
        status: ActionStatus
        if row.last_status is None:
            status = "idle"
        elif row.last_status == "pending" and job_status == "running":
            status = "running"
        else:
            status = row.last_status  # type: ignore[assignment]
        usage = row.last_usage or {}
        cost = usage.get("total_cost_usd")
        return cls(
            id=row.id,
            title=row.title,
            prompt=row.prompt,
            model=row.model,
            schedule=row.schedule,
            timezone=row.timezone,
            enabled=row.enabled,
            allow_shell=row.allow_shell,
            timeout_seconds=row.timeout_seconds,
            next_run_at=row.next_run_at if row.enabled else None,
            status=status,
            last_job_id=row.last_job_id,
            last_trigger=row.last_trigger,
            last_arguments=row.last_arguments,
            last_queued_at=row.last_queued_at,
            last_started_at=job_started_at,
            last_finished_at=row.last_finished_at,
            last_duration_seconds=row.last_duration_seconds,
            last_cost_usd=float(cost) if isinstance(cost, (int, float)) else None,
            last_error=row.last_error,
            # Reads the format column, not the deferred HTML, so listing never loads reports.
            has_report=row.last_report_format is not None,
            last_report_format=row.last_report_format,
            last_report_at=row.last_report_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


class AiActionRunnerResult(BaseModel):
    """Whether the host runner — the only worker that can run actions — is connected."""

    connected: bool
    # Runs queued with nobody to pick them up (non-zero while the runner is offline).
    queued: int
