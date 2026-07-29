"""substrate: artifact versions + analysis delta notes (evolution tracking)

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-07-29 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b6c7d8e9f0a1"
down_revision: str | Sequence[str] | None = "a5b6c7d8e9f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "artifact_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("artifact", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("branch", sa.String(length=255), nullable=False),
        sa.Column("commit_sha", sa.String(length=64), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_artifact_versions_repository_id", "artifact_versions", ["repository_id"]
    )
    op.create_table(
        "analysis_delta_notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("from_analysis_id", sa.Uuid(), nullable=False),
        sa.Column("to_analysis_id", sa.Uuid(), nullable=False),
        sa.Column("narrative", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "from_analysis_id", "to_analysis_id", name="uq_delta_note_pair"
        ),
    )
    op.create_index(
        "ix_analysis_delta_notes_repository_id",
        "analysis_delta_notes",
        ["repository_id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_analysis_delta_notes_repository_id", table_name="analysis_delta_notes"
    )
    op.drop_table("analysis_delta_notes")
    op.drop_index("ix_artifact_versions_repository_id", table_name="artifact_versions")
    op.drop_table("artifact_versions")
