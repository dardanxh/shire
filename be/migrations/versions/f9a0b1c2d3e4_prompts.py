"""prompts: a versioned prompt library with deterministic and AI-judged metrics

A mutable library entity (`prompts`) points at the newest immutable numbered snapshot
(`prompt_versions`), like `roadmaps` -> `roadmap_versions`; `use_alter` on the pointer breaks the
FK cycle at create time. The four artefact tables hang off a version rather than the prompt, since a
review or arena run describes one exact body and must not survive an edit.

All six tables land in one revision: the artefacts are only exercised from Phase 2 onward, but a
chain of near-empty revisions would be worse than one honest schema.

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-08-06 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f9a0b1c2d3e4"
down_revision: str | Sequence[str] | None = "e8f9a0b1c2d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_WORK_STATUS = "status IN ('pending', 'running', 'done', 'failed')"


def _artefact_columns() -> list[sa.Column]:
    """Columns every async artefact shares: identity, the engine job, lifecycle, and timings."""
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("version_id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "prompts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("current_version_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_prompts_updated_at", "prompts", ["updated_at"])

    op.create_table(
        "prompt_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("prompt_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("guidance", sa.Text(), nullable=True),
        sa.Column("tuning", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="manual"),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("estimated_input_tokens", sa.Integer(), nullable=False),
        sa.Column("static_score", sa.Integer(), nullable=False),
        sa.Column("static_findings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["prompt_id"], ["prompts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("prompt_id", "number", name="uq_prompt_versions_prompt_number"),
        sa.CheckConstraint(
            "source IN ('manual', 'ai_rewrite', 'suggestion_merge')",
            name="ck_prompt_versions_source",
        ),
        sa.CheckConstraint(
            "static_score >= 0 AND static_score <= 100", name="ck_prompt_versions_static_score"
        ),
    )
    op.create_index("ix_prompt_versions_prompt_id", "prompt_versions", ["prompt_id"])

    # Added after both tables exist: the pointer completes a prompts <-> prompt_versions cycle.
    op.create_foreign_key(
        "fk_prompts_current_version_id",
        "prompts",
        "prompt_versions",
        ["current_version_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "prompt_reviews",
        *_artefact_columns(),
        sa.Column("clarity", sa.Integer(), nullable=True),
        sa.Column("specificity", sa.Integer(), nullable=True),
        sa.Column("structure", sa.Integer(), nullable=True),
        sa.Column("context_sufficiency", sa.Integer(), nullable=True),
        sa.Column("factfulness", sa.Integer(), nullable=True),
        sa.Column("accuracy", sa.Integer(), nullable=True),
        sa.Column("goal_focus", sa.Integer(), nullable=True),
        sa.Column("hallucination_risk", sa.Integer(), nullable=True),
        sa.Column("size_verdict", sa.String(length=16), nullable=True),
        sa.Column("goal_count", sa.Integer(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("findings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["version_id"], ["prompt_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(_WORK_STATUS, name="ck_prompt_reviews_status"),
    )
    op.create_index("ix_prompt_reviews_version_id", "prompt_reviews", ["version_id"])
    op.create_index(
        "ix_prompt_reviews_version_created", "prompt_reviews", ["version_id", "created_at"]
    )

    op.create_table(
        "prompt_suggestions",
        *_artefact_columns(),
        sa.Column("rewritten_body", sa.Text(), nullable=True),
        sa.Column("edits", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["version_id"], ["prompt_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(_WORK_STATUS, name="ck_prompt_suggestions_status"),
    )
    op.create_index("ix_prompt_suggestions_version_id", "prompt_suggestions", ["version_id"])
    op.create_index(
        "ix_prompt_suggestions_version_created",
        "prompt_suggestions",
        ["version_id", "created_at"],
    )

    op.create_table(
        "prompt_runs",
        *_artefact_columns(),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("output", sa.Text(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("cache_read_input_tokens", sa.Integer(), nullable=True),
        sa.Column("cache_creation_input_tokens", sa.Integer(), nullable=True),
        sa.Column("total_cost_usd", sa.Float(), nullable=True),
        sa.Column("num_turns", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("system", sa.Text(), nullable=True),
        sa.Column("variables", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["version_id"], ["prompt_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(_WORK_STATUS, name="ck_prompt_runs_status"),
    )
    op.create_index("ix_prompt_runs_version_id", "prompt_runs", ["version_id"])
    op.create_index("ix_prompt_runs_batch", "prompt_runs", ["batch_id"])
    op.create_index("ix_prompt_runs_version_created", "prompt_runs", ["version_id", "created_at"])

    op.create_table(
        "prompt_judgements",
        *_artefact_columns(),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("scores", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("winner_run_id", sa.Uuid(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["version_id"], ["prompt_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(_WORK_STATUS, name="ck_prompt_judgements_status"),
    )
    op.create_index("ix_prompt_judgements_version_id", "prompt_judgements", ["version_id"])
    op.create_index("ix_prompt_judgements_batch", "prompt_judgements", ["batch_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_prompt_judgements_batch", table_name="prompt_judgements")
    op.drop_index("ix_prompt_judgements_version_id", table_name="prompt_judgements")
    op.drop_table("prompt_judgements")

    op.drop_index("ix_prompt_runs_version_created", table_name="prompt_runs")
    op.drop_index("ix_prompt_runs_batch", table_name="prompt_runs")
    op.drop_index("ix_prompt_runs_version_id", table_name="prompt_runs")
    op.drop_table("prompt_runs")

    op.drop_index("ix_prompt_suggestions_version_created", table_name="prompt_suggestions")
    op.drop_index("ix_prompt_suggestions_version_id", table_name="prompt_suggestions")
    op.drop_table("prompt_suggestions")

    op.drop_index("ix_prompt_reviews_version_created", table_name="prompt_reviews")
    op.drop_index("ix_prompt_reviews_version_id", table_name="prompt_reviews")
    op.drop_table("prompt_reviews")

    # Drop the cycle-completing FK before the table it points at.
    op.drop_constraint("fk_prompts_current_version_id", "prompts", type_="foreignkey")
    op.drop_index("ix_prompt_versions_prompt_id", table_name="prompt_versions")
    op.drop_table("prompt_versions")

    op.drop_index("ix_prompts_updated_at", table_name="prompts")
    op.drop_table("prompts")
