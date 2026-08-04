"""substrate: dependency provenance + engine-known latest version

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-08-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b5c6d7e8f9a0"
down_revision: str | Sequence[str] | None = "a4b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "dependencies",
        sa.Column(
            "source",
            sa.String(length=8),
            nullable=False,
            server_default="scan",
        ),
    )
    op.add_column(
        "dependencies", sa.Column("latest_version", sa.String(length=128), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("dependencies", "latest_version")
    op.drop_column("dependencies", "source")
