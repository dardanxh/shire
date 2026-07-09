"""Pydantic I/O schemas for the hobits domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from hobits.domain.hobits.domain import HobitRunRecord


class SelfScoreResult(BaseModel):
    importance: int
    confidence: int
    urgency: int


class HobitRunResult(BaseModel):
    """A run in list/summary form (no narrative/raw_output)."""

    id: uuid.UUID
    repository_id: uuid.UUID
    hobit_slug: str
    status: str
    trigger: str = "manual"
    commit_sha: str | None
    headline: str | None
    tier: str | None
    self_score: SelfScoreResult | None
    duration_seconds: float | None
    started_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(cls, r: HobitRunRecord) -> HobitRunResult:
        score = (
            SelfScoreResult(importance=r.importance, confidence=r.confidence, urgency=r.urgency)
            if r.importance is not None
            else None
        )
        return cls(
            id=r.id,
            repository_id=r.repository_id,
            hobit_slug=r.hobit_slug,
            status=r.status,
            trigger=r.trigger,
            commit_sha=r.commit_sha,
            headline=r.headline,
            tier=r.tier,
            self_score=score,
            duration_seconds=r.duration_seconds,
            started_at=r.started_at,
            finished_at=r.finished_at,
        )


class HobitRunDetailResult(HobitRunResult):
    """A run with its full output — for the detail endpoint."""

    narrative: str | None
    raw_output: str | None
    error: str | None

    @classmethod
    def of_detail(cls, r: HobitRunRecord) -> HobitRunDetailResult:
        base = HobitRunResult.of(r)
        return cls(
            **base.model_dump(),
            narrative=r.narrative,
            raw_output=r.raw_output,
            error=r.error,
        )


class HobitResult(BaseModel):
    """A hobit: registry identity merged with its effective config + last-run summary."""

    slug: str
    name: str
    description: str
    category: str
    enabled: bool
    model: str
    charter: str
    instructions: str
    timeout_seconds: float
    tags: list[str]
    unread_count: int
    last_run: HobitRunResult | None
    # Populated only for the per-repository view (a hobit's assignment to that repo): its run
    # cadence and when the scheduler last evaluated it. None in the global roster listing.
    cadence: str | None = None
    last_checked_at: datetime | None = None


class HobitConfigUpdate(BaseModel):
    """Full effective config sent by the config form; stored as overrides."""

    enabled: bool
    model: str
    charter: str
    instructions: str
    timeout_seconds: float
    tags: list[str]


class SetRepoHobitsRequest(BaseModel):
    """The hobit slugs to assign to a repository (replaces the current set)."""

    slugs: list[str]


class SetCadenceRequest(BaseModel):
    """A hobit assignment's run cadence: manual | hourly | daily | weekly | cron:<expr>."""

    cadence: str
