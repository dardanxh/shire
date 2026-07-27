"""hobits module: drop the category field — discipline/topics live in tags

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-07-27 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b0c1d2e3f4a5"
down_revision: str | Sequence[str] | None = "a9b0c1d2e3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("custom_hobits", "category")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "custom_hobits",
        sa.Column("category", sa.String(64), nullable=False, server_default="Custom"),
    )
