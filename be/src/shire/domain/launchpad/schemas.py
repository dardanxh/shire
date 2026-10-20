"""Pydantic I/O schemas for the Launchpad (Create / Update / Result)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from shire.domain.launchpad.models import (
    ActionRunRow,
    BookmarkActionRow,
    BookmarkRow,
    LaunchpadCategoryRow,
)

LogoKind = Literal["favicon", "upload", "monogram"]
NotifyOn = Literal["new_items", "any_attention", "always"]


# --- categories ---------------------------------------------------------------------------


class CreateLaunchpadCategory(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=60)
    position: int | None = None


class UpdateLaunchpadCategory(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    icon: str | None = Field(default=None, max_length=60)
    position: int | None = None


class LaunchpadCategoryResult(BaseModel):
    id: uuid.UUID
    name: str
    icon: str | None
    position: int
    bookmark_count: int

    @classmethod
    def of(cls, row: LaunchpadCategoryRow, bookmark_count: int = 0) -> LaunchpadCategoryResult:
        return cls(
            id=row.id, name=row.name, icon=row.icon, position=row.position,
            bookmark_count=bookmark_count,
        )


# --- bookmarks ----------------------------------------------------------------------------


class CreateBookmark(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=1, max_length=2048)
    description: str | None = Field(default=None, max_length=4000)
    category_id: uuid.UUID | None = None
    starred: bool = False
    # "favicon" fetches the site icon on save (falls back to a monogram when unreachable).
    logo_kind: LogoKind = "favicon"
    logo_color: str | None = Field(default=None, max_length=9)


class UpdateBookmark(BaseModel):
    """Partial edit — only the fields sent change (so the card's star toggle is one field)."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    url: str | None = Field(default=None, min_length=1, max_length=2048)
    description: str | None = Field(default=None, max_length=4000)
    category_id: uuid.UUID | None = None
    clear_category: bool = False
    starred: bool | None = None
    logo_kind: LogoKind | None = None
    logo_color: str | None = Field(default=None, max_length=9)


class UploadBookmarkLogo(BaseModel):
    # `data:image/png;base64,...` — JSON keeps the API free of multipart plumbing.
    data_url: str = Field(min_length=10, max_length=400_000)


class ActionSummaryResult(BaseModel):
    """What a bookmark card needs to show about its action."""

    enabled: bool
    cadence: str
    next_run_at: datetime | None
    last_run_at: datetime | None
    last_outcome: str | None
    last_status: str | None
    unread_count: int


class BookmarkResult(BaseModel):
    id: uuid.UUID
    name: str
    url: str
    host: str
    description: str | None
    category_id: uuid.UUID | None
    category_name: str | None
    starred: bool
    logo_kind: str
    logo_color: str | None
    # Cache-busting logo URL (None for monograms) — changes whenever the logo does.
    logo_url: str | None
    visit_count: int
    last_visited_at: datetime | None
    score: float
    action: ActionSummaryResult | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(
        cls,
        row: BookmarkRow,
        *,
        host: str,
        score: float,
        category_name: str | None,
        action: ActionSummaryResult | None,
        has_logo: bool,
    ) -> BookmarkResult:
        logo_url = None
        if row.logo_kind != "monogram" and has_logo:
            logo_url = (
                f"/api/v1/launchpad/bookmarks/{row.id}/logo?v={int(row.updated_at.timestamp())}"
            )
        return cls(
            id=row.id, name=row.name, url=row.url, host=host, description=row.description,
            category_id=row.category_id, category_name=category_name, starred=row.starred,
            logo_kind=row.logo_kind, logo_color=row.logo_color, logo_url=logo_url,
            visit_count=row.visit_count, last_visited_at=row.last_visited_at,
            score=round(score, 4), action=action, created_at=row.created_at,
            updated_at=row.updated_at,
        )


# --- actions ------------------------------------------------------------------------------


class UpsertBookmarkAction(BaseModel):
    prompt: str = Field(min_length=1, max_length=20_000)
    mcp_servers: list[str] = Field(default_factory=list, max_length=20)
    allow_writes: bool = False
    model: str | None = Field(default=None, max_length=60)
    timeout_seconds: int = Field(default=600, ge=60, le=3600)
    cadence: str = Field(default="manual", min_length=1, max_length=120)
    timezone: str = Field(default="UTC", max_length=64)
    enabled: bool = True
    notify_on: NotifyOn = "new_items"


class BookmarkActionResult(BaseModel):
    id: uuid.UUID
    bookmark_id: uuid.UUID
    prompt: str
    mcp_servers: list[str]
    allow_writes: bool
    model: str | None
    timeout_seconds: int
    cadence: str
    timezone: str
    enabled: bool
    notify_on: str
    seen_count: int
    next_run_at: datetime | None
    last_run_at: datetime | None
    # Write-type tools that would be denied on the next run (empty when writes are allowed).
    denied_tools: list[str]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, row: BookmarkActionRow, denied_tools: list[str]) -> BookmarkActionResult:
        return cls(
            id=row.id, bookmark_id=row.bookmark_id, prompt=row.prompt,
            mcp_servers=list(row.mcp_servers or []), allow_writes=row.allow_writes,
            model=row.model, timeout_seconds=row.timeout_seconds, cadence=row.cadence,
            timezone=row.timezone, enabled=row.enabled, notify_on=row.notify_on,
            seen_count=len(row.seen_keys or []), next_run_at=row.next_run_at,
            last_run_at=row.last_run_at, denied_tools=denied_tools,
            created_at=row.created_at, updated_at=row.updated_at,
        )


class ActionRunItemResult(BaseModel):
    key: str
    title: str
    url: str | None = None
    detail: str | None = None
    is_new: bool = False


class ActionRunResult(BaseModel):
    id: uuid.UUID
    action_id: uuid.UUID
    bookmark_id: uuid.UUID
    bookmark_name: str
    job_id: uuid.UUID | None
    trigger: str
    status: str
    outcome: str | None
    summary: str | None
    items: list[ActionRunItemResult]
    new_count: int
    notify: bool
    read_at: datetime | None
    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def of(
        cls, row: ActionRunRow, *, bookmark_id: uuid.UUID, bookmark_name: str
    ) -> ActionRunResult:
        return cls(
            id=row.id, action_id=row.action_id, bookmark_id=bookmark_id,
            bookmark_name=bookmark_name, job_id=row.job_id, trigger=row.trigger,
            status=row.status, outcome=row.outcome, summary=row.summary,
            items=[ActionRunItemResult(**i) for i in row.items or []],
            new_count=row.new_count, notify=row.notify, read_at=row.read_at,
            created_at=row.created_at, finished_at=row.finished_at,
        )


class LaunchpadNotificationsResult(BaseModel):
    unread_count: int
    items: list[ActionRunResult]
