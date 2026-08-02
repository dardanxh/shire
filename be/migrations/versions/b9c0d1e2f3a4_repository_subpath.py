"""monorepo support: repositories.subpath joins the natural key

A record can focus analysis on one subdirectory of a repo. Empty string = whole repo (the
previous behavior; NULLs would not dedupe in the unique constraint, hence ''). The unique
constraint widens so the same provider/owner/name can be onboarded once per subdirectory —
sibling records share the clone on disk, which stays keyed by provider/owner/name.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-08-02 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b9c0d1e2f3a4"
down_revision: str | Sequence[str] | None = "a8b9c0d1e2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "repositories",
        sa.Column("subpath", sa.String(length=512), nullable=False, server_default=""),
    )
    op.drop_constraint("uq_repo_coordinates", "repositories", type_="unique")
    op.create_unique_constraint(
        "uq_repo_coordinates", "repositories", ["provider", "owner", "name", "subpath"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_repo_coordinates", "repositories", type_="unique")
    op.create_unique_constraint(
        "uq_repo_coordinates", "repositories", ["provider", "owner", "name"]
    )
    op.drop_column("repositories", "subpath")
