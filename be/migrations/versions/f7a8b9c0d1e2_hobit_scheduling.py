"""hobits module: per-assignment run cadence + change-gate bookkeeping

Adds scheduling to the repository↔hobit assignment (cadence + last_checked_at) and records how
each run was triggered (manual vs scheduled), plus a `skipped_unchanged` run status carried in the
existing `status` string column (no enum/check constraint to alter).

Revision ID: f7a8b9c0d1e2
Revises: e1f2a3b4c5d6
Create Date: 2026-07-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f7a8b9c0d1e2"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "repository_hobits",
        sa.Column(
            "cadence", sa.String(length=64), nullable=False, server_default="manual"
        ),
    )
    op.add_column(
        "repository_hobits",
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "hobit_runs",
        sa.Column(
            "trigger", sa.String(length=16), nullable=False, server_default="manual"
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("hobit_runs", "trigger")
    op.drop_column("repository_hobits", "last_checked_at")
    op.drop_column("repository_hobits", "cadence")
