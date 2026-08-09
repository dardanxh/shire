"""Pydantic I/O schemas for the jobs domain (observability read models + list envelope)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from shire.domain.jobs.kinds import AVAILABLE_MODELS
from shire.domain.jobs.models import EngineConfigRow, JobRow


class JobUsage(BaseModel):
    """Session-cumulative token accounting for one engine run (prompt in + result back,
    across every internal turn the agent took)."""

    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_creation_input_tokens: int | None = None
    cache_read_input_tokens: int | None = None
    total_cost_usd: float | None = None
    num_turns: int | None = None
    # The resolved model IDs the session actually used (vs. the requested alias).
    models: list[str] | None = None

    @property
    def total_tokens(self) -> int | None:
        parts = [
            self.input_tokens,
            self.output_tokens,
            self.cache_creation_input_tokens,
            self.cache_read_input_tokens,
        ]
        known = [p for p in parts if p is not None]
        return sum(known) if known else None


class JobResult(BaseModel):
    """List-item shape: status + identity + timings, no heavy prompt/result payloads."""

    id: uuid.UUID
    kind: str
    title: str
    status: str
    repository_id: uuid.UUID | None
    error: str | None
    attempts: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    duration_seconds: float | None
    # The Claude model the engine was asked to run (from payload["model"]); None when the
    # producer left it unset and the CLI default was used.
    model: str | None
    # Total tokens the session consumed (all prompt-side variants + output); None while
    # the job is unsettled or when the engine produced no accounting.
    total_tokens: int | None
    total_cost_usd: float | None

    @classmethod
    def of(cls, row: JobRow) -> JobResult:
        return cls(**cls._base_fields(row))

    @staticmethod
    def _base_fields(row: JobRow) -> dict:
        usage = JobUsage.model_validate(row.usage) if row.usage else None
        return {
            "id": row.id,
            "kind": row.kind,
            "title": row.title,
            "status": row.status,
            "repository_id": row.repository_id,
            "error": row.error,
            "attempts": row.attempts,
            "created_at": row.created_at,
            "started_at": row.started_at,
            "finished_at": row.finished_at,
            "duration_seconds": row.duration_seconds,
            "model": (row.payload or {}).get("model"),
            "total_tokens": usage.total_tokens if usage else None,
            "total_cost_usd": usage.total_cost_usd if usage else None,
        }


class UpdateEngineConfig(BaseModel):
    """The Config tab's save payload. Bounds keep a typo from wedging the queue."""

    timeout_seconds: float = Field(ge=30, le=3600)
    model: str
    max_attempts: int = Field(ge=1, le=5)
    concurrency: int = Field(ge=1, le=16)
    retention_days: int = Field(ge=0, le=365)
    # One Claude session per batch of checks instead of one per check (token efficiency).
    batch_checks: bool = True
    # Model for lightweight kinds (classification, news, distillation).
    light_model: str = "haiku"


class EngineConfigResult(BaseModel):
    """The engine's runtime settings + the model choices the CLI accepts."""

    timeout_seconds: float
    model: str
    max_attempts: int
    concurrency: int
    retention_days: int
    batch_checks: bool
    light_model: str
    available_models: list[str]
    updated_at: datetime

    @classmethod
    def of(cls, row: EngineConfigRow) -> EngineConfigResult:
        return cls(
            timeout_seconds=row.timeout_seconds,
            model=row.model,
            max_attempts=row.max_attempts,
            concurrency=row.concurrency,
            retention_days=row.retention_days,
            batch_checks=row.batch_checks,
            light_model=row.light_model,
            available_models=list(AVAILABLE_MODELS),
            updated_at=row.updated_at,
        )


class JobStatsBucket(BaseModel):
    jobs: int
    total_tokens: int
    total_cost_usd: float


class JobStatsResult(BaseModel):
    """Aggregate resource appetite for the Jobs page header."""

    today: JobStatsBucket
    last_7_days: JobStatsBucket
    all_time: JobStatsBucket


class JobProgressEvent(BaseModel):
    """One compact entry of the live agent transcript the engine streams while running."""

    type: str  # text | tool | tool_result
    text: str | None = None
    tool: str | None = None
    detail: str | None = None
    error: bool | None = None


class JobDetailResult(JobResult):
    """Detail shape: adds the exact prompt sent to the engine, the raw result, the live
    agent transcript, and the full token-usage breakdown."""

    prompt: str
    result: str | None
    worker_id: str | None
    usage: JobUsage | None
    progress: list[JobProgressEvent]

    @classmethod
    def of_detail(cls, row: JobRow) -> JobDetailResult:
        return cls(
            **cls._base_fields(row),
            prompt=row.prompt,
            result=row.result,
            worker_id=row.worker_id,
            usage=JobUsage.model_validate(row.usage) if row.usage else None,
            progress=[
                JobProgressEvent.model_validate(e)
                for e in (row.progress or [])
                if isinstance(e, dict)
            ],
        )
