"""knowledge catalogs: starred flag on blueprints, modelling, security, qualities

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-07-28 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e3f4a5b6c7d8"
down_revision: str | Sequence[str] | None = "d2e3f4a5b6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (
    "architecture_blueprints",
    "modelling_strategies",
    "data_regulations",
    "data_safety_practices",
    "architecture_qualities",
)


def upgrade() -> None:
    """Upgrade schema."""
    for table in TABLES:
        op.add_column(
            table,
            sa.Column("starred", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    """Downgrade schema."""
    for table in TABLES:
        op.drop_column(table, "starred")
