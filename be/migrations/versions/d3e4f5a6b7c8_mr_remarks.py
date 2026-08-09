"""mr_remarks: findings the reader starred on one MR

A remark snapshots the starred text (hobit comments and principle verdicts are overwritten on
re-run, so a pointer would dangle). `source_ref` is unique per review so starring toggles.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-08-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3e4f5a6b7c8"
down_revision: str | Sequence[str] | None = "c2d3e4f5a6b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "mr_remarks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("merge_review_id", sa.Uuid(), nullable=False),
        sa.Column("source_kind", sa.String(length=16), nullable=False),
        sa.Column("source_ref", sa.String(length=128), nullable=False),
        sa.Column("source_label", sa.String(length=300), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=True),
        sa.Column("file", sa.String(length=500), nullable=True),
        sa.Column("line", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "source_kind IN ('hobit', 'principle')", name="ck_mr_remarks_source_kind"
        ),
        sa.ForeignKeyConstraint(
            ["merge_review_id"], ["merge_reviews.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("merge_review_id", "source_ref"),
    )
    op.create_index(
        "ix_mr_remarks_merge_review_id", "mr_remarks", ["merge_review_id"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_mr_remarks_merge_review_id", table_name="mr_remarks")
    op.drop_table("mr_remarks")
