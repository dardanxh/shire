"""substrate: per-commit records with author attribution (members activity views)

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-07-29 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f4a5b6c7d8e9"
down_revision: str | Sequence[str] | None = "e3f4a5b6c7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "commit_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("analysis_id", sa.Uuid(), nullable=False),
        sa.Column("sha", sa.String(length=64), nullable=False),
        sa.Column("author_email", sa.String(length=320), nullable=False),
        sa.Column("committed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("insertions", sa.Integer(), nullable=False),
        sa.Column("deletions", sa.Integer(), nullable=False),
        sa.Column("files_changed", sa.Integer(), nullable=False),
        sa.Column("local_hour", sa.SmallInteger(), nullable=False),
        sa.Column("weekday", sa.SmallInteger(), nullable=False),
        sa.ForeignKeyConstraint(["analysis_id"], ["analyses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_commit_records_analysis_id", "commit_records", ["analysis_id"]
    )
    op.create_index(
        "ix_commit_records_author_email", "commit_records", ["author_email"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_commit_records_author_email", table_name="commit_records")
    op.drop_index("ix_commit_records_analysis_id", table_name="commit_records")
    op.drop_table("commit_records")
