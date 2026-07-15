"""Pydantic I/O schemas for the Repository domain (Create / Result)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from hobits.domain.repository.domain import BranchInspection, BranchTip, Repository


class IngestRepositoryRequest(BaseModel):
    """Create input: a git URL to clone + analyze, optionally via a stored connection.

    `tool_ids` (when provided) pins exactly which integrations run — bypassing the language-based
    auto-link. `None` keeps the auto-link default.
    """

    url: str
    connection_id: uuid.UUID | None = None
    tool_ids: list[str] | None = None


class RepositoryResult(BaseModel):
    """Result schema returned by the service/routes (never a SQLAlchemy entity)."""

    id: uuid.UUID
    provider: str
    owner: str
    name: str
    slug: str
    url: str
    connection_id: uuid.UUID | None
    default_branch: str
    # The branch all repository data currently reflects (falls back to default_branch).
    current_branch: str
    status: str
    last_analyzed_commit: str | None
    last_analyzed_at: datetime | None
    error: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, repo: Repository) -> RepositoryResult:
        return cls(
            id=repo.id,
            provider=repo.coordinates.provider.value,
            owner=repo.coordinates.owner,
            name=repo.coordinates.name,
            slug=repo.coordinates.slug,
            url=repo.url.value,
            connection_id=repo.connection_id,
            default_branch=repo.default_branch,
            current_branch=repo.current_branch or repo.default_branch,
            status=repo.status.value,
            last_analyzed_commit=repo.last_analyzed_commit,
            last_analyzed_at=repo.last_analyzed_at,
            error=repo.error,
            created_at=repo.created_at,
            updated_at=repo.updated_at,
        )


class SwitchBranchRequest(BaseModel):
    """Switch the repository's active branch (checkout + pull + full re-analysis)."""

    branch: str


class BranchResult(BaseModel):
    """One branch tip. `merged` = ancestor check against the default branch (a true merge
    happened — safe to delete); `squash_merged` = patch-equivalence check that also catches
    squash/rebase merges (None when not checked or the check failed). Either yields
    `status = "merged"`."""

    name: str
    is_default: bool
    last_commit_sha: str
    last_commit_at: datetime
    author_name: str
    author_email: str
    ahead: int | None
    behind: int | None
    merged: bool | None
    squash_merged: bool | None
    status: str  # "default" | "merged" | "stale" | "active"

    @classmethod
    def of(cls, tip: BranchTip) -> BranchResult:
        return cls(
            name=tip.name,
            is_default=tip.is_default,
            last_commit_sha=tip.last_commit_sha,
            last_commit_at=tip.last_commit_at,
            author_name=tip.author_name,
            author_email=tip.author_email,
            ahead=tip.ahead,
            behind=tip.behind,
            merged=tip.merged,
            squash_merged=tip.squash_merged,
            status=tip.status.value,
        )


class BranchNamesResult(BaseModel):
    """The cheap full branch-name list (for branch pickers), most recently committed first."""

    default_branch: str
    branches: list[str]


class BranchesResult(BaseModel):
    """Live branch overview. `merged_count`/`stale_count` use the ancestor check across all
    enumerated branches; squash-merge detection upgrades only the listed top branches."""

    total_branches: int
    merged_count: int
    stale_count: int
    stale_days: int
    default_branch: str
    fetched: bool
    truncated: bool
    as_of: datetime
    branches: list[BranchResult]

    @classmethod
    def of(cls, inspection: BranchInspection, default_branch: str) -> BranchesResult:
        return cls(
            total_branches=inspection.total_branches,
            merged_count=inspection.merged_count,
            stale_count=inspection.stale_count,
            stale_days=inspection.stale_days,
            default_branch=default_branch,
            fetched=inspection.fetched,
            truncated=inspection.truncated,
            as_of=inspection.as_of,
            branches=[BranchResult.of(tip) for tip in inspection.branches],
        )
