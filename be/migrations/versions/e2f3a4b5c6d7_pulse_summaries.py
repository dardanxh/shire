"""pulse: cached per-window accomplishment summaries

One row per (repository, window start date, head commit) — re-viewing the same Pulse
window reuses the narrative; a new commit moves the head and invalidates naturally.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-08-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2f3a4b5c6d7"
down_revision: str | Sequence[str] | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "pulse_summaries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("since_date", sa.Date(), nullable=False),
        sa.Column("head_sha", sa.String(length=64), nullable=False),
        sa.Column("narrative", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "repository_id", "since_date", "head_sha", name="uq_pulse_summary_window"
        ),
    )
    op.create_index(
        "ix_pulse_summaries_repository_id", "pulse_summaries", ["repository_id"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_pulse_summaries_repository_id", table_name="pulse_summaries")
    op.drop_table("pulse_summaries")
