"""principles: per-repository assignment overrides

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-08-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4b5c6d7e8f9"
down_revision: str | Sequence[str] | None = "f3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "repository_principles",
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("principle_id", sa.Uuid(), nullable=False),
        sa.Column("assigned", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["principle_id"], ["principles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("repository_id", "principle_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("repository_principles")
