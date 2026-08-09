"""SQLAlchemy ORM entities for merge reviews: the review snapshot, per-hobit review results,
the on-demand principle verdicts about the diff, and the reader's starred remarks."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class MergeReviewRow(Base):
    """One branch-pair MR review — a mutable snapshot (re-analyze overwrites in place).

    Section payloads (footprint, classification, risk breakdown) are JSONB documents the UI
    consumes whole; per-section status columns let the UI poll while the background pipeline
    fills the AI sections in.
    """

    __tablename__ = "merge_reviews"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_branch: Mapped[str] = mapped_column(String(255))
    target_branch: Mapped[str] = mapped_column(String(255))

    # Snapshot provenance: what was actually analyzed (pinned shas, not branch names).
    analyzed_source_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    analyzed_target_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    merge_base_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)

    footprint: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    classification: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    overview_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_breakdown: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    risk_verdict: Mapped[str | None] = mapped_column(String(20), nullable=True)

    footprint_status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default="pending"
    )
    classification_status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default="pending"
    )
    overview_status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default="pending"
    )
    hobits_status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default="pending"
    )
    risk_status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default="pending"
    )
    overall_status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default="pending"
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_hobit_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MrHobitReviewRow(Base):
    """One hobit's review of one merge review. Snapshot-scoped: cascades with the review and is
    replaced on re-analyze — deliberately separate from `hobit_runs` (no briefing emission)."""

    __tablename__ = "mr_hobit_reviews"
    __table_args__ = (UniqueConstraint("merge_review_id", "hobit_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    merge_review_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("merge_reviews.id", ondelete="CASCADE"), index=True
    )
    hobit_slug: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    headline: Mapped[str | None] = mapped_column(String(500), nullable=True)
    self_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comments: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    raw_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# Same vocabulary as `principle_checks.status` — one verdict shape wherever a principle is judged.
MR_PRINCIPLE_CHECK_STATUSES = ("pending", "upheld", "violated", "error")


class MrPrincipleCheckRow(Base):
    """One principle's verdict about *the changes in one MR*, not about the repository.

    Deliberately a separate table from `principle_checks`: there, the newest row per
    (principle, repository) *is* the repository's current compliance state, and the principles
    list rolls those up into upheld/violated counts. A verdict about a diff is a different
    claim — a clean MR to a non-compliant repo is not repo compliance — so mixing them would
    corrupt both readings.

    Unique per (review, principle): re-running replaces the verdict in place, because there is
    only ever one current answer for "does this diff uphold this principle". Unlike the hobit
    reviews these are never enqueued by the analysis pipeline — the user asks for them.
    """

    __tablename__ = "mr_principle_checks"
    __table_args__ = (
        UniqueConstraint("merge_review_id", "principle_id"),
        CheckConstraint(
            "status IN ('pending', 'upheld', 'violated', 'error')",
            name="ck_mr_principle_checks_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    merge_review_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("merge_reviews.id", ondelete="CASCADE"), index=True
    )
    principle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("principles.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Cited violations introduced by this diff: [{file, line?, explanation}].
    violations: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Which snapshot was judged; a re-analyze moves the review on and strands this verdict.
    analyzed_source_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MrRemarkRow(Base):
    """One finding the reader starred on this MR — the "human remarks" layer.

    A snapshot, not a pointer: hobit comments are JSONB blobs replaced wholesale on re-analyze
    and principle verdicts are overwritten in place, so a remark copies the text it kept. It
    thereby survives re-runs — which is the point: the reader curated it for *this MR*.

    `source_ref` is the id of what was starred (a comment id, or a principle id with an optional
    violation index) — unique per review so starring is a toggle, not an append.
    """

    __tablename__ = "mr_remarks"
    __table_args__ = (
        UniqueConstraint("merge_review_id", "source_ref"),
        CheckConstraint(
            "source_kind IN ('hobit', 'principle')", name="ck_mr_remarks_source_kind"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    merge_review_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("merge_reviews.id", ondelete="CASCADE"), index=True
    )
    source_kind: Mapped[str] = mapped_column(String(16))
    source_ref: Mapped[str] = mapped_column(String(128))
    # Who said it (hobit or principle name) — denormalized so the tab renders standalone.
    source_label: Mapped[str] = mapped_column(String(300))
    severity: Mapped[str | None] = mapped_column(String(16), nullable=True)
    file: Mapped[str | None] = mapped_column(String(500), nullable=True)
    line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
