"""Pydantic I/O schemas for the jobs domain (observability read models + list envelope)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from hobits.domain.jobs.models import JobRow


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

    @classmethod
    def of(cls, row: JobRow) -> JobResult:
        return cls(**cls._base_fields(row))

    @staticmethod
    def _base_fields(row: JobRow) -> dict:
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
        }


class JobDetailResult(JobResult):
    """Detail shape: adds the exact prompt sent to the engine and the raw result."""

    prompt: str
    result: str | None
    worker_id: str | None

    @classmethod
    def of_detail(cls, row: JobRow) -> JobDetailResult:
        return cls(
            **cls._base_fields(row),
            prompt=row.prompt,
            result=row.result,
            worker_id=row.worker_id,
        )
