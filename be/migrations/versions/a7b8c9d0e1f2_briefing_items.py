"""briefing module: tiered briefing items

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-08 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "briefing_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("hobit_run_id", sa.Uuid(), nullable=False),
        sa.Column("hobit_slug", sa.String(length=64), nullable=False),
        sa.Column("tier", sa.String(length=8), nullable=False),
        sa.Column("headline", sa.String(length=500), nullable=False),
        sa.Column("importance", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("urgency", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["hobit_run_id"], ["hobit_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_briefing_items_repository_id", "briefing_items", ["repository_id"])
    op.create_index("ix_briefing_items_hobit_run_id", "briefing_items", ["hobit_run_id"])
    op.create_index("ix_briefing_items_tier", "briefing_items", ["tier"])
    op.create_index("ix_briefing_items_created_at", "briefing_items", ["created_at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_briefing_items_created_at", table_name="briefing_items")
    op.drop_index("ix_briefing_items_tier", table_name="briefing_items")
    op.drop_index("ix_briefing_items_hobit_run_id", table_name="briefing_items")
    op.drop_index("ix_briefing_items_repository_id", table_name="briefing_items")
    op.drop_table("briefing_items")
