"""SQLAlchemy ORM entities for the prompt-engineering module.

Shape mirrors `roadmap`: a mutable library entity (`prompts`) pointing at the newest immutable
numbered snapshot (`prompt_versions`), with the async artefacts hanging off a version rather than
off the prompt -- a review or arena run describes one exact body, so it must not survive an edit.

The four artefact tables (`prompt_reviews`, `prompt_suggestions`, `prompt_runs`,
`prompt_judgements`) are created up front by the same migration but only exercised from Phase 2
onward; keeping them in one migration avoids a chain of near-empty revisions.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
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

# Lifecycle of the async artefacts. Deliberately not the engine's job statuses: a job can succeed
# while the artefact fails, because succeeded output can still be unparseable.
WORK_STATUSES = ("pending", "running", "done", "failed")

VERSION_SOURCES = ("manual", "ai_rewrite", "suggestion_merge")

SIZE_VERDICTS = ("too_small", "right", "too_big")


class PromptRow(Base):
    """One prompt in the library. Mutable metadata; the text lives in versions."""

    __tablename__ = "prompts"
    __table_args__ = (Index("ix_prompts_updated_at", "updated_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Free-form labels for filtering the library. A list of strings.
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # The newest version -- what the workbench opens on. `use_alter` breaks the
    # prompts <-> prompt_versions FK cycle at create time (the roadmap domain does the same).
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("prompt_versions.id", use_alter=True, ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PromptVersionRow(Base):
    """One immutable snapshot of a prompt: the text, the intent, and the free verdict on it.

    `static_score` / `static_findings` / `estimated_input_tokens` are computed deterministically at
    save time (`analysis.analyse`) rather than on read, so the library list and the trend chart are
    plain column reads and the numbers can never drift from the body they describe.
    """

    __tablename__ = "prompt_versions"
    __table_args__ = (
        UniqueConstraint("prompt_id", "number", name="uq_prompt_versions_prompt_number"),
        CheckConstraint(
            "source IN ('manual', 'ai_rewrite', 'suggestion_merge')",
            name="ck_prompt_versions_source",
        ),
        CheckConstraint(
            "static_score >= 0 AND static_score <= 100", name="ck_prompt_versions_static_score"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    prompt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prompts.id", ondelete="CASCADE"), index=True
    )
    # 1-based, contiguous per prompt.
    number: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    # The user's free-text "how I want this changed" note that produced this version.
    guidance: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Snapshot of the tuning knobs (see domain.Tuning).
    tuning: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    source: Mapped[str] = mapped_column(String(20), default="manual", server_default="manual")
    # sha256 of the body -- lets the service refuse to store a version identical to the current one
    # rather than appending noise versions (the trick `substrate.artifact_versions` uses).
    content_hash: Mapped[str] = mapped_column(String(64))
    estimated_input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    static_score: Mapped[int] = mapped_column(Integer, default=100)
    static_findings: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    # One-line changelog entry written by the user (or generated on a suggestion merge).
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The suggestion this body was merged from, when it came from one. No FK: prompt_suggestions
    # already points back at prompt_versions, and an FK-less pointer keeps the delete order simple
    # (same call as `prompt_judgements.winner_run_id`). This is what makes "did accepting the
    # model's edits actually raise the score?" answerable later.
    from_suggestion_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PromptReviewRow(Base):
    """One AI metrics pass over a version. Scores are 0-100 integers."""

    __tablename__ = "prompt_reviews"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'done', 'failed')", name="ck_prompt_reviews_status"
        ),
        Index("ix_prompt_reviews_version_created", "version_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prompt_versions.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    # The model that produced these scores -- without it a trend line is meaningless.
    model: Mapped[str] = mapped_column(String(64))

    clarity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    specificity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    structure: Mapped[int | None] = mapped_column(Integer, nullable=True)
    context_sufficiency: Mapped[int | None] = mapped_column(Integer, nullable=True)
    factfulness: Mapped[int | None] = mapped_column(Integer, nullable=True)
    accuracy: Mapped[int | None] = mapped_column(Integer, nullable=True)
    goal_focus: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Higher is worse for this one. The trend chart inverts it so "up is good" holds everywhere.
    hallucination_risk: Mapped[int | None] = mapped_column(Integer, nullable=True)

    size_verdict: Mapped[str | None] = mapped_column(String(16), nullable=True)
    goal_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{dimension, severity, title, detail, evidence}]
    findings: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)

    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PromptSuggestionRow(Base):
    """Claude's proposed rewrite of a version, plus its notes on what it changed.

    `rewritten_body` is the whole proposed prompt. `changes` is *explanatory only* -- the UI derives
    accept/reject units from a deterministic word-level diff of old vs new, because a patch list
    keyed on verbatim `old` strings misses whenever the model paraphrases (see `jobs.py`).
    """

    __tablename__ = "prompt_suggestions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'done', 'failed')",
            name="ck_prompt_suggestions_status",
        ),
        Index("ix_prompt_suggestions_version_created", "version_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prompt_versions.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    model: Mapped[str] = mapped_column(String(64))
    rewritten_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{title, rationale, dimension}] -- narrative, not a patch set.
    changes: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PromptRunRow(Base):
    """One execution of a version against one model.

    Token and cost columns are copied from the engine job's `usage` accounting by the completion
    handler -- the same promotion `roadmap_versions` does -- so the arena reports measured numbers
    rather than the estimate on the version row.
    """

    __tablename__ = "prompt_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'done', 'failed')", name="ck_prompt_runs_status"
        ),
        Index("ix_prompt_runs_batch", "batch_id"),
        Index("ix_prompt_runs_version_created", "version_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prompt_versions.id", ondelete="CASCADE"), index=True
    )
    # Groups the runs of one "test across these models" action, so the completion handler knows
    # when the whole batch has settled and the judge can start.
    batch_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    model: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    output: Mapped[str | None] = mapped_column(Text, nullable=True)

    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cache_read_input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cache_creation_input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # What the call would have cost at API rates. Indicative only: under subscription auth the
    # engine strips ANTHROPIC_API_KEY, so nothing is billed per token.
    total_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    num_turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Optional system prompt and {{variable}} substitutions used for this run.
    system: Mapped[str | None] = mapped_column(Text, nullable=True)
    variables: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PromptJudgementRow(Base):
    """A separate Claude session's verdict on one batch of runs."""

    __tablename__ = "prompt_judgements"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'done', 'failed')",
            name="ck_prompt_judgements_status",
        ),
        Index("ix_prompt_judgements_batch", "batch_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prompt_versions.id", ondelete="CASCADE"), index=True
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    model: Mapped[str] = mapped_column(String(64))
    # [{run_id, model, faithfulness, completeness, instruction_adherence, groundedness, overall,
    #   rationale}]
    scores: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    # No FK: the judged run can be deleted with its version while the verdict text remains useful.
    winner_run_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
