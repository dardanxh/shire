"""mr_principle_checks: on-demand principle verdicts about an MR's diff

Revision ID: c2d3e4f5a6b7
Revises: a0b1c2d3e4f5
Create Date: 2026-08-07

Separate from `principle_checks` on purpose: there, the newest row per (principle, repository)
is the repository's current compliance state. A verdict about one MR's changes is a different
claim, and folding it in would corrupt the repo-level reading.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c2d3e4f5a6b7"
down_revision: str | Sequence[str] | None = "a0b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mr_principle_checks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("merge_review_id", sa.Uuid(), nullable=False),
        sa.Column("principle_id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status", sa.String(length=16), server_default="pending", nullable=False
        ),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("violations", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("analyzed_source_sha", sa.String(length=64), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["merge_review_id"], ["merge_reviews.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["principle_id"], ["principles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("merge_review_id", "principle_id"),
        sa.CheckConstraint(
            "status IN ('pending', 'upheld', 'violated', 'error')",
            name="ck_mr_principle_checks_status",
        ),
    )
    op.create_index(
        "ix_mr_principle_checks_merge_review_id",
        "mr_principle_checks",
        ["merge_review_id"],
    )
    op.create_index(
        "ix_mr_principle_checks_principle_id", "mr_principle_checks", ["principle_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_mr_principle_checks_principle_id", table_name="mr_principle_checks")
    op.drop_index(
        "ix_mr_principle_checks_merge_review_id", table_name="mr_principle_checks"
    )
    op.drop_table("mr_principle_checks")
