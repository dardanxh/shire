"""developments: keep the previously-reviewed cursor

`prev_reviewed_commit_sha` remembers where the review cursor sat before the last "mark
reviewed", so an up-to-date card can still show the just-reviewed window (collapsed)
instead of losing it entirely.

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-08-02 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: str | Sequence[str] | None = "c0d1e2f3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "repositories",
        sa.Column("prev_reviewed_commit_sha", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("repositories", "prev_reviewed_commit_sha")
