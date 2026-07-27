"""hobits module: tombstone table for deleted built-in hobits

The code roster is a seed — deleting a built-in hobit records its slug here so the spec stays
hidden from listing, assignment, and runs. Deleting the row resurrects the hobit.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-07-27 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d2e3f4a5b6c7"
down_revision: str | Sequence[str] | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "removed_hobits",
        sa.Column("slug", sa.String(64), primary_key=True),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("removed_hobits")
