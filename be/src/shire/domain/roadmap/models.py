"""SQLAlchemy ORM entities for roadmaps: AI-generated, cross-repository improvement plans.

A roadmap spans 1..N repositories with an optional natural-language end goal. Each generation
run produces a *version* — an immutable snapshot of milestones and items planned from the
portfolio's state at that moment (a generation run IS a version attempt, the NewsPollRow
pattern). Regeneration inserts version N+1 and carries finished work over; the roadmap's
`current_version_id` flips only when a version settles to `ready`, so a failed generation can
never eclipse a good plan.

Items are the executable unit: one item belongs to at most one repository (a branch/PR belongs
to exactly one repo); `repository_id NULL` marks portfolio-level items that can't be dispatched.
Every status/priority change appends a row to `roadmap_item_events` — the burnup chart is an
aggregation over that log, never over mutable state.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base

ROADMAP_STATUSES = ("active", "archived")

# Version lifecycle: pending (generation job queued/running) → ready | error.
VERSION_STATUSES = ("pending", "ready", "error")

ITEM_LABELS = (
    "improvement",
    "fix",
    "refactor",
    "feature",
    "security",
    "deprecation",
    "lib_upgrade",
    "docs",
    "testing",
    "performance",
)

ITEM_EFFORTS = ("S", "M", "L", "XL")

# Deliberately minimal: fresh items land straight in `todo`, an open PR just keeps the item
# `in_progress`, and closing work of any kind (merged, drift-verified, obsolete) is `done`.
ITEM_STATUSES = ("todo", "in_progress", "done")

# Any move between the three statuses is legal (including reopening `done`).
ITEM_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "todo": ("in_progress", "done"),
    "in_progress": ("todo", "done"),
    "done": ("todo", "in_progress"),
}

EVENT_KINDS = ("created", "status", "priority", "effort", "milestone", "carried")
EVENT_ACTORS = ("user", "ai", "system")


class RoadmapRow(Base):
    __tablename__ = "roadmaps"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    # The optional end goal in plain language; NULL = "derive improvements from repo state".
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", server_default="active")
    # The newest *ready* version — what the detail view renders. use_alter breaks the
    # roadmaps ↔ roadmap_versions FK cycle at create time.
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("roadmap_versions.id", use_alter=True, ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RoadmapRepositoryRow(Base):
    """One repository in a roadmap's scope. Editing the set only affects the next version."""

    __tablename__ = "roadmap_repositories"

    roadmap_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmaps.id", ondelete="CASCADE"), primary_key=True
    )
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True
    )
    # Ordering in the generation digest and in the UI's repo chips.
    position: Mapped[int] = mapped_column(Integer, default=0)


class RoadmapVersionRow(Base):
    """One generation run and its (immutable once ready) plan snapshot."""

    __tablename__ = "roadmap_versions"
    __table_args__ = (
        UniqueConstraint("roadmap_id", "number", name="uq_roadmap_versions_roadmap_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    roadmap_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmaps.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    # The roadmap.generate engine job.
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    # Provenance: what this version was generated from (the roadmap's goal/repos may change later).
    goal_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    repository_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # Per-repo health-radar scores from the generation output:
    # [{repo, repository_id, scores: {dimension: 1-10}, summary}].
    assessments: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RoadmapMilestoneRow(Base):
    """One linear milestone in a version; `position` is the execution order."""

    __tablename__ = "roadmap_milestones"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmap_versions.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)


class RoadmapItemRow(Base):
    __tablename__ = "roadmap_items"
    __table_args__ = (Index("ix_roadmap_items_version_status", "version_id", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmap_versions.id", ondelete="CASCADE"), index=True
    )
    # NULL for carried-over items (they pre-date the new plan's milestones).
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("roadmap_milestones.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # NULL = portfolio-level item (e.g. "adopt a shared CI template") — not executable.
    repository_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    # Slugified title; the execution branch is roadmap/<slug>-<shortid>.
    slug: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The AI's evidence for why this item exists, grounded in the digest.
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    label: Mapped[str] = mapped_column(String(16))
    # Eisenhower axes — kept as two booleans so each can be AI-assigned and user-overridden
    # independently; the quadrant is derived on the result schema.
    urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    important: Mapped[bool] = mapped_column(Boolean, default=False)
    effort: Mapped[str | None] = mapped_column(String(4), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="todo", server_default="todo")
    # Provenance when carried across versions (plain UUID on purpose: history only).
    carried_from_item_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    # Set by the issues export; doubles as its dedup guard.
    issue_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RoadmapItemDependencyRow(Base):
    """`item_id` is blocked by `depends_on_item_id`. Deps only link items of one version."""

    __tablename__ = "roadmap_item_dependencies"
    __table_args__ = (
        CheckConstraint("item_id != depends_on_item_id", name="ck_roadmap_dep_not_self"),
    )

    item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmap_items.id", ondelete="CASCADE"), primary_key=True
    )
    depends_on_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmap_items.id", ondelete="CASCADE"), primary_key=True
    )
    created_by: Mapped[str] = mapped_column(String(8), default="user")


EXECUTION_STATUSES = ("pending", "succeeded", "failed")
PR_STATES = ("open", "merged", "closed")


class RoadmapExecutionRow(Base):
    """One AI implementation run for one item: worktree → branch → push → PR.

    The credential never touches this row (or the job payload); all git/API work happens in the
    completion handler. Cost columns are copied from the engine job's usage accounting.
    """

    __tablename__ = "roadmap_executions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmap_items.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    branch: Mapped[str] = mapped_column(String(255))
    # Set while the isolated worktree exists; cleared after cleanup.
    worktree_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    base_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pr_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pr_state: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # The agent's own summary of what it changed — becomes the PR body.
    agent_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


DRIFT_CHECK_STATUSES = ("pending", "succeeded", "error")
DRIFT_VERDICTS = ("still_valid", "appears_done", "obsolete")
DRIFT_FINDING_STATUSES = ("open", "accepted", "dismissed")


class RoadmapDriftCheckRow(Base):
    """One read-only drift job for one repository's open items (append-only run history)."""

    __tablename__ = "roadmap_drift_checks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmap_versions.id", ondelete="CASCADE"), index=True
    )
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    # Staleness provenance: what branch the check inspected.
    branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RoadmapDriftFindingRow(Base):
    """One per-item drift verdict. Findings never auto-change item status — the user accepts
    (both verdicts close the item as done) or dismisses each one."""

    __tablename__ = "roadmap_drift_findings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    drift_check_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmap_drift_checks.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmap_items.id", ondelete="CASCADE"), index=True
    )
    verdict: Mapped[str] = mapped_column(String(16))
    # What the agent found, citing the files it opened.
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), default="open", server_default="open", index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RoadmapConfigRow(Base):
    """Roadmap module settings — one row (id=1), seeded lazily.

    Execution jobs get their own timeout (implementing an item takes far longer than an audit);
    `drift_cadence` feeds the Prefect schedule (Phase D), persisting even with the scheduler off.
    """

    __tablename__ = "roadmap_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    execution_timeout_seconds: Mapped[float] = mapped_column(
        Float, default=900.0, server_default="900"
    )
    # manual | hourly | daily | weekly | cron:<expr> (validated by validate_cadence).
    drift_cadence: Mapped[str] = mapped_column(
        String(64), default="manual", server_default="manual"
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RoadmapItemEventRow(Base):
    """Append-only change log per item — the burnup/history source of truth.

    `roadmap_id` is denormalized so cross-version series are one indexed query.
    """

    __tablename__ = "roadmap_item_events"
    __table_args__ = (Index("ix_roadmap_item_events_roadmap_created", "roadmap_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    roadmap_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("roadmap_items.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16))
    from_value: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_value: Mapped[str | None] = mapped_column(String(32), nullable=True)
    actor: Mapped[str] = mapped_column(String(8), default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
