"""pulse: custom date intervals — window end date joins the summary cache key

`until_date` is NULL for open-ended windows ("since X until now", the preset ranges)
and set for custom from/to intervals, so the two cache independently.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-08-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e8"
down_revision: str | Sequence[str] | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("pulse_summaries", sa.Column("until_date", sa.Date(), nullable=True))
    op.drop_constraint("uq_pulse_summary_window", "pulse_summaries", type_="unique")
    op.create_unique_constraint(
        "uq_pulse_summary_window",
        "pulse_summaries",
        ["repository_id", "since_date", "until_date", "head_sha"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_pulse_summary_window", "pulse_summaries", type_="unique")
    op.create_unique_constraint(
        "uq_pulse_summary_window",
        "pulse_summaries",
        ["repository_id", "since_date", "head_sha"],
    )
    op.drop_column("pulse_summaries", "until_date")
