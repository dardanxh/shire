"""Schemas for the inspections read model and its bulk runner."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class InspectionItemResult(BaseModel):
    """One inspection's state for a single repository."""

    key: str
    group: str
    done: bool
    generated_at: datetime | None = None
    # False when the underlying tool isn't installed on the host, or the repo has no clone /
    # no analysis snapshot yet — the checklist disables the row and shows the reason.
    runnable: bool = True
    unavailable_reason: str | None = None
    in_flight: bool = False


class InspectionDetailResult(BaseModel):
    repository_id: uuid.UUID
    completed: int
    total: int
    items: list[InspectionItemResult]


class InspectionOverviewItem(BaseModel):
    """Per-repository row for the repositories table's derived columns.

    Commit activity rides along with the counts so the table needs one request (and one
    poll) for both new columns; both are derived from the same latest-analysis snapshot.
    """

    repository_id: uuid.UUID
    slug: str
    completed: int
    total: int
    # Dense, `days` long, oldest first — zero-filled server-side so the client renders it
    # straight into a sparkline without bucketing.
    daily_commits: list[int]


class RunInspectionsRequest(BaseModel):
    # None = every bulk-eligible inspection that isn't done yet (what the table's button
    # sends). An explicit list runs exactly those keys.
    keys: list[str] | None = None


class SkippedInspection(BaseModel):
    key: str
    # already_done | in_flight | not_runnable | unknown_key | failed
    reason: str
    detail: str | None = None


class RunInspectionsResult(BaseModel):
    repository_id: uuid.UUID
    queued: list[str] = Field(default_factory=list)
    skipped: list[SkippedInspection] = Field(default_factory=list)
