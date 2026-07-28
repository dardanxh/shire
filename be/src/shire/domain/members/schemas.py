"""Pydantic result/input schemas for the Members context.

Framing note: these describe *collaboration and codebase resilience*, not individual performance.
There is deliberately no rank field — ordering is a display concern, and the headline metric is
the portfolio's knowledge distribution.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

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
    # Commits per week (oldest first, fixed window) for the row sparkline. Empty when no
    # repo's analysis carries per-commit records yet (refresh backfills).
    weekly_commits: list[int]
    # Repos where this member is the only tracked contributor (offboarding risk, not a rank).
    sole_maintainer_repos: int


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


class MemberWeeklyActivityResult(BaseModel):
    week_start: date
    commits: int
    lines_changed: int


class CommitSizeBucketResult(BaseModel):
    """One bar of the commit-size histogram (`label` like "1-10", "500+")."""

    label: str
    count: int


class MemberCommitSizesResult(BaseModel):
    """Shape of this member's commits — batch-of-large-changes vs steady small ones."""

    buckets: list[CommitSizeBucketResult]
    median_lines: int
    p90_lines: int
    # Fraction of commits changing more than 500 lines (matches the top bucket).
    large_share: float


class MemberHeatmapCellResult(BaseModel):
    weekday: int  # 0 = Monday (author-local clock)
    hour: int
    commits: int


class MemberRepositoryShareResult(BaseModel):
    """How much of a repo's history is this member's — gravitation, framed as bus-factor."""

    repository_id: uuid.UUID
    repository_name: str
    member_commits: int
    total_commits: int
    share: float  # member_commits / total_commits (0..1)
    sole_maintainer: bool


class MemberActivityResult(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    anonymized: bool
    weekly: list[MemberWeeklyActivityResult]
    sizes: MemberCommitSizesResult
    heatmap: list[MemberHeatmapCellResult]
    repositories: list[MemberRepositoryShareResult]
    # Repos this member touched whose latest analysis predates per-commit records — the
    # timeline/sizes/heatmap under-count until those repos are refreshed.
    missing_data_repositories: int


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
