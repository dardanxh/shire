"""hobits module: drop the enabled flag — every registered hobit is always runnable

Revision ID: a9b0c1d2e3f4
Revises: 3c169c8027e0
Create Date: 2026-07-27 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9b0c1d2e3f4"
down_revision: str | Sequence[str] | None = "3c169c8027e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("custom_hobits", "enabled")
    op.drop_column("hobit_configs", "enabled")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "custom_hobits",
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column("hobit_configs", sa.Column("enabled", sa.Boolean(), nullable=True))
