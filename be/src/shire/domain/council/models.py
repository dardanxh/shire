"""SQLAlchemy ORM entities for the council domain: debated topics + their per-round takes."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
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

# The topic's lifecycle. Atomic phase transitions ride on the status column itself
# (UPDATE ... WHERE status = <expected> AND convene_id = <token>, rowcount == 1), so the
# R1→R2 and R2→chair advances run exactly once even when completion handlers race.
TOPIC_STATUSES = (
    "suggesting",  # created; the roster-suggestion job is in flight
    "ready",  # roster suggested (or suggestion failed) — awaiting convene
    "r1_running",  # round 1: independent takes fanned out
    "r2_running",  # round 2: challenge/refine takes fanned out
    "synthesizing",  # round 3: the chair job is running
    "completed",
    "failed",
)
ACTIVE_STATUSES = ("suggesting", "r1_running", "r2_running", "synthesizing")
CONVENABLE_STATUSES = ("suggesting", "ready", "completed", "failed")
EDITABLE_STATUSES = CONVENABLE_STATUSES  # topic + roster edits are locked mid-debate

TAKE_STATUSES = (
    "pending",
    "running",
    "completed",
    "parse_failed",
    "timeout",
    "agent_unavailable",
    "error",
)
UNSETTLED_TAKE_STATUSES = ("pending", "running")

# The devil's advocate is a fixed persona, not a roster member. The dunder slug can never
# collide with a real hobit slug (slug generation strips non-[a-z0-9] to hyphens).
DEVILS_ADVOCATE_SLUG = "__devils_advocate__"
DEVILS_ADVOCATE_NAME = "Devil's Advocate"


class CouncilTopicRow(Base):
    """One debated topic: roster + rounds state machine + the chair's synthesis (1:1, so it
    lives here rather than as a round-3 take)."""

    __tablename__ = "council_topics"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(16), default="suggesting", server_default="suggesting"
    )
    devils_advocate: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Consumed only at prompt-build time (digest); deleted repos are skipped — no join table.
    repository_ids: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    # NULL until the suggestion job settles; kept for "suggested" badges even after edits.
    suggested_slugs: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    member_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    # Once the user edits the roster, a late-arriving suggestion never clobbers it.
    roster_edited: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    roster_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Staleness token: regenerated on every convene; jobs carry it and no-op on mismatch.
    convene_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    synthesis_headline: Mapped[str | None] = mapped_column(String(500), nullable=True)
    synthesis_narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_disagreements: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    chair_raw_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    convened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CouncilTakeRow(Base):
    """One member's take in one round. `hobit_name` is snapshotted at enqueue so display
    survives custom-hobit deletion (and names the devil's advocate, which has no spec)."""

    __tablename__ = "council_takes"
    __table_args__ = (
        UniqueConstraint("topic_id", "hobit_slug", "round"),
        CheckConstraint("round IN (1, 2)", name="ck_council_take_round"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    topic_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("council_topics.id", ondelete="CASCADE"), index=True
    )
    round: Mapped[int] = mapped_column(Integer)
    hobit_slug: Mapped[str] = mapped_column(String(64))
    hobit_name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    headline: Mapped[str | None] = mapped_column(String(500), nullable=True)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
