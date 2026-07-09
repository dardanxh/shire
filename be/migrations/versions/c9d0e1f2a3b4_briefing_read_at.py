"""briefing module: per-post read tracking (read_at)

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: str | Sequence[str] | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "briefing_items", sa.Column("read_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index("ix_briefing_items_read_at", "briefing_items", ["read_at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_briefing_items_read_at", table_name="briefing_items")
    op.drop_column("briefing_items", "read_at")
