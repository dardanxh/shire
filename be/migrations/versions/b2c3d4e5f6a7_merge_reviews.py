"""merge_review module: branch-pair MR reviews + per-hobit review results

A merge review is a mutable snapshot: git footprint (synchronous) + AI sections filled in by a
background pipeline (per-section status columns drive UI polling). Hobit reviews are
snapshot-scoped — they cascade with the review and are replaced on re-analyze.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "merge_reviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("source_branch", sa.String(length=255), nullable=False),
        sa.Column("target_branch", sa.String(length=255), nullable=False),
        sa.Column("analyzed_source_sha", sa.String(length=64), nullable=True),
        sa.Column("analyzed_target_sha", sa.String(length=64), nullable=True),
        sa.Column("merge_base_sha", sa.String(length=64), nullable=True),
        sa.Column("footprint", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("classification", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("overview_markdown", sa.Text(), nullable=True),
        sa.Column("risk_score", sa.Integer(), nullable=True),
        sa.Column("risk_breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("risk_verdict", sa.String(length=20), nullable=True),
        sa.Column(
            "footprint_status", sa.String(length=16), nullable=False, server_default="pending"
        ),
        sa.Column(
            "classification_status",
            sa.String(length=16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "overview_status", sa.String(length=16), nullable=False, server_default="pending"
        ),
        sa.Column("hobits_status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("risk_status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column(
            "overall_status", sa.String(length=16), nullable=False, server_default="pending"
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "selected_hobit_slugs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_merge_reviews_repository_id"), "merge_reviews", ["repository_id"], unique=False
    )

    op.create_table(
        "mr_hobit_reviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("merge_review_id", sa.Uuid(), nullable=False),
        sa.Column("hobit_slug", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("headline", sa.String(length=500), nullable=True),
        sa.Column("self_score", sa.Integer(), nullable=True),
        sa.Column("comments", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("raw_output", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["merge_review_id"], ["merge_reviews.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("merge_review_id", "hobit_slug"),
    )
    op.create_index(
        op.f("ix_mr_hobit_reviews_merge_review_id"),
        "mr_hobit_reviews",
        ["merge_review_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_mr_hobit_reviews_hobit_slug"), "mr_hobit_reviews", ["hobit_slug"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_mr_hobit_reviews_hobit_slug"), table_name="mr_hobit_reviews")
    op.drop_index(op.f("ix_mr_hobit_reviews_merge_review_id"), table_name="mr_hobit_reviews")
    op.drop_table("mr_hobit_reviews")
    op.drop_index(op.f("ix_merge_reviews_repository_id"), table_name="merge_reviews")
    op.drop_table("merge_reviews")
