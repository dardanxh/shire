"""Pydantic I/O schemas for the Teams context."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class TeamRefResult(BaseModel):
    """Compact team reference embedded into member summaries and graph nodes."""

    id: uuid.UUID
    name: str
    color: str


class TeamMemberResult(BaseModel):
    """One member assigned to a team (identity id + the email captured at assignment time)."""

    member_id: uuid.UUID
    email: str


class TeamResult(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    description: str | None
    member_count: int
    created_at: datetime


class TeamDetailResult(TeamResult):
    members: list[TeamMemberResult]


class CreateTeam(BaseModel):
    name: str
    # Optional — the service assigns a palette color when omitted.
    color: str | None = None
    description: str | None = None


class UpdateTeam(BaseModel):
    name: str | None = None
    color: str | None = None
    description: str | None = None


class AssignMember(BaseModel):
    """One member to assign — identity id plus the email to record for the roster label."""

    id: uuid.UUID
    email: str


class AssignMembersInput(BaseModel):
    """Assign (or move) these members into a team."""

    members: list[AssignMember]
