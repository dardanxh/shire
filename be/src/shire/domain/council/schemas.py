"""Pydantic I/O schemas for the council domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from shire.domain.council.models import (
    DEVILS_ADVOCATE_SLUG,
    CouncilTakeRow,
    CouncilTopicRow,
)

MAX_MEMBERS = 8


class CreateCouncilTopic(BaseModel):
    """A topic for the council to debate (repos optional — they ground the takes)."""

    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10_000)
    repository_ids: list[uuid.UUID] = Field(default_factory=list)
    devils_advocate: bool = False


class UpdateCouncilTopic(CreateCouncilTopic):
    """Full edit of the topic (same shape as create; allowed only outside a running debate)."""


class UpdateCouncilMembers(BaseModel):
    """The roster to debate with (replaces the current set)."""

    slugs: list[str] = Field(max_length=MAX_MEMBERS)


class CouncilTakeResult(BaseModel):
    id: uuid.UUID
    hobit_slug: str
    hobit_name: str
    round: int
    status: str
    headline: str | None
    narrative: str | None
    error: str | None
    is_devils_advocate: bool
    duration_seconds: float | None
    started_at: datetime | None
    finished_at: datetime | None

    @classmethod
    def of(cls, row: CouncilTakeRow) -> CouncilTakeResult:
        return cls(
            id=row.id,
            hobit_slug=row.hobit_slug,
            hobit_name=row.hobit_name,
            round=row.round,
            status=row.status,
            headline=row.headline,
            narrative=row.narrative,
            error=row.error,
            is_devils_advocate=row.hobit_slug == DEVILS_ADVOCATE_SLUG,
            duration_seconds=row.duration_seconds,
            started_at=row.started_at,
            finished_at=row.finished_at,
        )


class CouncilSynthesisResult(BaseModel):
    """The chair's final recommendation."""

    headline: str
    narrative: str
    key_disagreements: list[str]


class CouncilMemberResult(BaseModel):
    slug: str
    name: str
    suggested: bool


class CouncilTopicResult(BaseModel):
    """A topic in list form."""

    id: uuid.UUID
    name: str
    status: str
    devils_advocate: bool
    repository_count: int
    member_count: int
    created_at: datetime
    updated_at: datetime
    convened_at: datetime | None

    @classmethod
    def of(cls, row: CouncilTopicRow) -> CouncilTopicResult:
        return cls(
            id=row.id,
            name=row.name,
            status=row.status,
            devils_advocate=row.devils_advocate,
            repository_count=len(row.repository_ids or []),
            member_count=len(row.member_slugs or []),
            created_at=row.created_at,
            updated_at=row.updated_at,
            convened_at=row.convened_at,
        )


class CouncilTopicDetailResult(CouncilTopicResult):
    """A topic with its full debate state — for the detail endpoint the UI polls."""

    description: str
    repository_ids: list[uuid.UUID]
    repository_slugs: list[str]
    suggested_slugs: list[str] | None
    member_slugs: list[str]
    roster_edited: bool
    roster_error: str | None
    members: list[CouncilMemberResult]
    takes: list[CouncilTakeResult]
    synthesis: CouncilSynthesisResult | None
    error: str | None

    @classmethod
    def of_detail(
        cls,
        row: CouncilTopicRow,
        *,
        repository_slugs: list[str],
        members: list[CouncilMemberResult],
        takes: list[CouncilTakeRow],
    ) -> CouncilTopicDetailResult:
        base = CouncilTopicResult.of(row)
        synthesis = (
            CouncilSynthesisResult(
                headline=row.synthesis_headline,
                narrative=row.synthesis_narrative or "",
                key_disagreements=list(row.key_disagreements or []),
            )
            if row.synthesis_headline is not None
            else None
        )
        return cls(
            **base.model_dump(),
            description=row.description,
            repository_ids=[uuid.UUID(r) for r in row.repository_ids or []],
            repository_slugs=repository_slugs,
            suggested_slugs=list(row.suggested_slugs) if row.suggested_slugs is not None else None,
            member_slugs=list(row.member_slugs or []),
            roster_edited=row.roster_edited,
            roster_error=row.roster_error,
            members=members,
            takes=[CouncilTakeResult.of(t) for t in takes],
            synthesis=synthesis,
            error=row.error,
        )
