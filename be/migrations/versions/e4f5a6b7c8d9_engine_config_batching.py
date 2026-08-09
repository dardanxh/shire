"""engine_config: batch_checks toggle + light_model tier (token efficiency)

`batch_checks` consolidates a repo's/MR's principle checks and MR hobit reviews into one
Claude session per batch instead of one per check. `light_model` routes lightweight kinds
(classification, news, distillation) to a cheaper model.

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-08-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4f5a6b7c8d9"
down_revision: str | Sequence[str] | None = "d3e4f5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "engine_config",
        sa.Column("batch_checks", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "engine_config",
        sa.Column("light_model", sa.String(length=64), nullable=False, server_default="haiku"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("engine_config", "light_model")
    op.drop_column("engine_config", "batch_checks")
