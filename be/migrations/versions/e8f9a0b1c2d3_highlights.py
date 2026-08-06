"""highlights: passages the user kept out of AI-written prose

The source is a generic pointer (`source_kind` + FK-less `source_id`), like `activity_log` —
targets span tables and the route is the SPA's business. `source_label` is denormalized so the
list renders without joining across domains.

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-08-06 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e8f9a0b1c2d3"
down_revision: str | Sequence[str] | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "highlights",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source_kind", sa.String(length=64), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("source_label", sa.String(length=300), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_highlights_created_at", "highlights", ["created_at"])
    op.create_index("ix_highlights_source_id", "highlights", ["source_id"])
    op.create_index("ix_highlights_repository_id", "highlights", ["repository_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_highlights_repository_id", table_name="highlights")
    op.drop_index("ix_highlights_source_id", table_name="highlights")
    op.drop_index("ix_highlights_created_at", table_name="highlights")
    op.drop_table("highlights")
