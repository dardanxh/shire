"""watchlist + daily digest: repositories.watched + last_reviewed_commit_sha

`watched` marks repos the user follows; the digest shows what changed since
`last_reviewed_commit_sha` (the snapshot commit last marked reviewed) — a sha, not an
analysis id, because re-analyzing the same commit replaces the snapshot row and its id.

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-08-02 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c0d1e2f3a4b5"
down_revision: str | Sequence[str] | None = "b9c0d1e2f3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "repositories",
        sa.Column("watched", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "repositories",
        sa.Column("last_reviewed_commit_sha", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("repositories", "last_reviewed_commit_sha")
    op.drop_column("repositories", "watched")
