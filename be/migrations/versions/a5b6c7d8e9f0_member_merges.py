"""members: identity merges (fold alias emails into a primary identity)

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-07-29 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a5b6c7d8e9f0"
down_revision: str | Sequence[str] | None = "f4a5b6c7d8e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "member_merges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("alias_email", sa.String(length=320), nullable=False),
        sa.Column("primary_email", sa.String(length=320), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("alias_email"),
    )
    op.create_index("ix_member_merges_primary_email", "member_merges", ["primary_email"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_member_merges_primary_email", table_name="member_merges")
    op.drop_table("member_merges")
