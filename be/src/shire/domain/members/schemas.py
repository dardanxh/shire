"""Pydantic result/input schemas for the Members context.

Framing note: these describe *collaboration and codebase resilience*, not individual performance.
There is deliberately no rank field — ordering is a display concern, and the headline metric is
the portfolio's knowledge distribution.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MemberSummaryResult(BaseModel):
    """One aggregated identity across all repos (name/email pseudonymized when anonymized)."""

    id: uuid.UUID
    name: str
    email: str
    anonymized: bool
    commits: int
    lines_added: int
    lines_removed: int
    files_touched: int
    repository_count: int
    first_active_at: datetime | None
    last_active_at: datetime | None
    status: str  # active | dormant


class PortfolioHealthResult(BaseModel):
    """Fleet-wide collaboration health — the headline, framed around resilience not ranking."""

    member_count: int
    active_member_count: int
    dormant_member_count: int
    repository_count: int
    single_member_repositories: int
    # Share of all commits attributable to the single most active member (0..1). A high value
    # means knowledge is concentrated (a bus-factor risk), not that anyone is "the best".
    knowledge_concentration: float


class MembersOverviewResult(BaseModel):
    health: PortfolioHealthResult
    members: list[MemberSummaryResult]


class MemberRepositoryBreakdownResult(BaseModel):
    repository_id: uuid.UUID
    repository_name: str
    commits: int
    lines_added: int
    lines_removed: int
    files_touched: int


class MemberDetailResult(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    anonymized: bool
    commits: int
    lines_added: int
    lines_removed: int
    files_touched: int
    first_active_at: datetime | None
    last_active_at: datetime | None
    status: str
    repositories: list[MemberRepositoryBreakdownResult]


class MemberExclusionResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pattern: str
    reason: str | None
    is_bot: bool
    created_at: datetime


class CreateMemberExclusion(BaseModel):
    pattern: str
    reason: str | None = None
    is_bot: bool = False
